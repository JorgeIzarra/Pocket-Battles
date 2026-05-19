import { useEffect, useState } from 'react';
import { getRoomState, type RoomState } from '../lib/api';

export function useRoom(code: string, intervalMs = 2000) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    let active = true;

    async function poll() {
      try {
        const data = await getRoomState(code);
        if (active) setRoom(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Error');
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [code, intervalMs]);

  return { room, error };
}
