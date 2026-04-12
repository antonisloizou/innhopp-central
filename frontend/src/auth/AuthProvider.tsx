import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

type ImpersonatorSession = {
  account_id: number;
  email: string;
  full_name: string;
  roles: string[];
};

export type AuthSession = ImpersonatorSession & {
  impersonator?: ImpersonatorSession;
};

type LoginResponse = {
  authorization_url: string;
};

type AuthContextValue = {
  user: AuthSession | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  startLogin: (redirectTo?: string) => Promise<void>;
  impersonateParticipant: (participantId: number) => Promise<void>;
  impersonateNewUser: () => Promise<void>;
  stopImpersonating: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isUnauthorized = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 401;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const session = await apiRequest<AuthSession>('/auth/session');
      setUser(session);
    } catch (error) {
      if (!isUnauthorized(error)) {
        throw error;
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      try {
        await refreshSession();
      } finally {
        setIsLoading(false);
      }
    };

    void loadSession();
  }, []);

  const startLogin = useCallback(async (redirectTo?: string) => {
    const redirectParam = typeof redirectTo === 'string' && redirectTo.trim()
      ? `?redirect_to=${encodeURIComponent(redirectTo.trim())}`
      : '';
    const response = await apiRequest<LoginResponse>(`/auth/login${redirectParam}`);
    window.location.assign(response.authorization_url);
  }, []);

  const impersonateParticipant = useCallback(async (participantId: number) => {
    const session = await apiRequest<AuthSession>('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ participant_id: participantId })
    });
    setUser(session);
  }, []);

  const impersonateNewUser = useCallback(async () => {
    const session = await apiRequest<AuthSession>('/auth/impersonate-new-user', {
      method: 'POST'
    });
    setUser(session);
  }, []);

  const stopImpersonating = useCallback(async () => {
    const session = await apiRequest<AuthSession>('/auth/stop-impersonation', {
      method: 'POST'
    });
    setUser(session);
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        refreshSession,
        startLogin,
        impersonateParticipant,
        impersonateNewUser,
        stopImpersonating,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
