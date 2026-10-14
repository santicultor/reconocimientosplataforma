import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useData } from '../lib/app';
import { Avatar } from '../ui/Avatar';
import { burst, Spinner, useToast } from '../ui/bits';
import { PRIZES, monthName, valueByKey } from '../shared/constants';
import { reducedMotion } from '../lib/format';
import type { ResultsData } from '../shared/types';

function CountUp({ to }: { to: number }) {
  const v = useMotionValue(reducedMotion() ? to : 0);
  const text = useTransform(v, (x) => Math.round(x).toString());
  useEffect(() => { if (!reducedMotion()) { const a = animate(v, to, { duration: 1.6, ease: 'easeOut', delay: 0.5 }); return () => a.stop(); } }, [to, v]);
  return <motion.span>{text}</motion.span>;
}

export default function Results() {
  const { me } = useData();
  const toast = useToast();
  const [r, setR] = useState<ResultsData | null>(null);
  const [prize, setPrize] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<ResultsData>('results').then((d) => { setR(d); setPrize(d.myPrize); burst('big'); }).catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line

  if (!r) return <div className="page"><Spinner /></div>;
  const value = valueByKey(r.cycle.value_key);
  const top = Math.max(1, ...r.ranking.map((x) => x.votes));
  // Podio: el primer lugar al centro
  const order = r.winners.length === 3 ? [r.winners[1], r.winners[0], r.winners[2]] : r.winners.length === 2 ? [r.winners[1], r.winners[0]] : r.winners;

  const choose = async (key: string) => {
    setSaving(true);
    try { await api('choosePrize', { prize: key }); setPrize(key); burst('soft'); toast('Tu premio quedó registrado. Admin ya lo puede ver.'); }
    catch (e) { toast((e as Error).message, 'error'); }
    setSaving(false);
  };

  return (
    <section className="results page">
      <p className="mono-label">{monthName(r.cycle.month)} {r.cycle.year} · {value.emoji} {value.name}</p>
      <h1 className="display huge">Ellas y ellos hicieron visible lo invisible</h1>

      <div className="podium">
        {order.map((w) => (
          <motion.div
            key={w.person.id} className={`pod pos-${w.position}`}
            initial={reducedMotion() ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: w.position === 1 ? 0.5 : 0.2, duration: 0.7 }}
          >
            <Avatar person={w.person} size={w.position === 1 ? 120 : 96} className="gold-ring" />
            <h2 className="display">{w.person.full_name}</h2>
            <p className="cargo">{w.person.cargo}</p>
            <p className="votes"><CountUp to={w.votes} /> {w.votes === 1 ? 'voto' : 'votos'}</p>
            <div className="pod-block"><span>{w.position}</span></div>
          </motion.div>
        ))}
      </div>

      <div className="quotes">
        {r.winners.map((w) => w.quotes[0] && (
          <blockquote key={w.person.id}>
            <p>“{w.quotes[0].what_did} {w.quotes[0].why_mattered}”</p>
            <footer>Sobre {w.person.full_name}</footer>
            {w.tie_note && <small className="tie">{w.tie_note}</small>}
          </blockquote>
        ))}
      </div>

      {r.myWinner && (
        <div className="prizes">
          <h2 className="display">Elige tu premio</h2>
          <p className="lead">{prize ? 'Ya quedó registrado. Si cambias de opinión, puedes elegir otro.' : 'Escoge una de las cuatro opciones. Admin verá tu elección.'}</p>
          <div className="prize-grid">
            {PRIZES.map((p) => (
              <button key={p.key} className={`prize ${prize === p.key ? 'on' : ''}`} disabled={saving} aria-pressed={prize === p.key} onClick={() => choose(p.key)}>
                <span className="prize-emoji" aria-hidden="true">{p.emoji}</span>
                <b>{p.name}</b><small>{p.detail}</small>
                {prize === p.key && <span className="check big">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bars">
        <h2 className="display">Así quedó la votación</h2>
        {r.ranking.map((x, i) => (
          <div key={x.person.id} className={`bar-row ${x.isWinner ? 'win' : ''}`}>
            <span className="bar-name">{x.person.full_name}{x.person.id === me.id ? ' (tú)' : ''}</span>
            <span className="bar-track"><motion.span initial={reducedMotion() ? false : { width: 0 }} animate={{ width: `${(x.votes / top) * 100}%` }} transition={{ delay: 0.3 + i * 0.06, duration: 0.8 }} /></span>
            <b>{x.votes}</b>
          </div>
        ))}
      </div>
      <Link to="/muro" className="link soft">Ver el muro de reconocidos</Link>
    </section>
  );
}
