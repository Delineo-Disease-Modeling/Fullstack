import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const isSecureOrigin = baseURL.startsWith('https://');

const trustedOrigins = Array.from(
  new Set([
    baseURL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
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
