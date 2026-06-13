import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { SessionUser } from '@/types';

const STORAGE_KEY = 'pathlab_user';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readStoredUser);
  const [loading] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    const { data: row, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !row) throw new Error('Invalid credentials');

    const { data: ok, error: verifyError } = await supabase.rpc('fn_verify_password', {
      plain: password,
      hash: row.password_hash,
    });
    if (verifyError || !ok) throw new Error('Invalid credentials');

    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', row.id);

    const session: SessionUser = {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      emp_code: row.emp_code,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
