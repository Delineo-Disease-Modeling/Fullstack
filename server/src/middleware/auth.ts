import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  deleteSessionTokenCookie,
  setSessionTokenCookie,
  validateSessionToken
} from '../lib/session.js';

export const auth = async (c: Context, next: Next) => {
  const cookie = getCookie(c);
  const session = await validateSessionToken(cookie['session']);

  if (!session) {
    c.set('user', undefined);
    deleteSessionTokenCookie(c);
    return next();
  }

  setSessionTokenCookie(c, cookie['session']);
  c.set('user', session.user);

  return next();
};
