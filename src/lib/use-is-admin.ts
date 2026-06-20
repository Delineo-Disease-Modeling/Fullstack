'use client';

import { useEffect, useState } from 'react';

// Whether the current session is an admin (per DELINEO_ADMIN_EMAILS), used to
// gate admin-only UI like delete controls. Server still enforces on each route.
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active) setIsAdmin(Boolean(json?.data?.isAdmin));
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return isAdmin;
}
