import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { DB_URL } from '../env';

export const authClient = createAuthClient({
  baseURL: DB_URL.replace(/\/$/, ''),
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
