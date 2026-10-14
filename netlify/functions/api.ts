import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { ApiError, handle, type Mailer } from '../../src/shared/logic';
import { SupabaseDb } from '../../src/shared/supabase-db';
import type { Person } from '../../src/shared/types';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Correo saliente (SMTP). Si faltan las variables, la app funciona igual pero no envía correos. */
function buildMailer(req: Request): Mailer | undefined {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return undefined;
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const from = process.env.SMTP_FROM || `Conexión DBEE <${user}>`;
  const siteUrl = process.env.SITE_URL || process.env.URL || new URL(req.url).origin;
  return { siteUrl, send: async (m) => { await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text }); } };
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'El servidor no tiene configurada la conexión con Supabase.' });

  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Inicia sesión para continuar.' });

    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error } = await sb.auth.getUser(token);
    const email = auth?.user?.email?.toLowerCase();
    if (error || !email) return json(401, { error: 'Tu sesión venció. Vuelve a iniciar sesión.' });

    const db = new SupabaseDb(sb);
    const me = (await db.all<Person>('people')).find((p) => p.email.toLowerCase() === email);
    if (!me) return json(403, { error: 'Tu correo no está en la lista del equipo. Escríbele a Admin.' });

    const { action, payload } = (await req.json()) as { action: string; payload?: unknown };
    return json(200, await handle(db, me, String(action), payload ?? {}, new Date(), buildMailer(req)));
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.message, code: e.code });
    console.error(e);
    return json(500, { error: 'Algo salió mal en el servidor. Intenta de nuevo.' });
  }
};

export const config = { path: '/api' };
