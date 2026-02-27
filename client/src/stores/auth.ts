import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DB_URL } from '../env';

type User = {
  id: string;
  name: string;
  email: string;
  organization: string;
};

interface AuthStore {
  user: User | null;
  register: (formdata: any) => Promise<void>;
  login: (formdata: any) => Promise<void>;
  logout: () => Promise<void>;
  validate: () => Promise<void>;
}

async function getErrorMessage(res: Response, fallback: string) {
  try {
    const json = await res.json();
    if (typeof json?.message === 'string' && json.message.trim()) {
      return json.message;
    }
  } catch {
    // Ignore JSON parse errors and fall back below.
  }

  if (res.status === 503) {
    return 'Database is unavailable. Please start PostgreSQL and try again.';
  }

  return `${fallback} (${res.status})`;
}

const useAuth = create(
  persist<AuthStore>(
    (set) => ({
      user: null,
      register: async (formdata) => {
        const res = await fetch(`${DB_URL}auth/register`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formdata)
        });

        if (!res.ok) {
          throw new Error(await getErrorMessage(res, 'Registration failed'));
        }

        const json = await res.json();
        set({ user: json['data'] });
      },
      login: async (formdata) => {
        const res = await fetch(`${DB_URL}auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formdata),
        });

        if (!res.ok) {
          throw new Error(await getErrorMessage(res, 'Login failed'));
        }

        const json = await res.json();
        set({ user: json['data'] });
      },
      logout: async () => {
        const res = await fetch(`${DB_URL}auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
        });

        if (!res.ok) {
          throw new Error(await getErrorMessage(res, 'Logout failed'));
        }

        await res.json().catch(() => null);
        set({ user: null });
      },
      validate: async () => {
        try {
          const res = await fetch(`${DB_URL}auth/validate-session`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
          });

          if (!res.ok) {
            set({ user: null });
          }
        } catch {
          set({ user: null });
        }
      }
    }),
    {
      name: 'user',
    }
  )
);


export default useAuth;
