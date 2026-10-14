import { ApiError } from '../shared/errors';
import { supabase } from './supabase';

export const DEMO = import.meta.env.VITE_DEMO === '1';

export async function api<T = any>(action: string, payload: unknown = {}): Promise<T> {
  if (DEMO) {
    const { demoCall } = await import('./demo');
    return demoCall(action, payload) as Promise<T>;
  }
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch('/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión. Revisa tu internet e intenta de nuevo.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'Algo salió mal. Intenta de nuevo.', body.code);
  return body as T;
}
