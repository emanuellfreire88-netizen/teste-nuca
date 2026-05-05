import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: "Admin" | "Operator" | "Viewer";
  status: string;
  profile_photo: string | null;
  two_factor_enabled: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token: string, user: User) =>
        set({ token, user, isAuthenticated: true }),
      logout: () =>
        set({ token: null, user: null, isAuthenticated: false }),
      updateUser: (user: User) =>
        set({ user }),
    }),
    {
      name: "nuca-auth",
    }
  )
);
