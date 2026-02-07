import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma.js';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:1890',
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

  trustedOrigins: [
    'http://localhost:5173',
    'https://coviddev.isi.jhu.edu',
    'http://coviddev.isi.jhu.edu',
    'https://covidweb.isi.jhu.edu',
    'http://covidweb.isi.jhu.edu'
  ],

  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true
    }
  }
});
