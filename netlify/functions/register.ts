import { createClient } from '@supabase/supabase-js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Crea la cuenta (ya confirmada) de una persona que esté en la lista del equipo. No envía correos. */
export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'El servidor no tiene configurada la conexión con Supabase.' });
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email || password.length < 8) return json(400, { error: 'Escribe tu correo y una contraseña de al menos 8 caracteres.' });

    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: ok } = await sb.rpc('is_allowed_email', { _email: email });
    if (!ok) return json(403, { error: 'Ese correo no está en la lista del equipo. Si crees que es un error, escríbele al comité.' });

    const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      if (/registered|already|exists/i.test(error.message))
        return json(409, { error: 'Ese correo ya tiene contraseña. Entra con ella o usa «Olvidé mi contraseña».' });
      return json(400, { error: 'No pude crear tu contraseña: ' + error.message });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Algo salió mal en el servidor. Intenta de nuevo.' });
  }
};

export const config = { path: '/api/register' };
