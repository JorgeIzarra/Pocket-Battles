import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { getSubscription } from '../lib/api';

export function useSubscription() {
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setIsPremium(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getSubscription(token);
      setIsPremium(data.isPremium);
    } catch {
      // silencioso — el usuario simplemente no es premium
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    if (isLoaded) refresh();
  }, [isLoaded, refresh]);

  return { isPremium, loading, refresh };
}
