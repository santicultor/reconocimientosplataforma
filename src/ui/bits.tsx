import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import confetti from 'canvas-confetti';
import { reducedMotion } from '../lib/format';

// ---------- confeti ----------
export function burst(kind: 'soft' | 'big' = 'soft') {
  if (reducedMotion()) return;
  const colors = ['#F5C518', '#FFFFFF', '#6EA8FF', '#00387B'];
  if (kind === 'soft') {
    confetti({ particleCount: 60, spread: 70, startVelocity: 28, origin: { y: 0.7 }, colors, scalar: 0.9 });
  } else {
    const end = Date.now() + 1400;
    const tick = () => {
      confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  }
}

// ---------- avisos ----------
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: string }[]>([]);
  const push = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => <div key={i.id} className={`toast ${i.tone}`}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- cuenta regresiva ----------
export function Countdown({ to, label }: { to: string | null; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!to) return null;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <div className="countdown closed">{label}: plazo cumplido</div>;
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <div className="countdown" aria-label={`${label}: faltan ${d} días, ${h} horas y ${m} minutos`}>
      <span className="cd-label">{label}</span>
      <span className="cd-units">
        <b>{d}</b><i>d</i><b>{String(h).padStart(2, '0')}</b><i>h</i><b>{String(m).padStart(2, '0')}</b><i>min</i>
      </span>
    </div>
  );
}

// ---------- confirmación ----------
export function Confirm({ title, body, confirmLabel, onConfirm, onCancel, danger }: {
  title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="modal-body">{body}</div>
        <div className="row end">
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function useBodyLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [on]);
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" />{label}</div>;
}
