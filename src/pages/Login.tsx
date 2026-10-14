import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

type Mode = 'in' | 'up' | 'code-ask' | 'code-enter';

export default function Login() {
  const { status, signIn, verifyCode, signInPassword, signUpPassword, setNewPassword, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (h.get('error_code') || h.get('error')) {
      setError('El enlace del correo ya no sirve. Entra con tu contraseña o pide un código nuevo.');
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const run = async (fn: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const submitIn = (e: FormEvent) => { e.preventDefault(); void run(() => signInPassword(email, password)); };
  const submitUp = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Tu contraseña debe tener al menos 8 caracteres.'); return; }
    void run(() => signUpPassword(email, password));
  };
  const sendCode = () => run(async () => { await signIn(email.trim()); setMode('code-enter'); setWait(60); });
  const submitCode = (e: FormEvent) => { e.preventDefault(); void run(() => verifyCode(email, code)); };

  const submitNew = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Tu contraseña debe tener al menos 8 caracteres.'); return; }
    void run(() => setNewPassword(password));
  };

  const go = (m: Mode) => { setMode(m); setError(''); setPassword(''); setCode(''); };

  const emailField = (
    <>
      <label htmlFor="email">Tu correo institucional</label>
      <input
        id="email" type="email" required autoComplete="email" inputMode="email"
        placeholder="nombre.apellido@unisabana.edu.co"
        value={email} onChange={(e) => setEmail(e.target.value)}
      />
    </>
  );
  const err = error && <p className="error" role="alert">{error}</p>;

  return (
    <div className="sky-bg center-screen login">
      <div className="login-card">
        <p className="mono-label">Reconocimientos DBEE</p>
        <h1 className="display huge">Conexión</h1>
        <p className="lema">un sistema para hacer visible lo invisible</p>

        {status === 'password' && (
          <form onSubmit={submitNew}>
            <p><b>Ya entraste.</b> Ahora inventa tu contraseña para la próxima vez.</p>
            <label htmlFor="npw">Nueva contraseña (mínimo 8 caracteres)</label>
            <input id="npw" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {err}
            <button className="btn gold block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button>
            <p className="hint"><button type="button" className="link" onClick={() => void signOut()}>Cancelar</button></p>
          </form>
        )}

        {status !== 'password' && mode === 'in' && (
          <form onSubmit={submitIn}>
            {emailField}
            <label htmlFor="pw">Contraseña</label>
            <input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {err}
            <button className="btn gold block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <p className="hint">
              ¿Primera vez? <button type="button" className="link" onClick={() => go('up')}>Crear mi contraseña</button><br />
              <button type="button" className="link" onClick={() => go('code-ask')}>Olvidé mi contraseña</button>
            </p>
          </form>
        )}

        {status !== 'password' && mode === 'up' && (
          <form onSubmit={submitUp}>
            {emailField}
            <label htmlFor="pw">Inventa una contraseña (mínimo 8 caracteres)</label>
            <input id="pw" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {err}
            <button className="btn gold block" disabled={busy}>{busy ? 'Creando…' : 'Crear y entrar'}</button>
            <p className="hint">Solo entran personas del equipo DBEE. <button type="button" className="link" onClick={() => go('in')}>Ya tengo contraseña</button></p>
          </form>
        )}

        {status !== 'password' && mode === 'code-ask' && (
          <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
            {emailField}
            {err}
            <button className="btn gold block" disabled={busy}>{busy ? 'Enviando…' : 'Enviarme un código al correo'}</button>
            <p className="hint">Con el código entras sin contraseña. <button type="button" className="link" onClick={() => go('in')}>Volver</button></p>
          </form>
        )}

        {status !== 'password' && mode === 'code-enter' && (
          <form onSubmit={submitCode} className="sent" role="status">
            <p><b>Revisa tu correo</b> (y Spam). Te enviamos un código a <b>{email}</b>.</p>
            <label htmlFor="code">Código</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="123456"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            {err}
            <button className="btn gold block" disabled={busy || code.length < 6}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <p className="hint">
              <button type="button" className="link" disabled={wait > 0 || busy} onClick={() => void sendCode()}>
                {wait > 0 ? `Reenviar código en ${wait} s` : 'Reenviar código'}
              </button>
              {' · '}
              <button type="button" className="link" onClick={() => go('in')}>Volver</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
