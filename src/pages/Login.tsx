import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setError(''); setBusy(true);
    try { await signIn(email.trim()); setState('sent'); setWait(60); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void send(); };

  return (
    <div className="sky-bg center-screen login">
      <div className="login-card">
        <p className="mono-label">Reconocimientos DBEE</p>
        <h1 className="display huge">Conexión</h1>
        <p className="lema">un sistema para hacer visible lo invisible</p>
        {state === 'sent' ? (
          <div className="sent" role="status">
            <p><b>Revisa tu correo.</b></p>
            <p>Te enviamos un enlace a <b>{email}</b>. Puede tardar un par de minutos en llegar.</p>
            <ul className="sent-tips">
              <li>Si no lo ves, revisa <b>Spam</b> o <b>Correo no deseado</b>.</li>
              <li>Ábrelo desde este mismo dispositivo y navegador.</li>
              <li>El enlace funciona una sola vez y vence en una hora.</li>
            </ul>
            {error && <p className="error" role="alert">{error}</p>}
            <p>
              <button className="link" disabled={wait > 0 || busy} onClick={() => void send()}>
                {busy ? 'Enviando…' : wait > 0 ? `Reenviar enlace en ${wait} s` : 'Reenviar enlace'}
              </button>
              {' · '}
              <button className="link" onClick={() => { setState('idle'); setWait(0); }}>Usar otro correo</button>
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Tu correo institucional</label>
            <input
              id="email" type="email" required autoComplete="email" inputMode="email"
              placeholder="nombre.apellido@unisabana.edu.co"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn gold block" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviarme el enlace de acceso'}
            </button>
            <p className="hint">Sin contraseña: te llega un enlace al correo. Solo entran personas del equipo DBEE.</p>
          </form>
        )}
      </div>
    </div>
  );
}
