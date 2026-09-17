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

  // Roles can be changed by an administrator while this tab is open. Refresh
  // promptly when the user returns to the tab, and periodically while it is
  // active so navigation and role-gated UI follow the server's current view.
  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshSilently = () => {
      void refreshSession().catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    };

    window.addEventListener('focus', refreshSilently);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(refreshSilently, 30_000);

    return () => {
      window.removeEventListener('focus', refreshSilently);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [refreshSession, user?.account_id]);

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
