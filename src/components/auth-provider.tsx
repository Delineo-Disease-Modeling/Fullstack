'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/auth-client';
import { claimGuestZonesForCurrentSession } from '@/lib/guest-zone-claims';
import useAuthStore from '@/stores/useAuthStore';

export default function AuthProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const setUser = useAuthStore((state) => state.setUser);
  const claimAttemptedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    const u = session?.user;
    setUser(
      u
        ? {
            id: u.id,
            name: u.name,
            email: u.email,
            organization: u.organization ?? ''
          }
        : null
    );
  }, [session, isPending, setUser]);

  useEffect(() => {
    if (isPending) return;

    const userId = session?.user?.id ?? null;
    if (!userId) {
      claimAttemptedForUserRef.current = null;
      return;
    }

    if (claimAttemptedForUserRef.current === userId) {
      return;
    }

    claimAttemptedForUserRef.current = userId;
    claimGuestZonesForCurrentSession().catch((error) => {
      console.error('Failed to save guest zones after login:', error);
      claimAttemptedForUserRef.current = null;
    });
  }, [session?.user?.id, isPending]);

  return <>{children}</>;
}
