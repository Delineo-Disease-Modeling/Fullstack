import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CachedUser = {
  id: string;
  name: string;
  email: string;
  organization: string;
};

type AuthStore = {
  user: CachedUser | null;
  setUser: (user: CachedUser | null) => void;
};

const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user })
    }),
    { name: 'delineo-auth' }
  )
);

export default useAuthStore;
