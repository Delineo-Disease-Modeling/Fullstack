import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_DB_URL.replace(/\/$/, ''),
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
