import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setState('sending');
    try { await signIn(email); setState('sent'); }
    catch (err) { setError((err as Error).message); setState('idle'); }
  };

  return (
    <div className="sky-bg center-screen login">
      <div className="login-card">
        <p className="mono-label">Reconocimientos DBEE</p>
        <h1 className="display huge">Conexión</h1>
        <p className="lema">un sistema para hacer visible lo invisible</p>
        {state === 'sent' ? (
          <div className="sent" role="status">
            <p><b>Revisa tu correo.</b></p>
            <p>Te enviamos un enlace a <b>{email}</b>. Ábrelo desde este mismo dispositivo para entrar.</p>
            <button className="link" onClick={() => setState('idle')}>Usar otro correo</button>
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
            <button className="btn gold block" disabled={state === 'sending'}>
              {state === 'sending' ? 'Enviando…' : 'Enviarme el enlace de acceso'}
            </button>
            <p className="hint">Sin contraseña: te llega un enlace al correo. Solo entran personas del equipo DBEE.</p>
          </form>
        )}
      </div>
    </div>
  );
}
