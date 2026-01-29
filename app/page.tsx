'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const createRoom = async () => {
    setLoading(true);
    // 1. 部屋を作成
    const { data, error } = await supabase
      .from('rooms')
      .insert([{ status: 'waiting' }])
      .select()
      .single();

    if (error) {
      alert('エラーが発生しました');
      setLoading(false);
      return;
    }

    // 2. 作成された部屋のページへ遷移
    router.push(`/room/${data.id}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-green-400 p-4 font-mono">
      <h1 className="text-4xl md:text-6xl font-black mb-12 tracking-tighter animate-pulse text-center">
        EARLY<br />RISING<br />RACE
      </h1>
      
      <p className="text-gray-500 mb-8 text-sm">負けたら煽られる。敗者は言い訳する。</p>

      <button
        onClick={createRoom}
        disabled={loading}
        className="w-full max-w-xs bg-green-500 text-black text-2xl font-bold py-6 px-8 rounded-none hover:bg-green-400 disabled:opacity-50 transition-all active:scale-95 shadow-[0_0_20px_rgba(74,222,128,0.5)]"
      >
        {loading ? 'CREATING...' : 'RACE START'}
      </button>
    </main>
  );
}