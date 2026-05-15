import { create } from 'zustand';

interface AuthUser {
  id: string;
  privyId: string;
  walletAddress: string | null;
  email: string | null;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: 'client' | 'freelancer' | 'both';
  isOnboarded: boolean;
  isVerified: boolean;
  badgeTier: 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
  workScore: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => set({ user: null, isLoading: false }),
}));
