'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Participant = {
  id: string;
  nickname: string;
  woke_up_at: string | null;
  rank: number | null;
  comment: string | null;
};

export default function RoomPage() {
  const { id: roomId } = useParams();
  
  // 状態管理
  const [nickname, setNickname] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [myData, setMyData] = useState<Participant | null>(null);
  const [winnerData, setWinnerData] = useState<Participant | null>(null);
  const [leaderboard, setLeaderboard] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  
  const [commentText, setCommentText] = useState('');
  const [isCommentSent, setIsCommentSent] = useState(false);
  const [copied, setCopied] = useState(false);

  // 長押し用のState
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- データ取得 ---
  const fetchRoomData = useCallback(async () => {
    // 1. 自分のデータ
    const storedId = localStorage.getItem(`race_${roomId}_my_id`);
    setMyId(storedId);

    if (storedId) {
      const { data: me } = await supabase
        .from('participants')
        .select('*')
        .eq('id', storedId)
        .single();
      setMyData(me);
      if (me?.comment) setIsCommentSent(true);
    }

    // 2. 1位のデータ
    const { data: winner } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('rank', 1)
      .single();
    setWinnerData(winner);

    // 3. 参加人数とランキング
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);
    setParticipantCount(count || 0);

    const { data: allMembers } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .not('rank', 'is', null) // 起きている人のみ取得
      .order('rank', { ascending: true });
    
    if (allMembers) setLeaderboard(allMembers);

  }, [roomId]);

  useEffect(() => {
    fetchRoomData();
    const channel = supabase
      .channel('room-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
        fetchRoomData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRoomData]);

  // --- アクション ---
  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const joinRace = async () => {
    if (!nickname) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('participants')
      .insert([{ room_id: roomId, nickname: nickname }])
      .select()
      .single();

    if (!error && data) {
      localStorage.setItem(`race_${roomId}_my_id`, data.id);
      setMyId(data.id);
      setMyData(data);
      fetchRoomData();
    }
    setLoading(false);
  };

  const wakeUp = async () => {
    if (!myId) return;
    setLoading(true);
    await supabase.rpc('mark_woke_up', {
      p_room_id: roomId,
      p_participant_id: myId
    });
    setLoading(false);
  };

  const sendComment = async () => {
    if (!myId || !commentText) return;
    setLoading(true);
    const { error } = await supabase
      .from('participants')
      .update({ comment: commentText })
      .eq('id', myId);
    if (!error) setIsCommentSent(true);
    fetchRoomData();
    setLoading(false);
  };

  // 長押しロジック
  const startPress = () => {
    if (loading) return;
    setIsPressing(true);
    timerRef.current = setTimeout(() => {
      wakeUp();
    }, 2000);
  };

  const cancelPress = () => {
    setIsPressing(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // ------------------------------------------
  // UI レンダリング
  // ------------------------------------------

  // 1. 未参加 (白ベースのシンプルなフォーム)
  if (!myId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-gray-900 p-6 font-mono">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
          <h2 className="text-2xl font-black mb-6 text-center text-blue-600">ニックネーム入力</h2>
          
          <div className="mb-8 text-center">
             <span className="bg-blue-50 text-blue-700 px-4 py-1 rounded-full text-sm font-bold border border-blue-100">
               {participantCount} 人が参加中
             </span>
          </div>

          <input
            type="text"
            placeholder="NICKNAME"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full bg-gray-50 border-2 border-gray-200 focus:border-blue-500 focus:bg-white text-gray-900 text-xl p-4 mb-4 text-center rounded-xl outline-none transition-colors font-bold"
          />
          <button 
            onClick={joinRace} 
            disabled={loading} 
            className="w-full bg-blue-600 text-white text-lg font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            バトルに参加
          </button>
        </div>
      </main>
    );
  }

  // 2. 参加済み & 寝てる -> ★長押しボタン (白背景にオレンジのボタン)
  if (myData && !myData.woke_up_at) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white text-gray-900 p-4 font-mono relative select-none overflow-hidden">
        {/* 背景装飾 */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50"></div>

        <div className="absolute top-4 right-4 z-10">
          <button 
            onClick={copyInviteLink} 
            className="bg-white text-xs px-4 py-2 rounded-full border border-gray-200 shadow-sm font-bold text-gray-500 active:scale-95 transition-transform"
          >
            {copied ? '✅ COPIED!' : '🔗 INVITE URL'}
          </button>
        </div>
        
        <div className="relative z-10">
          <div 
            className="relative w-72 h-72 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform duration-100 shadow-[0_10px_40px_-10px_rgba(249,115,22,0.5)] bg-white"
            onMouseDown={startPress}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
          >
            {/* バックグラウンドリング */}
            <div className="absolute inset-0 rounded-full border-8 border-gray-100"></div>

            {/* 進行リング (Clip-pathなどで簡易表現、あるいは背景色変化) */}
            <div 
              className="absolute inset-0 rounded-full bg-orange-500 transition-all duration-[2000ms] ease-linear opacity-20"
              style={{ transform: `scale(${isPressing ? 1 : 0})`, opacity: isPressing ? 1 : 0 }}
            ></div>

            <div className="relative flex flex-col items-center">
              <span className={`text-3xl font-black text-orange-500 transition-all duration-200 ${isPressing ? 'scale-110' : 'scale-100'}`}>
                {isPressing ? "WAKING UP..." : "HOLD TO WAKE"}
              </span>
              <span className="text-gray-400 text-sm font-bold mt-2">長押しで起床</span>
            </div>
          </div>
          
          <div className="mt-16 text-center">
            <p className="text-gray-900 font-bold text-2xl mb-1">{myData.nickname}</p>
            <div className="inline-block bg-gray-100 px-3 py-1 rounded-full text-xs font-bold text-gray-500">
              ZZZ... SLEEPING
            </div>
          </div>
        </div>
      </main>
    );
  }

  // 3. 起床済み -> 結果入力 or ランキング
  if (myData && myData.woke_up_at) {
    const isWinner = myData.rank === 1;

    // A. コメント未送信 -> 入力フォーム
    if (!isCommentSent) {
      return (
        <main className={`flex min-h-screen flex-col items-center justify-center p-6 font-mono ${isWinner ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <div className="w-full max-w-md">
            <div className="text-center mb-10">
                <h1 className={`text-8xl font-black mb-2 ${isWinner ? 'text-amber-500' : 'text-gray-300'}`}>
                    {myData.rank}<span className="text-3xl text-gray-400">位</span>
                </h1>
                <p className="font-bold text-xl text-gray-700">{myData.nickname}</p>
            </div>
            
            {!isWinner && winnerData?.comment && (
              <div className="relative bg-white border border-amber-200 p-6 mb-10 rounded-2xl shadow-sm">
                <div className="absolute -top-3 left-6 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded">
                    👑 WINNER'S MESSAGE
                </div>
                <p className="text-lg font-bold text-gray-800 italic">"{winnerData.comment}"</p>
              </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
              <p className="mb-3 font-bold text-sm text-gray-500">{isWinner ? 'ねぼすけどもに煽りの一言' : '言い訳をどうぞ'}</p>
              <textarea
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full p-4 bg-gray-50 text-gray-900 font-bold border-2 border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-colors resize-none"
                placeholder="..."
              />
              <button
                onClick={sendComment}
                className={`w-full mt-4 py-4 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-95 ${
                    isWinner 
                    ? 'bg-amber-400 text-amber-950 hover:bg-amber-500 shadow-amber-200' 
                    : 'bg-gray-800 text-white hover:bg-gray-900 shadow-gray-300'
                }`}
              >
                送信
              </button>
            </div>
          </div>
        </main>
      );
    }

    // B. コメント送信済み -> ★暫定ランキング (見やすいリスト表示)
    return (
      <main className="flex min-h-screen flex-col items-center bg-gray-50 text-gray-900 p-4 font-mono">
        <div className="w-full max-w-lg mt-8 mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-black text-gray-800 tracking-tighter">早起きランキング</h2>
            <div className="text-sm font-bold text-gray-400">選手：{participantCount}名</div>
        </div>
        
        <div className="w-full max-w-lg space-y-3 mb-12">
          {Array.from({ length: participantCount }).map((_, i) => {
            const rank = i + 1;
            const user = leaderboard.find(u => u.rank === rank);
            
            // まだ起きていない順位
            if (!user) {
              return (
                <div key={rank} className="p-4 rounded-xl border-2 border-dashed border-gray-200 bg-transparent flex items-center opacity-60">
                   <span className="text-xl font-black text-gray-300 w-12 text-center">#{rank}</span>
                   <span className="text-sm font-bold text-gray-300">ねぼすけ...</span>
                </div>
              );
            }

            // 起きている人
            const isMe = user.id === myId;
            const isFirst = user.rank === 1;
            const time = new Date(user.woke_up_at!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute:'2-digit', second:'2-digit' });

            return (
              <div 
                key={user.id} 
                className={`
                    relative p-5 rounded-xl shadow-sm border transition-all
                    ${isFirst ? 'bg-amber-50 border-amber-200 shadow-amber-100 z-10 scale-105 my-6' : 'bg-white border-gray-100'}
                    ${isMe && !isFirst ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                `}
              >
                {isFirst && <div className="absolute -top-3 -right-2 bg-amber-400 text-white text-xs font-bold px-2 py-1 rounded shadow-sm">KING</div>}
                
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                      <span className={`text-2xl font-black italic ${isFirst ? 'text-amber-500' : 'text-gray-300'}`}>
                        #{user.rank}
                      </span>
                      <span className={`font-bold ${isFirst ? 'text-gray-900 text-lg' : 'text-gray-700'}`}>
                        {user.nickname}
                      </span>
                  </div>
                  <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">{time}</span>
                </div>
                
                <div className={`text-sm font-medium leading-relaxed pl-1 ${isFirst ? 'text-gray-800' : 'text-gray-500'}`}>
                    "{user.comment || '...'}"
                </div>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  return <div className="bg-white min-h-screen"></div>;
}