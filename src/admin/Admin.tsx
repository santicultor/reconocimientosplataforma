import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { Avatar } from '../ui/Avatar';
import { burst, Confirm, Spinner, useToast } from '../ui/bits';
import { downloadCsv, fmtDateTime, fromLocalInput, parseCsv, resizeImage, toLocalInput } from '../lib/format';
import {
  JEFATURAS, MONTHS, PRIZES, STATUS_LABEL, STATUS_ORDER, VALUES, jefaturaInfo, monthName, prizeByKey, valueByKey,
} from '../shared/constants';
import type { AdminNomination, AdminState, Cycle, CycleStatus, ImportRow, Person, RecognitionRow } from '../shared/types';

type Tab = 'ciclo' | 'nominaciones' | 'finalistas' | 'cierre' | 'personas' | 'registro';
const TABS: [Tab, string][] = [
  ['ciclo', 'Ciclo'], ['nominaciones', 'Nominaciones'], ['finalistas', 'Finalistas'],
  ['cierre', 'Cierre y empates'], ['personas', 'Personas'], ['registro', 'Registro anual'],
];

interface TabProps { s: AdminState; reload: () => Promise<void>; selectCycle: (id: string | 'new') => void; isNew: boolean }

export default function Admin() {
  const { refresh } = useApp();
  const toast = useToast();
  const [s, setS] = useState<AdminState | null>(null);
  const [cycleId, setCycleId] = useState<string | undefined>();
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<Tab>('ciclo');

  const load = useCallback(async (id?: string) => {
    try {
      const st = await api<AdminState>('adminState', { cycleId: id ?? cycleId });
      setS(st);
      if (!id && !cycleId && st.cycle) setCycleId(st.cycle.id);
    } catch (e) { toast((e as Error).message, 'error'); }
  }, [cycleId]); // eslint-disable-line

  useEffect(() => { if (!isNew) load(); }, [cycleId, isNew]); // eslint-disable-line

  const reload = useCallback(async () => { await load(); await refresh(); }, [load, refresh]);
  const selectCycle = (id: string | 'new') => {
    if (id === 'new') { setIsNew(true); setTab('ciclo'); return; }
    setIsNew(false); setCycleId(id);
  };

  if (!s) return <div className="page"><Spinner /></div>;
  const props: TabProps = { s: isNew ? { ...s, cycle: null } : s, reload, selectCycle, isNew };
  const noCycle = !s.cycle || isNew;

  return (
    <section className="admin">
      <div className="admin-head">
        <div>
          <p className="mono-label">Panel Admin</p>
          <h1 className="display">{isNew ? 'Nuevo ciclo' : s.cycle ? `Ciclo de ${monthName(s.cycle.month)} ${s.cycle.year}` : 'Crea el primer ciclo'}</h1>
          {s.cycle && !isNew && <p className="phase-pill">{STATUS_LABEL[s.cycle.status]} · {valueByKey(s.cycle.value_key).emoji} {valueByKey(s.cycle.value_key).name}</p>}
        </div>
        <div className="cycle-select">
          <label htmlFor="cyc">Ciclo</label>
          <select id="cyc" value={isNew ? 'new' : cycleId ?? ''} onChange={(e) => selectCycle(e.target.value)}>
            {s.cycles.map((c) => <option key={c.id} value={c.id}>{monthName(c.month)} {c.year} · {STATUS_LABEL[c.status]}</option>)}
            <option value="new">＋ Nuevo ciclo</option>
          </select>
        </div>
      </div>

      <nav className="tabs" aria-label="Secciones del panel">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
            disabled={noCycle && ['nominaciones', 'finalistas', 'cierre'].includes(k)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'ciclo' && <CycleTab {...props} onSaved={(id) => { setIsNew(false); setCycleId(id); }} />}
      {tab === 'nominaciones' && <NominationsTab {...props} />}
      {tab === 'finalistas' && <FinalistsTab {...props} />}
      {tab === 'cierre' && <ClosingTab {...props} />}
      {tab === 'personas' && <PeopleTab {...props} />}
      {tab === 'registro' && <RegistryTab />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ciclo
// ---------------------------------------------------------------------------

const NEXT: Record<CycleStatus, { to: CycleStatus; label: string; ask: string } | null> = {
  draft: { to: 'nominations', label: 'Abrir nominaciones', ask: 'Todo el equipo podrá nominar a sus compañeros.' },
  nominations: { to: 'selection', label: 'Cerrar nominaciones', ask: 'Nadie podrá nominar más. Pasarán a selección de finalistas.' },
  selection: { to: 'voting', label: 'Abrir votación', ask: 'Todo el equipo podrá votar por los finalistas.' },
  voting: { to: 'closed', label: 'Cerrar votación y calcular ganadores', ask: 'Nadie podrá votar más y se calcularán los ganadores.' },
  closed: { to: 'published', label: 'Publicar resultados', ask: 'Todo el equipo verá el podio y las personas ganadoras elegirán su premio.' },
  published: null,
};
const PREV_LABEL: Record<CycleStatus, string> = {
  draft: '', nominations: 'Volver a borrador', selection: 'Reabrir nominaciones', voting: 'Volver a selección',
  closed: 'Reabrir votación', published: 'Despublicar resultados',
};

function CycleTab({ s, reload, onSaved }: TabProps & { onSaved: (id: string) => void }) {
  const toast = useToast();
  const c = s.cycle;
  const now = new Date();
  const blank = {
    month: now.getMonth() + 1, year: now.getFullYear(), value_key: 'invisible', nominations_close_at: '', voting_close_at: '',
    winners_count: 2, max_nominations: 2, votes_per_person: 1, max_finalists: 12, lock_value: false,
  };
  const fromCycle = (x: Cycle | null) => x ? {
    month: x.month, year: x.year, value_key: x.value_key, nominations_close_at: toLocalInput(x.nominations_close_at),
    voting_close_at: toLocalInput(x.voting_close_at), winners_count: x.winners_count, max_nominations: x.max_nominations,
    votes_per_person: x.votes_per_person, max_finalists: x.max_finalists, lock_value: x.lock_value,
  } : blank;
  const [f, setF] = useState(fromCycle(c));
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | { to: CycleStatus; title: string; body: ReactNode; force?: boolean }>(null);
  useEffect(() => setF(fromCycle(c)), [c?.id, c?.nominations_close_at, c?.voting_close_at, c?.value_key]); // eslint-disable-line

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ cycle: Cycle }>('adminSaveCycle', {
        id: c?.id, ...f, nominations_close_at: fromLocalInput(f.nominations_close_at), voting_close_at: fromLocalInput(f.voting_close_at),
      });
      toast('Ciclo guardado.');
      onSaved(r.cycle.id);
      await reload();
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  const move = async (to: CycleStatus, force = false) => {
    if (!c) return;
    setBusy(true);
    try {
      await api('adminSetStatus', { cycleId: c.id, status: to, force });
      if (to === 'published') burst('big');
      toast(`Listo: ${STATUS_LABEL[to].toLowerCase()}.`);
      await reload();
    } catch (e: any) {
      if (e.code === 'coverage') {
        setAsk({ to, force: true, title: 'Faltan jefaturas por cubrir', body: <p>{e.message} ¿Quieres abrir la votación de todos modos?</p> });
      } else toast(e.message, 'error');
    }
    setBusy(false);
  };

  const idx = c ? STATUS_ORDER.indexOf(c.status) : -1;
  const next = c ? NEXT[c.status] : null;

  return (
    <div className="admin-grid">
      <div className="panel">
        <h2>Datos del ciclo</h2>
        <div className="form-grid">
          <label>Mes
            <select value={f.month} onChange={(e) => set('month', +e.target.value)}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label>Año<input type="number" value={f.year} onChange={(e) => set('year', +e.target.value)} /></label>
          <label className="span2">Valor activo
            <div className="value-chips light">
              {VALUES.map((v) => (
                <button key={v.key} type="button" className={`vchip ${f.value_key === v.key ? 'on' : ''}`} aria-pressed={f.value_key === v.key} onClick={() => set('value_key', v.key)}>
                  {v.emoji} {v.name}
                </button>
              ))}
            </div>
          </label>
          <label>Cierran las nominaciones<input type="datetime-local" value={f.nominations_close_at} onChange={(e) => set('nominations_close_at', e.target.value)} /></label>
          <label>Cierra la votación<input type="datetime-local" value={f.voting_close_at} onChange={(e) => set('voting_close_at', e.target.value)} /></label>
          <label>Ganadores<input type="number" min={1} max={10} value={f.winners_count} onChange={(e) => set('winners_count', +e.target.value)} /></label>
          <label>Nominaciones por persona<input type="number" min={1} max={10} value={f.max_nominations} onChange={(e) => set('max_nominations', +e.target.value)} /></label>
          <label>Votos por persona<input type="number" min={1} max={5} value={f.votes_per_person} onChange={(e) => set('votes_per_person', +e.target.value)} /></label>
          <label>Máximo de finalistas<input type="number" min={2} max={30} value={f.max_finalists} onChange={(e) => set('max_finalists', +e.target.value)} /></label>
          <label className="check-row span2">
            <input type="checkbox" checked={f.lock_value} onChange={(e) => set('lock_value', e.target.checked)} />
            Bloquear el valor: solo se puede nominar por el valor activo
          </label>
        </div>
        <div className="row end"><button className="btn primary" disabled={busy} onClick={save}>{c ? 'Guardar cambios' : 'Crear ciclo'}</button></div>
        <p className="hint">Las fechas son hora de Colombia. Los plazos se aplican solos: pasada la hora, el sistema rechaza nominaciones o votos nuevos.</p>
      </div>

      {c && (
        <div className="panel">
          <h2>Fase del ciclo</h2>
          <ol className="stepper">
            {STATUS_ORDER.map((st, i) => (
              <li key={st} className={i < idx ? 'done' : i === idx ? 'now' : ''}><span />{STATUS_LABEL[st]}</li>
            ))}
          </ol>
          <div className="stack">
            {next && (
              <button className="btn primary" disabled={busy} onClick={() => setAsk({ to: next.to, title: next.label, body: <p>{next.ask}</p> })}>
                {next.label}
              </button>
            )}
            {idx > 0 && (
              <button className="btn ghost" disabled={busy} onClick={() => setAsk({
                to: STATUS_ORDER[idx - 1], title: PREV_LABEL[c.status],
                body: <p>{c.status === 'closed' ? 'Se borrarán los ganadores calculados; podrás volver a cerrar la votación.' : 'El ciclo vuelve un paso atrás.'}</p>,
              })}>{PREV_LABEL[c.status]}</button>
            )}
          </div>
          <dl className="facts">
            <dt>Nominaciones cierran</dt><dd>{fmtDateTime(c.nominations_close_at)}</dd>
            <dt>Votación cierra</dt><dd>{fmtDateTime(c.voting_close_at)}</dd>
            <dt>Participación en nominaciones</dt><dd>{s.nominatorsCount} personas</dd>
            {s.tally && <><dt>Participación en votación</dt><dd>{s.votersCount} personas</dd></>}
          </dl>
        </div>
      )}

      {ask && (
        <Confirm title={ask.title} body={ask.body} confirmLabel={ask.force ? 'Abrir de todos modos' : 'Confirmar'}
          onCancel={() => setAsk(null)} onConfirm={() => { const a = ask; setAsk(null); move(a.to, a.force); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nominaciones
// ---------------------------------------------------------------------------

function NominationsTab({ s, reload }: TabProps) {
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const open = s.cycle && ['nominations', 'selection'].includes(s.cycle.status);

  const review = async (id: string, status: string, why?: string) => {
    try {
      const r = await api<{ emailed: boolean | null }>('adminReviewNomination', { id, status, reject_reason: why });
      setRejecting(null); setReason(''); await reload();
      if (r.emailed === true) toast('Aprobada. La persona recibió su correo anónimo. 💌');
      if (r.emailed === false) toast('Aprobada, pero no pude enviar el correo. Revisa la configuración SMTP.', 'error');
    }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  const groups = useMemo(() => {
    const m = new Map<string, AdminNomination[]>();
    for (const n of s.nominations.filter((x) => filter === 'all' || x.status === filter)) m.set(n.nominee_id, [...(m.get(n.nominee_id) ?? []), n]);
    return [...m.values()];
  }, [s.nominations, filter]);
  const count = (st: string) => s.nominations.filter((n) => n.status === st).length;

  return (
    <div>
      <div className="seg" role="group" aria-label="Filtrar nominaciones">
        {([['pending', 'Por revisar'], ['approved', 'Aprobadas'], ['rejected', 'Rechazadas'], ['all', 'Todas']] as const).map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}{k !== 'all' ? ` (${count(k)})` : ` (${s.nominations.length})`}</button>
        ))}
      </div>
      {!open && <p className="hint">Este ciclo ya no admite revisión de nominaciones.</p>}
      <p className="hint">
        Al aprobar una nominación, la persona recibe un correo anónimo con lo que escribieron sobre ella.{' '}
        <button className="link" onClick={async () => {
          try { const r = await api<{ to: string }>('adminTestEmail'); toast(`Te envié un correo de prueba a ${r.to}.`); }
          catch (e) { toast((e as Error).message, 'error'); }
        }}>Enviarme un correo de prueba</button>
      </p>
      {!groups.length && <p className="empty">No hay nominaciones en esta vista.</p>}
      <div className="stack">
        {groups.map((g) => {
          const p = g[0].nominee;
          const rec = s.recognized[p.id];
          return (
            <article key={p.id} className="panel nom-group">
              <header>
                <Avatar person={p} size={48} />
                <div><b>{p.full_name}</b><small>{p.cargo}</small></div>
                <span className="tag-j light" style={{ '--c': jefaturaInfo(p.jefatura).color } as CSSProperties}>{p.jefatura}</span>
                {rec && <span className="badge warn" title="Ya ganó antes este año">Ya reconocido este año</span>}
                <span className="badge">{g.length} {g.length === 1 ? 'nominación' : 'nominaciones'}</span>
              </header>
              {g.map((n) => (
                <div key={n.id} className={`nom ${n.status}`}>
                  <p className="nom-meta">{valueByKey(n.value_key).emoji} {valueByKey(n.value_key).name} · nominado por {n.nominator.full_name}</p>
                  <h4>¿Qué hizo?</h4><p>{n.what_did}</p>
                  <h4>¿Por qué importó?</h4><p>{n.why_mattered}</p>
                  {n.status === 'rejected' && <p className="reject">Rechazada: {n.reject_reason}</p>}
                  {open && (
                    <div className="row">
                      {n.status !== 'approved' && <button className="btn primary small" onClick={() => review(n.id, 'approved')}>Aprobar</button>}
                      {n.status !== 'rejected' && <button className="btn ghost small" onClick={() => setRejecting(n.id)}>Rechazar</button>}
                      {n.status !== 'pending' && <button className="btn link" onClick={() => review(n.id, 'pending')}>Devolver a por revisar</button>}
                    </div>
                  )}
                  {rejecting === n.id && (
                    <div className="reject-box">
                      <label>Motivo del rechazo
                        <input value={reason} autoFocus placeholder="Ej: no se justifica frente al valor del ciclo" onChange={(e) => setReason(e.target.value)} />
                      </label>
                      <div className="row end">
                        <button className="btn ghost small" onClick={() => setRejecting(null)}>Cancelar</button>
                        <button className="btn danger small" disabled={!reason.trim()} onClick={() => review(n.id, 'rejected', reason)}>Rechazar nominación</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finalistas
// ---------------------------------------------------------------------------

function FinalistsTab({ s, reload }: TabProps) {
  const toast = useToast();
  const c = s.cycle!;
  const [sel, setSel] = useState<string[]>(s.finalistIds);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSel(s.finalistIds), [s.finalistIds.join(',')]); // eslint-disable-line
  const editable = ['nominations', 'selection'].includes(c.status);
  const pm = Object.fromEntries(s.people.map((p) => [p.id, p]));
  const approved = useMemo(() => {
    const m = new Map<string, AdminNomination[]>();
    for (const n of s.nominations.filter((x) => x.status === 'approved')) m.set(n.nominee_id, [...(m.get(n.nominee_id) ?? []), n]);
    return [...m.entries()].filter(([id]) => pm[id]).sort((a, b) => pm[a[0]].full_name.localeCompare(pm[b[0]].full_name, 'es'));
  }, [s.nominations]); // eslint-disable-line
  const covered = new Set(sel.map((id) => pm[id]?.jefatura));
  const dirty = sel.slice().sort().join() !== s.finalistIds.slice().sort().join();

  const toggle = (id: string) => {
    if (!editable) return;
    if (sel.includes(id)) return setSel(sel.filter((x) => x !== id));
    if (sel.length >= c.max_finalists) return toast(`El máximo es ${c.max_finalists} finalistas.`, 'error');
    if (s.recognized[id]) toast(`${pm[id].full_name} ya fue reconocida este año. Puedes elegirla, pero considera la regla de no repetición.`, 'error');
    setSel([...sel, id]);
  };
  const save = async () => {
    setBusy(true);
    try { await api('adminSetFinalists', { cycleId: c.id, nomineeIds: sel }); toast('Finalistas guardados.'); await reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  return (
    <div>
      <div className="panel coverage">
        <h2>Cobertura por jefatura</h2>
        <div className="cov-row">
          {JEFATURAS.map((j) => (
            <div key={j.name} className={`cov ${covered.has(j.name) ? 'ok' : ''}`}>
              <span className="cov-dot" aria-hidden="true">{covered.has(j.name) ? '✓' : ''}</span>
              <small>{j.short}</small>
            </div>
          ))}
        </div>
        <p className="hint">La votación no se puede abrir si falta alguna jefatura, salvo que un Admin lo confirme.</p>
      </div>

      <div className="row between">
        <p><b>{sel.length}</b> de {c.max_finalists} finalistas</p>
        <button className="btn primary" disabled={!editable || !dirty || busy} onClick={save}>Guardar finalistas</button>
      </div>
      {!editable && <p className="hint">Los finalistas solo se editan antes de abrir la votación.</p>}
      {!approved.length && <p className="empty">Aún no hay nominaciones aprobadas. Apruébalas en la pestaña Nominaciones para poder elegir finalistas.</p>}

      <div className="cand-grid">
        {approved.map(([id, noms]) => {
          const p = pm[id];
          const on = sel.includes(id);
          return (
            <button key={id} className={`cand ${on ? 'on' : ''}`} disabled={!editable} aria-pressed={on} onClick={() => toggle(id)}>
              <Avatar person={p} size={52} />
              <span className="cand-main">
                <b>{p.full_name}</b><small>{p.cargo}</small>
                <small className="jtxt" style={{ color: jefaturaInfo(p.jefatura).color }}>{p.jefatura}</small>
              </span>
              <span className="cand-side">
                <span className="badge">{noms.length} {noms.length === 1 ? 'historia' : 'historias'}</span>
                {s.recognized[id] && <span className="badge warn">Ya reconocido este año</span>}
                {on && <span className="check">✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cierre y empates
// ---------------------------------------------------------------------------

function ClosingTab({ s, reload }: TabProps) {
  const toast = useToast();
  const c = s.cycle!;
  const [pick, setPick] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const pm = Object.fromEntries(s.people.map((p) => [p.id, p]));
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); await reload(); } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  if (!s.tally)
    return <p className="empty">La votación todavía no empieza. Aquí verás el conteo anónimo (sin saber quién votó por quién) y resolverás los empates.</p>;

  const rows = Object.entries(s.tally).filter(([id]) => pm[id]).sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...rows.map((r) => r[1]));

  return (
    <div className="admin-grid">
      <div className="panel">
        <h2>{c.status === 'voting' ? 'Conteo en vivo' : 'Votos por finalista'}</h2>
        <p className="hint">Participaron {s.votersCount} personas. Nadie puede ver por quién votó cada una.</p>
        {rows.map(([id, v]) => (
          <div key={id} className="bar-row light">
            <span className="bar-name">{pm[id].full_name}</span>
            <span className="bar-track"><span style={{ width: `${(v / top) * 100}%` }} /></span>
            <b>{v}</b>
          </div>
        ))}
        {c.status === 'voting' && (
          <div className="row end"><button className="btn primary" disabled={busy} onClick={() => act(() => api('adminSetStatus', { cycleId: c.id, status: 'closed' }), 'Votación cerrada y ganadores calculados.')}>Cerrar votación y calcular ganadores</button></div>
        )}
      </div>

      {(c.status === 'closed' || c.status === 'published') && (
        <div className="panel">
          <h2>Personas ganadoras</h2>
          {!s.winners.length && <p className="empty">Todavía no hay ganadores confirmados.</p>}
          {s.winners.map((w) => (
            <div key={w.nominee_id} className="winner-row">
              <Avatar person={w.person} size={48} className="gold-ring" />
              <div>
                <b>{w.position}.º · {w.person.full_name}</b>
                <small>{w.votes} {w.votes === 1 ? 'voto' : 'votos'}</small>
                {w.tie_note && <small className="tie">{w.tie_note}</small>}
                <small>{prizeByKey(w.prize_choice) ? `Premio elegido: ${prizeByKey(w.prize_choice)!.emoji} ${prizeByKey(w.prize_choice)!.name}` : c.status === 'published' ? 'Aún no ha elegido premio' : ''}</small>
              </div>
            </div>
          ))}

          {s.tie && (
            <div className="tie-box">
              <h3>Hay un empate por resolver</h3>
              <p>{s.tie.note} Elige {s.tie.slots === 1 ? 'a 1 persona' : `a ${s.tie.slots} personas`}. Regla: gana quien no haya sido reconocido antes este año; si persiste, deciden los Admin y dejan una nota.</p>
              {s.tie.candidates.map((cd) => (
                <label key={cd.person.id} className={`tie-cand ${pick.includes(cd.person.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={pick.includes(cd.person.id)}
                    onChange={() => setPick(pick.includes(cd.person.id) ? pick.filter((x) => x !== cd.person.id) : [...pick, cd.person.id].slice(-s.tie!.slots))} />
                  <Avatar person={cd.person} size={36} />
                  <span><b>{cd.person.full_name}</b> · {cd.votes} {cd.votes === 1 ? 'voto' : 'votos'}
                    {cd.recognizedBefore && <span className="badge warn">Ya reconocido este año</span>}
                  </span>
                </label>
              ))}
              <label>Nota de la decisión
                <textarea rows={2} value={note} placeholder="Ej: se decidió por sorteo en la reunión de Admin" onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="row end">
                <button className="btn primary" disabled={busy || pick.length !== s.tie.slots || !note.trim()}
                  onClick={() => act(() => api('adminResolveTie', { cycleId: c.id, nomineeIds: pick, note }), 'Empate resuelto.').then(() => { setPick([]); setNote(''); })}>
                  Confirmar desempate
                </button>
              </div>
            </div>
          )}

          {c.status === 'closed' && !s.tie && s.winners.length >= s.expectedWinners && (
            <div className="row end"><button className="btn gold" disabled={busy} onClick={() => act(() => api('adminSetStatus', { cycleId: c.id, status: 'published' }).then(() => burst('big')), 'Resultados publicados.')}>Publicar resultados</button></div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

function PeopleTab({ s, reload }: TabProps) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Person> | null>(null);
  const [imp, setImp] = useState<{ rows: ImportRow[]; result?: { created: number; updated: number; errors: { row: number; message: string }[] } } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = s.people.filter((p) => !q || `${p.full_name} ${p.email} ${p.cargo}`.toLowerCase().includes(q.toLowerCase()));
  const active = s.people.filter((p) => p.active).length;

  const onFile = async (file?: File) => {
    if (!file) return;
    const rows = parseCsv(await file.text());
    const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]; return ''; };
    setImp({
      rows: rows.map((r) => ({
        full_name: pick(r, 'nombre', 'nombre completo', 'full_name', 'name'),
        cargo: pick(r, 'cargo', 'position'),
        jefatura: pick(r, 'jefatura', 'area'),
        email: pick(r, 'correo', 'correo electronico', 'email', 'e-mail'),
        photo_url: pick(r, 'foto', 'photo_url', 'url foto', 'foto url'),
        role: pick(r, 'rol', 'role'),
      })),
    });
  };
  const runImport = async () => {
    if (!imp) return;
    setBusy(true);
    try { const result = await api<any>('adminImportPeople', { rows: imp.rows }); setImp({ ...imp, result }); await reload(); toast(`Importación lista: ${result.created} nuevas, ${result.updated} actualizadas.`); }
    catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  const toggleActive = async (p: Person) => {
    try { await api('adminSavePerson', { ...p, active: !p.active }); await reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div>
      <div className="row between wrap">
        <div className="search light"><input type="search" placeholder="Buscar por nombre, correo o cargo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar personas" /></div>
        <div className="row">
          <label className="btn ghost small file">Importar CSV<input type="file" accept=".csv,text/csv" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button className="btn primary small" onClick={() => setEdit({ role: 'member', active: true })}>Agregar persona</button>
        </div>
      </div>
      <p className="hint">{active} personas activas de {s.people.length}. Solo los correos de esta lista pueden entrar a la app.</p>

      {imp && (
        <div className="panel">
          <h3>Importar personas</h3>
          <p>Encontré <b>{imp.rows.length}</b> filas. Columnas: nombre, cargo, jefatura, correo, foto (opcional) y rol (opcional: Admin o miembro). Si el correo ya existe, se actualiza esa persona.</p>
          {imp.result ? (
            <>
              <p><b>{imp.result.created}</b> nuevas · <b>{imp.result.updated}</b> actualizadas · <b>{imp.result.errors.length}</b> con error.</p>
              {imp.result.errors.length > 0 && <ul className="errlist">{imp.result.errors.map((e) => <li key={e.row}>Fila {e.row}: {e.message}</li>)}</ul>}
              <button className="btn ghost small" onClick={() => setImp(null)}>Cerrar</button>
            </>
          ) : (
            <div className="row">
              <button className="btn primary small" disabled={busy} onClick={runImport}>Importar {imp.rows.length} filas</button>
              <button className="btn ghost small" onClick={() => setImp(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="people-table">
          <thead><tr><th></th><th>Nombre</th><th>Jefatura</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'off'}>
                <td><Avatar person={p} size={36} /></td>
                <td><b>{p.full_name}</b><small>{p.cargo || '—'} · {p.email}</small></td>
                <td><span className="tag-j light" style={{ '--c': jefaturaInfo(p.jefatura).color } as CSSProperties}>{jefaturaInfo(p.jefatura).short}</span></td>
                <td>{p.role === 'committee' ? 'Admin' : 'Miembro'}</td>
                <td><button className="btn link" onClick={() => toggleActive(p)}>{p.active ? 'Activa' : 'Inactiva'}</button></td>
                <td><button className="btn ghost small" onClick={() => setEdit(p)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="empty">No hay personas que coincidan.</p>}
      </div>

      {edit && <PersonForm person={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </div>
  );
}

function PersonForm({ person, onClose, onSaved }: { person: Partial<Person>; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [f, setF] = useState({
    full_name: person.full_name ?? '', cargo: person.cargo ?? '', jefatura: person.jefatura ?? JEFATURAS[0].name,
    email: person.email ?? '', role: person.role ?? 'member', active: person.active ?? true,
  });
  const [photo, setPhoto] = useState<string | null>(person.photo_url ?? null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try { await api('adminSavePerson', { id: person.id, ...f }); toast('Persona guardada.'); await onSaved(); }
    catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file || !person.id) return;
    try {
      const dataUrl = await resizeImage(file);
      const r = await api<{ photo_url: string }>('adminUploadPhoto', { personId: person.id, dataUrl });
      setPhoto(r.photo_url); toast('Foto actualizada.');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="Persona" onClick={(e) => e.stopPropagation()}>
        <h3>{person.id ? 'Editar persona' : 'Agregar persona'}</h3>
        {person.id ? (
          <div className="photo-row">
            <Avatar person={{ id: person.id, full_name: f.full_name || '?', photo_url: photo, jefatura: f.jefatura }} size={72} />
            <label className="btn ghost small file">Subir foto<input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></label>
          </div>
        ) : <p className="hint">Podrás subir la foto después de guardar.</p>}
        <div className="form-grid">
          <label className="span2">Nombre completo<input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></label>
          <label className="span2">Cargo<input value={f.cargo} onChange={(e) => set('cargo', e.target.value)} /></label>
          <label className="span2">Jefatura
            <select value={f.jefatura} onChange={(e) => set('jefatura', e.target.value)}>{JEFATURAS.map((j) => <option key={j.name}>{j.name}</option>)}</select>
          </label>
          <label className="span2">Correo institucional<input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label>Rol<select value={f.role} onChange={(e) => set('role', e.target.value)}><option value="member">Miembro</option><option value="committee">Admin</option></select></label>
          <label className="check-row"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />Persona activa</label>
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy} onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registro anual
// ---------------------------------------------------------------------------

function RegistryTab() {
  const toast = useToast();
  const [year, setYear] = useState<number | undefined>();
  const [data, setData] = useState<{ years: number[]; rows: RecognitionRow[] } | null>(null);
  useEffect(() => { api<{ years: number[]; rows: RecognitionRow[] }>('adminRecognitions', { year }).then((d) => { setData(d); if (!year && d.years[0]) setYear(d.years[0]); }).catch((e) => toast(e.message, 'error')); }, [year]); // eslint-disable-line
  if (!data) return <Spinner />;

  const exportCsv = () => downloadCsv(`reconocidos-${year}.csv`, [
    ['Año', 'Mes', 'Valor', 'Nombre', 'Cargo', 'Jefatura', 'Puesto', 'Votos', 'Premio elegido', 'Qué hizo', 'Por qué importó'],
    ...data.rows.map((r) => [r.year, monthName(r.month), r.value, r.name, r.cargo, r.jefatura, r.position, r.votes, r.prize, r.quote_what, r.quote_why]),
  ]);

  return (
    <div>
      <div className="row between wrap">
        <label className="inline">Año
          <select value={year ?? ''} onChange={(e) => setYear(+e.target.value)}>{data.years.map((y) => <option key={y}>{y}</option>)}</select>
        </label>
        <button className="btn primary small" disabled={!data.rows.length} onClick={exportCsv}>Exportar a CSV</button>
      </div>
      {!data.rows.length && <p className="empty">Aún no hay resultados publicados. Cuando publiques un ciclo, sus ganadores aparecerán aquí.</p>}
      {data.rows.length > 0 && (
        <div className="table-wrap">
          <table className="people-table">
            <thead><tr><th>Mes</th><th>Valor</th><th>Persona</th><th>Puesto</th><th>Votos</th><th>Premio</th></tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i}><td>{monthName(r.month)}</td><td>{r.value}</td><td><b>{r.name}</b><small>{r.cargo}</small></td><td>{r.position}.º</td><td>{r.votes}</td><td>{r.prize || 'Sin elegir'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
