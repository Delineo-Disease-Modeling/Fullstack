import { auth } from '@/lib/auth';
import { unauthorized } from './responses';

export async function getSessionUserId(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user?.id ?? null;
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
