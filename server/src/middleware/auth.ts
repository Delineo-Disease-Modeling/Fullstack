import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { deleteSessionTokenCookie, setSessionTokenCookie, validateSessionToken } from '../lib/session.js';

export const auth = async (c: Context, next: Next) => {
  const cookie = getCookie(c);
  let session = null;
  try {
    session = await validateSessionToken(cookie['session']);
  } catch (_error) {
    // If session lookup fails (e.g., DB temporarily unavailable), keep request unauthenticated
    // instead of failing all routes such as lookup endpoints.
    c.set('user', undefined);
    deleteSessionTokenCookie(c);
    return next();
  }

  if (!session) {
    c.set('user', undefined);
    deleteSessionTokenCookie(c);
    return next();
  }

  setSessionTokenCookie(c, cookie['session']);
  c.set('user', session.user);

  return next();
};
