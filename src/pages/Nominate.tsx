import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useApp, useData } from '../lib/app';
import { Avatar } from '../ui/Avatar';
import { burst, useBodyLock, useToast } from '../ui/bits';
import { hash, reducedMotion, rng } from '../lib/format';
import {
  DEFAULT_PLACEHOLDERS_WHAT, DEFAULT_PLACEHOLDERS_WHY, JEFATURAS, MIN_CHARS, VALUES, jefaturaInfo, normalizeText, valueByKey,
} from '../shared/constants';
import type { Cycle, PublicPerson } from '../shared/types';

export default function Nominate() {
  const { me, people, cycle, myNominations } = useData();
  const { refresh } = useApp();
  const c = cycle as Cycle;
  const [q, setQ] = useState('');
  const [jef, setJef] = useState<string | null>(null);
  const [asList, setAsList] = useState(false);
  const [selected, setSelected] = useState<PublicPerson | null>(null);
  const toast = useToast();

  const candidates = useMemo(
    () => people.filter((p) => p.id !== me.id).sort((a, b) => hash(a.id) - hash(b.id)),
    [people, me.id],
  );
  const nominated = new Set(myNominations.map((n) => n.nominee_id));
  const used = myNominations.length;
  const full = used >= c.max_nominations;
  const matches = (p: PublicPerson) =>
    (!q || normalizeText(p.full_name).includes(normalizeText(q))) && (!jef || p.jefatura === jef);
  const anyFilter = !!q || !!jef;
  const matchCount = candidates.filter(matches).length;

  const choose = (p: PublicPerson) => {
    if (full) return toast(`Ya usaste tus ${c.max_nominations} nominaciones de este ciclo. ¡Gracias!`, 'error');
    if (nominated.has(p.id)) return toast('Ya nominaste a esta persona en este ciclo.', 'error');
    setSelected(p);
  };

  return (
    <section className="nominate">
      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search">
            <input
              type="search" placeholder="Buscar por nombre" value={q} aria-label="Buscar compañero por nombre"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="btn ghost small" onClick={() => setAsList((v) => !v)} aria-pressed={asList}>
            {asList ? 'Ver como cielo' : 'Ver como lista'}
          </button>
        </div>
        <div className="chips" role="group" aria-label="Filtrar por jefatura">
          <button className={`chip ${!jef ? 'on' : ''}`} onClick={() => setJef(null)}>Todas</button>
          {JEFATURAS.map((j) => (
            <button
              key={j.name} className={`chip ${jef === j.name ? 'on' : ''}`} style={{ '--c': j.color } as CSSProperties}
              onClick={() => setJef(jef === j.name ? null : j.name)} title={j.name}
            >
              <i className="swatch" />{j.short}
            </button>
          ))}
        </div>
        <p className="quota" aria-live="polite">
          Tus nominaciones: <b>{used} de {c.max_nominations}</b>
          {full ? ' · ¡Listo, gracias!' : anyFilter ? ` · ${matchCount} ${matchCount === 1 ? 'persona' : 'personas'}` : ''}
        </p>
      </div>

      {asList ? (
        <ul className="plist">
          {candidates.filter(matches).map((p) => (
            <li key={p.id}>
              <button onClick={() => choose(p)} disabled={nominated.has(p.id)}>
                {selected?.id === p.id ? <span className="avatar-slot" style={{ width: 48, height: 48 }} /> : (
                  <motion.span layoutId={`av-${p.id}`} className="lay"><Avatar person={p} size={48} /></motion.span>
                )}
                <span className="who"><b>{p.full_name}</b><small>{p.cargo}</small></span>
                <span className="tag-j" style={{ '--c': jefaturaInfo(p.jefatura).color } as CSSProperties}>{jefaturaInfo(p.jefatura).short}</span>
                {nominated.has(p.id) && <span className="check" aria-label="Ya nominado">✓</span>}
              </button>
            </li>
          ))}
          {!matchCount && <li className="empty">Nadie coincide con esa búsqueda. Prueba con otro nombre o quita el filtro.</li>}
        </ul>
      ) : (
        <Sky
          people={candidates} matches={matches} anyFilter={anyFilter} selectedId={selected?.id ?? null}
          nominated={nominated} onChoose={choose}
        />
      )}

      <AnimatePresence>
        {selected && (
          <NominateSheet
            key={selected.id} person={selected} cycle={c} used={used}
            onClose={() => setSelected(null)} onSent={refresh}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ---------------------------------------------------------------------------
// El cielo de caras
// ---------------------------------------------------------------------------

function Sky({ people, matches, anyFilter, selectedId, nominated, onChoose }: {
  people: PublicPerson[]; matches: (p: PublicPerson) => boolean; anyFilter: boolean;
  selectedId: string | null; nominated: Set<string>; onChoose: (p: PublicPerson) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Parallax suave con el puntero (y con la inclinación en Android)
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let raf = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { el.style.setProperty('--px', `${x}px`); el.style.setProperty('--py', `${y}px`); });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      set((e.clientX / window.innerWidth - 0.5) * -26, (e.clientY / window.innerHeight - 0.5) * -26);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      set(Math.max(-30, Math.min(30, e.gamma)) * -0.7, Math.max(-30, Math.min(30, e.beta - 45)) * -0.5);
    };
    window.addEventListener('pointermove', onMove);
    const needsPermission = typeof (window as any).DeviceOrientationEvent?.requestPermission === 'function';
    if (!needsPermission) window.addEventListener('deviceorientation', onTilt);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); window.removeEventListener('deviceorientation', onTilt); };
  }, []);

  const cell = w < 640 ? Math.max(108, Math.floor(w / 3)) : 138;
  const cols = Math.max(2, Math.floor(w / cell));
  const cw = w / cols;
  const rows = Math.ceil(people.length / cols);

  const layout = useMemo(
    () => people.map((p, i) => {
      const r = rng(hash(p.id));
      const size = Math.round((w < 640 ? 60 : 72) + r() * (w < 640 ? 22 : 26));
      const slack = Math.max(0, cw - size) / 2 - 6;
      const col = i % cols, row = Math.floor(i / cols);
      return {
        p, size,
        left: col * cw + cw / 2 + (r() * 2 - 1) * slack + (row % 2 ? cw * 0.12 : -cw * 0.04),
        top: row * (cw * 0.95) + cw / 2 + (r() * 2 - 1) * slack,
        dx: Math.round((r() * 2 - 1) * 14), dy: Math.round((r() * 2 - 1) * 18),
        dur: 7 + r() * 7, delay: -r() * 10, depth: 0.5 + r() * 1.1,
      };
    }),
    [people, cols, cw, w],
  );

  const height = rows * cw * 0.95 + cw * 0.6;

  return (
    <div className="sky-field" ref={ref} style={{ height: Math.max(height, 420) }} data-selecting={selectedId ? 'y' : 'n'}>
      {layout.map(({ p, size, left, top, dx, dy, dur, delay, depth }) => {
        const dim = (anyFilter && !matches(p)) || (!!selectedId && selectedId !== p.id);
        const done = nominated.has(p.id);
        return (
          <div
            key={p.id} className={`bubble ${dim ? 'dim' : ''} ${anyFilter && matches(p) ? 'hit' : ''}`}
            style={{ left, top, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, '--depth': depth } as CSSProperties}
          >
            <div className="bubble-par">
              <div className="bubble-drift" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--dur': `${dur}s`, '--delay': `${delay}s` } as CSSProperties}>
                {selectedId === p.id ? (
                  <span className="avatar-slot" style={{ width: size, height: size }} />
                ) : (
                  <motion.button
                    layoutId={`av-${p.id}`} className={`bubble-btn ${done ? 'done' : ''}`}
                    onClick={() => onChoose(p)} aria-label={`Nominar a ${p.full_name}, ${p.cargo}`}
                    whileTap={{ scale: 0.94 }}
                  >
                    <Avatar person={p} size={size} />
                    {done && <span className="check">✓</span>}
                    <span className="bubble-label"><b>{p.full_name}</b><small>{p.cargo}</small></span>
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel inferior con el formulario
// ---------------------------------------------------------------------------

function NominateSheet({ person, cycle, used, onClose, onSent }: {
  person: PublicPerson; cycle: Cycle; used: number; onClose: () => void; onSent: () => Promise<void>;
}) {
  const [valueKey, setValueKey] = useState(cycle.value_key);
  const [what, setWhat] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ count: number } | null>(null);
  const [tick, setTick] = useState(0);
  useBodyLock(true);

  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const ok = what.trim().length >= MIN_CHARS && why.trim().length >= MIN_CHARS;
  const value = valueByKey(valueKey);
  const jef = jefaturaInfo(person.jefatura);

  const send = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<{ count: number; max: number }>('nominate', { nomineeId: person.id, valueKey, whatDid: what, whyMattered: why });
      setSent({ count: r.count });
      burst('soft');
      onSent();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <motion.div className="sheet-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && onClose()} />
      <motion.div
        className="sheet" role="dialog" aria-modal="true" aria-label={`Nominar a ${person.full_name}`}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={reducedMotion() ? { duration: 0.15 } : { type: 'spring', stiffness: 220, damping: 28 }}
      >
        <button className="sheet-x" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="sheet-person">
          <motion.span
            layoutId={`av-${person.id}`} className="lay gold-glow"
            animate={sent && !reducedMotion() ? { y: -240, opacity: 0, scale: 0.7 } : { y: 0, opacity: 1, scale: 1 }}
            transition={sent ? { duration: 0.9, ease: 'easeIn' } : undefined}
          >
            <Avatar person={person} size={84} />
          </motion.span>
          <div>
            <h2 className="display">{person.full_name}</h2>
            <p>{person.cargo}</p>
            <span className="tag-j" style={{ '--c': jef.color } as CSSProperties}>{jef.name}</span>
          </div>
        </div>

        {sent ? (
          <div className="sent-box" role="status">
            <h3 className="display">Gracias por hacer visible lo invisible</h3>
            <p>Nominaste a <b>{person.full_name}</b>. El comité la revisará pronto.</p>
            <p className="quota">Tus nominaciones: <b>{sent.count} de {cycle.max_nominations}</b></p>
            <button className="btn gold" onClick={onClose}>
              {sent.count < cycle.max_nominations ? 'Nominar a alguien más' : 'Volver al cielo'}
            </button>
          </div>
        ) : (
          <div className="sheet-form">
            <fieldset>
              <legend>Valor que reconoces</legend>
              <div className="value-chips">
                {VALUES.map((v) => {
                  const locked = cycle.lock_value && v.key !== cycle.value_key;
                  return (
                    <button
                      key={v.key} type="button" disabled={locked} aria-pressed={valueKey === v.key}
                      className={`vchip ${valueKey === v.key ? 'on' : ''}`} onClick={() => setValueKey(v.key)}
                    >
                      <span aria-hidden="true">{v.emoji}</span> {v.name}
                    </button>
                  );
                })}
              </div>
              <p className="hint">{value.desc}{valueKey === cycle.value_key ? ' · Es el valor de este ciclo.' : ''}</p>
            </fieldset>

            <Field
              id="what" label="¿Qué hizo?" value={what} onChange={setWhat}
              placeholder={DEFAULT_PLACEHOLDERS_WHAT[tick % DEFAULT_PLACEHOLDERS_WHAT.length]}
            />
            <Field
              id="why" label="¿Por qué importó?" value={why} onChange={setWhy}
              placeholder={DEFAULT_PLACEHOLDERS_WHY[tick % DEFAULT_PLACEHOLDERS_WHY.length]}
            />
            <p className="note">Nombrar qué se hizo y por qué importó es lo que hace valioso este reconocimiento.</p>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn gold block" disabled={!ok || busy} onClick={send}>
              {busy ? 'Enviando…' : 'Enviar nominación'}
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}

function Field({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const n = value.trim().length;
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className={`count ${n >= MIN_CHARS ? 'ok' : ''}`} aria-live="polite">{n} / mínimo {MIN_CHARS}</span>
      </div>
      <textarea id={id} rows={3} value={value} placeholder={placeholder} maxLength={600} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
