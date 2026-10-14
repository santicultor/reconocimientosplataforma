import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import type { BootstrapData, Cycle } from '../shared/types';

interface AppCtx {
  data: BootstrapData | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** cambia con cada cambio de usuario en la demo, para reiniciar pantallas */
  epoch: number;
  bumpEpoch: () => void;
}
const Ctx = createContext<AppCtx>(null as never);
export const useApp = () => useContext(Ctx);
/** Datos garantizados (dentro de las rutas protegidas). */
export const useData = () => useContext(Ctx).data as BootstrapData;

export function AppProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const d = await api<BootstrapData>('bootstrap');
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (status !== 'in') { setData(null); return; }
    setData(null);
    refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 25_000);
    return () => { alive.current = false; clearInterval(t); };
  }, [status, epoch, refresh]);

  return <Ctx.Provider value={{ data, error, refresh, epoch, bumpEpoch: () => setEpoch((e) => e + 1) }}>{children}</Ctx.Provider>;
}

export function phaseRoute(cycle: Cycle | null): string | null {
  switch (cycle?.status) {
    case 'nominations': return '/nominar';
    case 'voting': return '/muro';
    case 'published': return '/resultados';
    default: return null;
  }
}

export function phaseLabel(cycle: Cycle | null): string | null {
  switch (cycle?.status) {
    case 'nominations': return 'Nominar';
    case 'voting': return 'Votar';
    case 'published': return 'Resultados';
    default: return null;
  }
}
