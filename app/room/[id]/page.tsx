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
  const [showResult, setShowResult] = useState(false);
  const [copied, setCopied] = useState(false);

  // ★長押し用のState
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- データ取得 ---
  const fetchRoomData = useCallback(async () => {
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

    const { data: winner } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('rank', 1)
      .single();
    setWinnerData(winner);

    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);
    setParticipantCount(count || 0);

    const { data: allMembers } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .not('rank', 'is', null)
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

  const copyResultText = () => {
    let text = `🏆 早起きレース結果 🏆\n\n`;
    leaderboard.forEach((p) => {
      const time = new Date(p.woke_up_at!).toLocaleTimeString('ja-JP');
      text += `${p.rank}位: ${p.nickname} (${time})\n`;
      text += `「${p.comment || '...'}」\n\n`;
    });
    text += `#EarlyRisingRace\n${window.location.href}`;
    navigator.clipboard.writeText(text);
    alert('結果をコピーしました！');
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
    setLoading(false);
  };

  // ★長押し制御ロジック
  const startPress = () => {
    if (loading) return;
    setIsPressing(true);
    // 2秒(2000ms)押し続けたら発火
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
  // UI 分岐
  // ------------------------------------------

  // 1. 未参加
  if (!myId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-green-400 p-6 font-mono">
        <h2 className="text-2xl font-bold mb-4">WHO ARE YOU?</h2>
        <div className="mb-8 text-gray-500 border border-gray-800 px-4 py-2 rounded-full text-sm">
          Entry: <span className="text-white font-bold text-lg">{participantCount}</span> Racers
        </div>
        <input
          type="text"
          placeholder="NICKNAME"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full max-w-xs bg-gray-900 border-2 border-green-500 text-white text-xl p-4 mb-6 text-center outline-none"
        />
        <button onClick={joinRace} disabled={loading} className="w-full max-w-xs bg-white text-black text-xl font-bold py-4 hover:bg-gray-200">
          ENTER RACE
        </button>
      </main>
    );
  }

  // 2. 参加済み & 寝てる -> ★長押しボタン画面
  if (myData && !myData.woke_up_at) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4 font-mono relative select-none">
        <div className="absolute top-4 right-4">
          <button 
            onClick={copyInviteLink} 
            className="bg-gray-800 text-xs px-3 py-2 rounded border border-gray-600 active:bg-gray-700"
          >
            {copied ? 'COPIED!' : '🔗 INVITE URL'}
          </button>
        </div>

        {winnerData && (
          <div className="absolute top-20 w-full text-center">
             <p className="text-red-500 font-bold animate-pulse">SOMEONE IS AWAKE...</p>
             <p className="text-xl font-bold text-red-500">1位: {winnerData.nickname}</p>
          </div>
        )}
        
        {/* 長押しボタン */}
        <div 
          className="relative w-64 h-64 rounded-full overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.6)] border-4 border-red-400 cursor-pointer"
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
        >
          {/* 背景の赤色（常時表示） */}
          <div className="absolute inset-0 bg-red-900"></div>

          {/* ゲージ（長押しで下から増える） */}
          <div 
            className="absolute bottom-0 left-0 w-full bg-red-600 transition-all duration-[2000ms] ease-linear"
            style={{ height: isPressing ? '100%' : '0%' }}
          ></div>

          {/* テキストレイヤー */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-3xl font-black transition-transform duration-100 ${isPressing ? 'scale-110' : 'scale-100'}`}>
              HOLD<br/>TO WAKE
            </span>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <p className="text-green-400 font-bold text-lg">{myData.nickname}</p>
          <p className="text-gray-500 text-sm">
            {isPressing ? "KEEP HOLDING..." : "LONG PRESS BUTTON"}
          </p>
        </div>
      </main>
    );
  }

  // 3. 起床済み -> 結果入力画面
  if (myData && myData.woke_up_at) {
    const isWinner = myData.rank === 1;
    return (
      <main className={`flex min-h-screen flex-col items-center justify-center p-6 font-mono ${isWinner ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-white'}`}>
        <h1 className="text-6xl font-black mb-2">{myData.rank}<span className="text-2xl">位</span></h1>
        <p className="font-bold mb-8">{myData.nickname}</p>
        
        {!isWinner && winnerData?.comment && (
          <div className="w-full max-w-sm bg-black border-2 border-yellow-500 p-4 mb-8 text-yellow-500 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">MESSAGE FROM KING:</p>
            <p className="text-lg font-bold">"{winnerData.comment}"</p>
          </div>
        )}

        {!isCommentSent ? (
          <div className="w-full max-w-sm">
            <p className="mb-2 font-bold text-sm">{isWinner ? '敗者へ一言' : '言い訳'}</p>
            <textarea
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className={`w-full p-3 text-black font-bold outline-none border-4 ${isWinner ? 'bg-white border-black' : 'bg-gray-200 border-gray-700'}`}
            />
            <button
              onClick={sendComment}
              className={`w-full mt-4 py-4 font-black text-xl border-4 ${isWinner ? 'bg-black text-white' : 'bg-red-600 text-white'}`}
            >
              SEND
            </button>
          </div>
        ) : (
          <div className="mt-8 text-center w-full max-w-xs">
            <p className="text-2xl font-black mb-6 animate-pulse">WAITING FOR OTHERS...</p>
            <button 
              onClick={() => setShowResult(true)}
              className={`w-full py-4 font-bold border-4 ${isWinner ? 'border-black hover:bg-white/20' : 'border-white hover:bg-white/10'}`}
            >
              SHOW LEADERBOARD
            </button>
          </div>
        )}
      </main>
    );
  }

  // 4. リザルト画面
  if (showResult) {
    return (
      <main className="flex min-h-screen flex-col items-center bg-black text-white p-4 font-mono">
        <h2 className="text-3xl font-black text-green-400 mb-8 mt-4 tracking-widest">RANKING</h2>
        
        <div className="w-full max-w-md space-y-4 mb-8">
          {leaderboard.map((user) => {
            const isMe = user.id === myId;
            const isFirst = user.rank === 1;
            const time = new Date(user.woke_up_at!).toLocaleTimeString('ja-JP');

            return (
              <div 
                key={user.id} 
                className={`p-4 border-l-8 ${isFirst ? 'bg-yellow-900 border-yellow-500' : 'bg-gray-900 border-gray-600'} ${isMe ? 'ring-2 ring-white' : ''}`}
              >
                <div className="flex justify-between items-baseline mb-2">
                  <span className={`text-2xl font-black ${isFirst ? 'text-yellow-400' : 'text-gray-400'}`}>
                    #{user.rank}
                  </span>
                  <span className="text-sm text-gray-400">{time}</span>
                </div>
                <div className="font-bold text-xl mb-1">{user.nickname}</div>
                <div className={`text-sm italic ${isFirst ? 'text-yellow-200' : 'text-gray-300'}`}>
                  "{user.comment || '...'}"
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={copyResultText}
          className="w-full max-w-md bg-white text-black font-bold py-4 text-xl mb-12 hover:bg-gray-200 active:scale-95 transition-transform"
        >
          COPY RESULT (SNS)
        </button>
      </main>
    );
  }

  return <div className="bg-black min-h-screen"></div>;
}