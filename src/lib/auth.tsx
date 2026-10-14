import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { DEMO } from './api';

interface AuthCtx {
  status: 'loading' | 'out' | 'in';
  email: string | null;
  signIn: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInPassword: (email: string, password: string) => Promise<void>;
  signUpPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!DEMO);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) throw new Error('La app todavía no está conectada a Supabase.');
    const clean = email.trim().toLowerCase();
    const { data: ok, error: e1 } = await supabase.rpc('is_allowed_email', { _email: clean });
    if (e1) throw new Error('No pude verificar tu correo. Intenta de nuevo en un momento.');
    if (!ok) throw new Error('Ese correo no está en la lista del equipo. Si crees que es un error, escríbele al comité.');
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: window.location.origin } });
    if (error) throw new Error('No pude enviar el enlace. Espera un minuto e intenta otra vez.');
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('La app todavía no está conectada a Supabase.');
    const token = code.replace(/\D/g, '');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
    if (error) throw new Error('Ese código no es válido o ya venció. Pide uno nuevo.');
  }, []);

  const checkAllowed = useCallback(async (clean: string) => {
    if (!supabase) throw new Error('La app todavía no está conectada a Supabase.');
    const { data: ok, error } = await supabase.rpc('is_allowed_email', { _email: clean });
    if (error) throw new Error('No pude verificar tu correo. Intenta de nuevo en un momento.');
    if (!ok) throw new Error('Ese correo no está en la lista del equipo. Si crees que es un error, escríbele al comité.');
  }, []);

  const signInPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('La app todavía no está conectada a Supabase.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error('Correo o contraseña incorrectos. Si es tu primera vez, usa «Crear mi contraseña».');
  }, []);

  const signUpPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('La app todavía no está conectada a Supabase.');
    const clean = email.trim().toLowerCase();
    await checkAllowed(clean);
    const { data, error } = await supabase.auth.signUp({ email: clean, password });
    if (error) {
      if (/registered|already/i.test(error.message)) throw new Error('Ese correo ya tiene contraseña. Entra con ella o usa «Olvidé mi contraseña».');
      throw new Error('No pude crear tu contraseña: ' + error.message);
    }
    if (!data.session) throw new Error('Tu cuenta se creó, pero falta confirmarla por correo. Avísale al comité.');
  }, [checkAllowed]);

  const signOut = useCallback(async () => { await supabase?.auth.signOut(); }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      status: DEMO ? 'in' : loading ? 'loading' : session ? 'in' : 'out',
      email: session?.user.email ?? null,
      signIn, verifyCode, signInPassword, signUpPassword, signOut,
    }),
    [loading, session, signIn, verifyCode, signInPassword, signUpPassword, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
