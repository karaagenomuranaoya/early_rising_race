'use client';
import { useState, useEffect, useCallback } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isCommentSent, setIsCommentSent] = useState(false);
  const [copied, setCopied] = useState(false); // コピー完了表示用

  // --- 初期化 & データ取得 ---
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
  }, [roomId]);

  useEffect(() => {
    fetchRoomData();
    
    // ★リアルタイム購読（ここが動くにはSQLの設定が必要）
    const channel = supabase
      .channel('room-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
        console.log('Change received!'); // デバッグ用
        fetchRoomData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchRoomData]);

  // --- 招待URLコピー機能 ---
  const copyInviteLink = () => {
    const url = window.location.href; // 現在のURL (room/[id])
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- アクション: 参加登録 ---
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
    }
    setLoading(false);
  };

  // --- アクション: 起床 ---
  const wakeUp = async () => {
    if (!myId) return;
    setLoading(true);
    const { error } = await supabase.rpc('mark_woke_up', {
      p_room_id: roomId,
      p_participant_id: myId
    });
    if (!error) fetchRoomData();
    setLoading(false);
  };

  // --- アクション: コメント送信 ---
  const sendComment = async () => {
    if (!myId || !commentText) return;
    setLoading(true);
    const { error } = await supabase
      .from('participants')
      .update({ comment: commentText })
      .eq('id', myId);
    if (!error) {
      setIsCommentSent(true);
      fetchRoomData();
    }
    setLoading(false);
  };

  // ------------------------------------------
  // UI
  // ------------------------------------------

  // 1. 未参加 -> エントリー画面
  if (!myId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-green-400 p-6 font-mono">
        <h2 className="text-2xl font-bold mb-8">WHO ARE YOU?</h2>
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

  // 2. 参加済み & 寝てる -> 起床ボタン待機画面
  if (myData && !myData.woke_up_at) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4 font-mono relative">
        
        {/* ★招待ボタンを追加 */}
        <div className="absolute top-4 right-4">
          <button 
            onClick={copyInviteLink} 
            className="bg-gray-800 text-xs px-3 py-2 rounded border border-gray-600 active:bg-gray-700"
          >
            {copied ? 'COPIED!' : '🔗 INVITE URL'}
          </button>
        </div>

        {/* 1位がいたら表示 */}
        {winnerData && (
          <div className="absolute top-20 w-full text-center">
             <p className="text-red-500 font-bold animate-pulse">SOMEONE IS AWAKE...</p>
             <p className="text-xl font-bold text-red-500">1位: {winnerData.nickname}</p>
          </div>
        )}
        
        <button
          onClick={wakeUp}
          disabled={loading}
          className="w-64 h-64 rounded-full bg-red-600 text-white text-3xl font-black shadow-[0_0_50px_rgba(220,38,38,0.6)] active:scale-95 transition-transform border-4 border-red-400 animate-pulse"
        >
          I'M<br />AWAKE!
        </button>
        
        <p className="mt-12 text-gray-500 text-center text-sm">
          この画面のまま寝ろ。<br/>
          起きた瞬間に押せ。
        </p>
      </main>
    );
  }

  // 3. 起床済み -> 結果画面
  if (myData && myData.woke_up_at) {
    const isWinner = myData.rank === 1;
    return (
      <main className={`flex min-h-screen flex-col items-center justify-center p-6 font-mono ${isWinner ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-white'}`}>
        <h1 className="text-6xl font-black mb-2">{myData.rank}<span className="text-2xl">位</span></h1>
        
        {/* 敗者には勝者のコメントを表示 */}
        {!isWinner && winnerData?.comment && (
          <div className="w-full max-w-sm bg-black border-2 border-yellow-500 p-4 mb-8 text-yellow-500 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">MESSAGE FROM KING:</p>
            <p className="text-lg font-bold">{winnerData.comment}</p>
          </div>
        )}

        {/* コメント入力 */}
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
          <div className="mt-8 text-center animate-pulse">
            <p className="text-2xl font-black">WAIT FOR RESULTS</p>
          </div>
        )}
      </main>
    );
  }

  return <div className="bg-black min-h-screen"></div>;
}