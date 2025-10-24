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

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json['message']);
        }

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

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json['message']);
        }

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

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json['message']);
        }

        set({ user: null });
      },
      validate: async () => {
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
      }
    }),
    {
      name: 'user',
    }
  )
);


export default useAuth;
