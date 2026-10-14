import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { phaseLabel, phaseRoute, useApp, useData } from './lib/app';
import { DEMO } from './lib/api';
import { supabaseConfigured } from './lib/supabase';
import { Spinner } from './ui/bits';
import { Avatar } from './ui/Avatar';
import Login from './pages/Login';
import Home from './pages/Home';
import Nominate from './pages/Nominate';
import Vote from './pages/Vote';
import Results from './pages/Results';
import Wall from './pages/Wall';
import Admin from './admin/Admin';

export default function App() {
  const { status } = useAuth();
  const { data, error, refresh } = useApp();

  if (!DEMO && !supabaseConfigured)
    return (
      <div className="sky-bg center-screen">
        <div className="card narrow">
          <h1 className="display">Falta conectar la base de datos</h1>
          <p>Agrega las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Netlify y vuelve a publicar. La guía paso a paso está en el archivo <code>GUIA.md</code>.</p>
        </div>
      </div>
    );
  if (status === 'loading') return <div className="sky-bg center-screen"><Spinner /></div>;
  if (status === 'out') return <Login />;
  if (error && !data)
    return (
      <div className="sky-bg center-screen">
        <div className="card narrow">
          <h1 className="display">No pude abrir tu cuenta</h1>
          <p>{error}</p>
          <button className="btn primary" onClick={refresh}>Intentar de nuevo</button>
          <SignOutButton />
        </div>
      </div>
    );
  if (!data) return <div className="sky-bg center-screen"><Spinner /></div>;
  return <Shell />;
}

function SignOutButton() {
  const { signOut } = useAuth();
  if (DEMO) return null;
  return <button className="btn ghost" onClick={signOut}>Cambiar de cuenta</button>;
}

function Shell() {
  const data = useData();
  const loc = useLocation();
  const route = phaseRoute(data.cycle);
  const label = phaseLabel(data.cycle);
  const isAdmin = loc.pathname.startsWith('/admin');
  const committee = data.me.role === 'committee';
  const voting = data.cycle?.status === 'voting';

  return (
    <div className={isAdmin ? 'paper-bg' : 'sky-bg'}>
      <header className={`topbar ${isAdmin ? 'light' : ''}`}>
        <NavLink to="/" className="brand" aria-label="Conexión, inicio">Conexión</NavLink>
        <nav aria-label="Principal">
          <NavLink to="/" end>Inicio</NavLink>
          {route && label && <NavLink to={route}>{label}</NavLink>}
          {committee && <NavLink to="/admin">Comité</NavLink>}
        </nav>
        <Me />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/nominar" element={data.cycle?.status === 'nominations' ? <Nominate /> : <Navigate to="/" replace />} />
          <Route path="/votar" element={<Navigate to="/muro" replace />} />
          <Route path="/muro" element={voting ? <Vote /> : <Wall />} />
          <Route path="/resultados" element={data.cycle?.status === 'published' ? <Results /> : <Navigate to="/" replace />} />
          <Route path="/admin/*" element={committee ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {DEMO && <DemoBar />}
    </div>
  );
}

function Me() {
  const data = useData();
  const { signOut } = useAuth();
  return (
    <div className="me">
      <Avatar person={data.me} size={32} ring={false} />
      <span className="me-name">{data.me.full_name.split(' ')[0]}</span>
      {!DEMO && <button className="link" onClick={signOut}>Salir</button>}
    </div>
  );
}

function DemoBar() {
  const { bumpEpoch } = useApp();
  const data = useData();
  const [people, setPeople] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [tools, setTools] = useState<typeof import('./lib/demo') | null>(null);
  useEffect(() => { import('./lib/demo').then((m) => { setTools(m); setPeople(m.demoPeople()); }); }, [data.cycle?.status]);
  if (!tools) return null;
  return (
    <div className="demobar" role="region" aria-label="Controles de demostración">
      <span className="tag">Demo</span>
      <label>
        Ver como
        <select
          value={data.me.id}
          onChange={(e) => { tools.setDemoUser(e.target.value); bumpEpoch(); }}
        >
          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.role === 'committee' ? ' · comité' : ''}</option>)}
        </select>
      </label>
      <button className="link" onClick={() => { if (confirm('¿Reiniciar la demostración? Se borran los cambios que hiciste.')) { tools.resetDemo(); bumpEpoch(); } }}>Reiniciar</button>
    </div>
  );
}
