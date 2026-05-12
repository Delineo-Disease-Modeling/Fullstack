import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const isSecureOrigin = baseURL.startsWith('https://');

// Common dev ports the team uses across `pnpm dev`, parallel worktree
// instances, and Claude Code preview servers. Production hosts stay below.
const DEV_LOCALHOST_PORTS = [3000, 3001, 3002, 3007, 3008, 5173, 5174];
const devLocalhostOrigins = DEV_LOCALHOST_PORTS.flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`
]);

const trustedOrigins = Array.from(
  new Set([
    baseURL,
    ...devLocalhostOrigins,
    'https://coviddev.isi.jhu.edu',
    'http://coviddev.isi.jhu.edu',
    'https://covidweb.isi.jhu.edu',
    'http://covidweb.isi.jhu.edu'
  ])
);

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, {
    provider: 'postgresql'
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8
  },

  user: {
    additionalFields: {
      organization: {
        type: 'string',
        required: true,
        input: true
      }
    }
  },

  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24
  },

  trustedOrigins,

  advanced: {
    defaultCookieAttributes: {
      sameSite: isSecureOrigin ? 'none' : 'lax',
      secure: isSecureOrigin
    }
  }
});
