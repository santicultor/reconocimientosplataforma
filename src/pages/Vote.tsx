import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useApp, useData } from '../lib/app';
import { Avatar } from '../ui/Avatar';
import { burst, Countdown, Spinner, useBodyLock, useToast } from '../ui/bits';
import { firstName, fmtDateTime, hash, reducedMotion, rng } from '../lib/format';
import { jefaturaInfo, valueByKey } from '../shared/constants';
import type { Cycle, FinalistCard } from '../shared/types';

/** Durante la votación el Muro muestra a cada finalista con sus historias aprobadas. */
export default function Vote() {
  const { me, cycle, myVoteIds } = useData();
  const { refresh } = useApp();
  const c = cycle as Cycle;
  const toast = useToast();
  const [cards, setCards] = useState<FinalistCard[] | null>(null);
  const [votes, setVotes] = useState<string[]>(myVoteIds);
  const [open, setOpen] = useState<FinalistCard | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const urn = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => { api<FinalistCard[]>('finalists').then((r) => setCards(r.sort((a, b) => hash(a.person.id) - hash(b.person.id)))).catch((e) => toast(e.message, 'error')); }, []); // eslint-disable-line
  useEffect(() => setVotes(myVoteIds), [myVoteIds]);
  useBodyLock(!!open);

  const max = c.votes_per_person;
  const save = async (next: string[], msg: string) => {
    setBusy(true);
    try {
      const r = await api<{ myVoteIds: string[] }>('setVotes', { nomineeIds: next });
      setVotes(r.myVoteIds);
      burst('soft');
      toast(msg);
      refresh();
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  const cast = (id: string, name: string) => {
    if (votes.includes(id)) return toast('Ya votaste por esta persona.');
    if (max === 1) return save([id], `Tu voto por ${firstName(name)} quedó registrado. Puedes cambiarlo hasta el cierre.`);
    if (votes.length >= max) return toast(`Ya usaste tus ${max} votos. Quita uno para cambiarlo.`, 'error');
    return save([...votes, id], `Voto registrado por ${firstName(name)}.`);
  };
  const remove = (id: string) => save(votes.filter((v) => v !== id), 'Quitaste tu voto.');

  if (!cards) return <div className="page"><Spinner /></div>;
  const byId = Object.fromEntries(cards.map((f) => [f.person.id, f]));

  return (
    <section className="vote page">
      <div className="vote-head">
        <p className="mono-label">Votación · {valueByKey(c.value_key).emoji} {valueByKey(c.value_key).name}</p>
        <h1 className="display">Elige a quién reconoces</h1>
        <p className="lead">Toca una cara para leer su historia. Para votar, arrastra la cara hasta la urna.</p>
        <Countdown to={c.voting_close_at} label="Cierra la votación" />
        <p className="quota">Tus votos: <b>{votes.length} de {max}</b> · tu voto es secreto y puedes cambiarlo hasta el {fmtDateTime(c.voting_close_at)}</p>
      </div>

      <div className="finalists">
        {cards.map((f, i) => {
          const r = rng(hash(f.person.id));
          const mine = f.person.id === me.id;
          const voted = votes.includes(f.person.id);
          return (
            <div
              key={f.person.id} className="fin-slot"
              style={{ '--dur': `${6 + r() * 5}s`, '--delay': `${-r() * 6}s`, '--dx': `${Math.round((r() * 2 - 1) * 8)}px`, '--dy': `${Math.round((r() * 2 - 1) * 10)}px`, marginTop: i % 2 ? 18 : 0 } as CSSProperties}
            >
              <div className="bubble-drift">
                <motion.div
                  className={`fin ${voted ? 'voted' : ''}`}
                  drag={!mine && !busy} dragSnapToOrigin dragElastic={0.5} dragMomentum={false}
                  whileDrag={{ scale: 1.18, zIndex: 40 }}
                  onPointerDown={() => { moved.current = false; }}
                  onDragStart={() => { moved.current = true; setDragging(true); }}
                  onDragEnd={(_, info) => {
                    setDragging(false);
                    const el = urn.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const x = info.point.x - window.scrollX, y = info.point.y - window.scrollY;
                    if (x > rect.left - 30 && x < rect.right + 30 && y > rect.top - 30 && y < rect.bottom + 30) cast(f.person.id, f.person.full_name);
                  }}
                  onTap={() => { if (!moved.current) setOpen(f); }}
                  role="button" tabIndex={0} aria-label={`Ver la historia de ${f.person.full_name}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(f); } }}
                >
                  <Avatar person={f.person} size={104} />
                  {voted && <span className="check big">✓</span>}
                  <span className="fin-name"><b>{f.person.full_name}</b><small>{f.person.cargo}</small></span>
                  {mine && <span className="fin-tag">Eres finalista</span>}
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`urn ${dragging ? 'hot' : ''}`} ref={urn} aria-live="polite">
        <div className="urn-orb" aria-hidden="true">
          {votes.length ? <span>{votes.length}</span> : <span className="plus">＋</span>}
        </div>
        <p>{votes.length ? votes.map((v) => byId[v] && firstName(byId[v].person.full_name)).filter(Boolean).join(' · ') : 'Urna · suelta aquí tu voto'}</p>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="sheet-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} />
            <motion.div
              className="sheet" role="dialog" aria-modal="true" aria-label={`Historia de ${open.person.full_name}`}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={reducedMotion() ? { duration: 0.15 } : { type: 'spring', stiffness: 220, damping: 28 }}
            >
              <button className="sheet-x" onClick={() => setOpen(null)} aria-label="Cerrar">×</button>
              <div className="sheet-person">
                <Avatar person={open.person} size={84} />
                <div>
                  <h2 className="display">{open.person.full_name}</h2>
                  <p>{open.person.cargo}</p>
                  <span className="tag-j" style={{ '--c': jefaturaInfo(open.person.jefatura).color } as CSSProperties}>{open.person.jefatura}</span>
                </div>
              </div>
              <div className="stories">
                {open.quotes.map((q, i) => (
                  <article key={i} className="story">
                    <p className="story-value">{valueByKey(q.value_key).emoji} {valueByKey(q.value_key).name}</p>
                    <h4>¿Qué hizo?</h4><p>{q.what_did}</p>
                    <h4>¿Por qué importó?</h4><p>{q.why_mattered}</p>
                  </article>
                ))}
              </div>
              {open.person.id === me.id ? (
                <p className="note">Eres finalista: no puedes votar por ti, pero todo el equipo está leyendo tu historia.</p>
              ) : votes.includes(open.person.id) ? (
                <button className="btn ghost block" disabled={busy} onClick={() => { remove(open.person.id); setOpen(null); }}>Quitar mi voto</button>
              ) : (
                <button className="btn gold block" disabled={busy} onClick={() => { cast(open.person.id, open.person.full_name); setOpen(null); }}>
                  {max === 1 && votes.length ? `Cambiar mi voto a ${firstName(open.person.full_name)}` : `Votar por ${firstName(open.person.full_name)}`}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
