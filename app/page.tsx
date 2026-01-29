'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const createRoom = async () => {
    setLoading(true);
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

    router.push(`/room/${data.id}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-gray-900 p-6 font-mono">
      <div className="text-center mb-16">
        <h1 className="text-5xl md:text-7xl font-black mb-4 tracking-tighter text-blue-600 drop-shadow-sm">
          早起きバトル
        </h1>
        <p className="text-gray-500 font-bold tracking-wide text-sm">早起きして友達を煽ろう</p>
      </div>

      <button
        onClick={createRoom}
        disabled={loading}
        className="w-full max-w-xs bg-white border-2 border-blue-600 text-blue-600 text-2xl font-black py-6 px-8 rounded-xl hover:bg-blue-600 hover:text-white disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-blue-100"
      >
        {loading ? 'CREATING...' : 'BATTLE START'}
      </button>
      
      <div className="mt-12 text-xs text-gray-400">
        GOOD MORNING, GOOD GAME.
      </div>
    </main>
  );
}