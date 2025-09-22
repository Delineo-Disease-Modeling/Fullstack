import { sha256 } from '@oslojs/crypto/sha2';
import { setCookie } from 'hono/cookie';
import { PrismaClient, type Session, type User } from '@prisma/client';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import type { Context } from 'hono';

const prisma = new PrismaClient();

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createSession(
  token: string,
  userId: string
): Promise<Session> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      user_id: userId
    }
  })

  return session;
}

export async function validateSessionToken(
  token: string
): Promise<Session & { user: User } | null> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

  const session = await prisma.session.findUnique({
    where: {
      id: sessionId
    },
    include: {
      user: true
    }
  });

  if (!session) {
    return null;
  }

  if (Date.now() - 1000 * 60 * 60 * 24 * 14 >= session.created_at.getTime()) {
    await prisma.session.delete({
      where: {
        id: sessionId
      }
    });

    return null;
  }

  return session;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await prisma.session.delete({
    where: {
      id: sessionId
    }
  });
}

export function setSessionTokenCookie(
  context: Context,
  token: string,
): void {
  setCookie(context, 'session', token, {
    httpOnly: true,
    sameSite: 'none',
    maxAge: 60 * 60 * 24 * 14,
    path: '/',
    secure: true
  });
}

export function deleteSessionTokenCookie(context: Context): void {
  setCookie(context, 'session', '', {
    httpOnly: true,
    sameSite: 'none',
    maxAge: 0,
    path: '/',
    secure: true
  });
}
