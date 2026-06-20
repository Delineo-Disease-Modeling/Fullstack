import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { unauthorized } from './responses';

export async function getSessionUserId(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user?.id ?? null;
}

export async function getSessionUser(
  headers: Headers
): Promise<{ id: string; email: string | null } | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) {
    return null;
  }
  return { id: session.user.id, email: session.user.email ?? null };
}

export async function isAdminSession(headers: Headers): Promise<boolean> {
  const user = await getSessionUser(headers);
  return isAdminEmail(user?.email);
}

export async function requireSessionUserId(headers: Headers): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const userId = await getSessionUserId(headers);

  if (!userId) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true, userId };
}
