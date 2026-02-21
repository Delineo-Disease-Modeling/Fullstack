'use client';

import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const baseURL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/auth`
    : `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/api/auth`;

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    inferAdditionalFields({
      user: {
        organization: {
          type: 'string'
        }
      }
    })
  ]
});

export const { signIn, signUp, signOut, useSession } = authClient;
