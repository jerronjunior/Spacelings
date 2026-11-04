import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { initApiBase, request, setToken } from './api';
import { load, remove, save } from './storage';
import type { Astronaut, User } from './types';

interface Session {
  token: string;
  user: User;
  astronaut: Astronaut | null;
}

interface AuthCtx {
  ready: boolean;
  session: Session | null;
  login: (email: string, password: string) => Promise<Session>;
  register: (body: { email: string; password: string; display_name: string; role: string; invite_code?: string }) => Promise<Session>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export const DEMO_ACCOUNTS = {
  astronaut: { email: 'astronaut@spacelings.demo', password: 'spacelings-demo' },
  control: { email: 'control@spacelings.demo', password: 'spacelings-demo' },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      await initApiBase();
      // The session is kept on the device so the astronaut app opens even without a connection.
      const s = await load<Session | null>('session', null);
      if (s) {
        setToken(s.token);
        setSession(s);
      }
      setReady(true);
    })();
  }, []);

  const accept = useCallback(async (r: any): Promise<Session> => {
    const s: Session = { token: r.access_token, user: r.user, astronaut: r.astronaut };
    setToken(s.token);
    await save('session', s);
    setSession(s);
    return s;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => accept(await request('/auth/login', { body: { email, password } })),
    [accept],
  );
  const register = useCallback(async (body: any) => accept(await request('/auth/register', { body })), [accept]);
  const logout = useCallback(async () => {
    setToken(null);
    await remove('session');
    setSession(null);
  }, []);

  return <Ctx.Provider value={{ ready, session, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
