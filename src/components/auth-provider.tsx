'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import useAuthStore from '@/stores/useAuthStore';

export default function AuthProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const setUser = useAuthStore((state) => state.setUser);

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

  return <>{children}</>;
}
