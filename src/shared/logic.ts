/**
 * Toda la lógica de negocio de "Conexión" vive aquí, en un solo lugar.
 * Se ejecuta en el servidor (función de Netlify + Supabase) o en el navegador (modo demostración).
 * Las reglas que protegen el voto secreto y la privacidad de las nominaciones están en este archivo:
 * ninguna respuesta incluye quién votó por quién.
 */
import type {
  AdminNomination, AdminState, BootstrapData, Cycle, CycleStatus, Db, Finalist, FinalistCard,
  ImportRow, Nomination, Person, PublicPerson, Quote, RecognitionRow, ResultsData, Role,
  TieInfo, Vote, WallEntry, Winner,
} from './types';
import { ApiError } from './errors';
import { JEFATURAS, MIN_CHARS, PRIZES, STATUS_ORDER, VALUES, monthName, normalizeJefatura, valueByKey } from './constants';

export { ApiError };
const fail = (status: number, message: string, code?: string): never => {
  throw new ApiError(status, message, code);
};

// ---------- utilidades ----------

const pub = (p: Person | PublicPerson): PublicPerson => ({
  id: p.id, full_name: p.full_name, cargo: p.cargo, jefatura: p.jefatura, photo_url: p.photo_url,
});
const period = (c: Cycle) => c.year * 12 + c.month;
const byPeriodDesc = (a: Cycle, b: Cycle) => period(b) - period(a) || b.created_at.localeCompare(a.created_at);
const byCreated = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);
const quoteOf = (n: Nomination): Quote => ({ value_key: n.value_key, what_did: n.what_did, why_mattered: n.why_mattered });
const idMap = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, T>;
const isPast = (iso: string | null, now: Date) => !!iso && now.getTime() > new Date(iso).getTime();
const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function currentCycle(db: Db): Promise<Cycle | null> {
  const cycles = (await db.all<Cycle>('cycles')).sort(byPeriodDesc);
  return cycles.find((c) => c.status !== 'draft') ?? cycles[0] ?? null;
}

async function getCycle(db: Db, id: unknown): Promise<Cycle> {
  const c = (await db.all<Cycle>('cycles', { id }))[0];
  return c ?? fail(404, 'No encontré ese ciclo.');
}

/** Personas reconocidas (ganadoras) antes de este ciclo, dentro del mismo año. */
async function recognizedBefore(db: Db, cycle: Cycle) {
  const cycles = (await db.all<Cycle>('cycles')).filter((c) => c.year === cycle.year && c.id !== cycle.id && c.status !== 'draft');
  const ids = new Set(cycles.map((c) => c.id));
  const winners = (await db.all<Winner>('winners')).filter((w) => ids.has(w.cycle_id));
  const map: Record<string, { month: number; year: number }[]> = {};
  const cyc = idMap(cycles);
  for (const w of winners) (map[w.nominee_id] ??= []).push({ month: cyc[w.cycle_id].month, year: cyc[w.cycle_id].year });
  return map;
}

// ---------- cálculo de ganadores y empates ----------

interface Outcome {
  clear: { nominee_id: string; votes: number; position: number; tie_note: string | null }[];
  tie: { slots: number; candidateIds: string[]; note: string } | null;
}

export function computeOutcome(
  winnersCount: number,
  finalistIds: string[],
  tally: Record<string, number>,
  recognized: Set<string>,
): Outcome {
  const expected = Math.min(winnersCount, finalistIds.length);
  const v = (id: string) => tally[id] ?? 0;
  const sorted = [...finalistIds].sort((a, b) => v(b) - v(a));
  const groups: string[][] = [];
  for (const id of sorted) {
    const last = groups[groups.length - 1];
    if (last && v(last[0]) === v(id)) last.push(id);
    else groups.push([id]);
  }
  const clear: Outcome['clear'] = [];
  let slots = expected;
  let pos = 1;
  let tie: Outcome['tie'] = null;
  for (const g of groups) {
    if (slots <= 0) break;
    if (g.length <= slots) {
      g.forEach((id) => clear.push({ nominee_id: id, votes: v(id), position: pos++, tie_note: null }));
      slots -= g.length;
      continue;
    }
    // Empate que cruza la línea de ganadores
    const fresh = g.filter((id) => !recognized.has(id));
    const note = `Empate por el puesto ${pos}`;
    if (fresh.length === slots) {
      fresh.forEach((id) =>
        clear.push({ nominee_id: id, votes: v(id), position: pos++, tie_note: `${note}: ganó quien no había sido reconocido antes este año.` }));
      slots = 0;
    } else if (fresh.length > 0 && fresh.length < slots) {
      fresh.forEach((id) =>
        clear.push({ nominee_id: id, votes: v(id), position: pos++, tie_note: `${note}: ganó quien no había sido reconocido antes este año.` }));
      slots -= fresh.length;
      tie = { slots, candidateIds: g.filter((id) => !fresh.includes(id)), note: `${note}. Las personas empatadas ya fueron reconocidas este año.` };
    } else {
      tie = {
        slots,
        candidateIds: fresh.length > slots ? fresh : g,
        note: fresh.length > slots
          ? `${note}. Varias personas empatadas no habían sido reconocidas este año.`
          : `${note}. Todas las personas empatadas ya fueron reconocidas este año.`,
      };
    }
    break;
  }
  return { clear, tie };
}

async function tallyVotes(db: Db, cycleId: string, finalistIds: string[]) {
  const votes = await db.all<Vote>('votes', { cycle_id: cycleId });
  const tally: Record<string, number> = Object.fromEntries(finalistIds.map((id) => [id, 0]));
  const voters = new Set<string>();
  for (const v of votes) {
    if (v.nominee_id in tally) tally[v.nominee_id] += 1;
    voters.add(v.voter_id);
  }
  return { tally, votersCount: voters.size };
}

async function outcomeFor(db: Db, cycle: Cycle) {
  const finalistIds = (await db.all<Finalist>('finalists', { cycle_id: cycle.id })).map((f) => f.nominee_id);
  const { tally } = await tallyVotes(db, cycle.id, finalistIds);
  const rec = new Set(Object.keys(await recognizedBefore(db, cycle)));
  const out = computeOutcome(cycle.winners_count, finalistIds, tally, rec);
  return { finalistIds, tally, out, expected: Math.min(cycle.winners_count, finalistIds.length), rec };
}

// ---------- acciones de miembros ----------

async function bootstrap(db: Db, me: Person, now: Date): Promise<BootstrapData> {
  const people = (await db.all<Person>('people')).filter((p) => p.active);
  const cycle = await currentCycle(db);
  let done = 0;
  let myNominations: BootstrapData['myNominations'] = [];
  let myVoteIds: string[] = [];
  if (cycle) {
    const active = new Set(people.map((p) => p.id));
    const [noms, votes] = await Promise.all([
      db.all<Nomination>('nominations', { cycle_id: cycle.id }),
      db.all<Vote>('votes', { cycle_id: cycle.id }),
    ]);
    myNominations = noms.filter((n) => n.nominator_id === me.id).map((n) => ({ id: n.id, nominee_id: n.nominee_id, status: n.status, value_key: n.value_key }));
    myVoteIds = votes.filter((v) => v.voter_id === me.id).map((v) => v.nominee_id);
    const ids = ['draft', 'nominations', 'selection'].includes(cycle.status)
      ? noms.map((n) => n.nominator_id)
      : votes.map((v) => v.voter_id);
    done = new Set(ids.filter((id) => active.has(id))).size;
  }
  return {
    me: { ...pub(me), role: me.role },
    cycle,
    people: people.map(pub),
    progress: { done, total: people.length },
    myNominations,
    myVoteIds,
    serverNow: now.toISOString(),
  };
}

async function finalistCards(db: Db, cycle: Cycle): Promise<FinalistCard[]> {
  const [fin, people, noms] = await Promise.all([
    db.all<Finalist>('finalists', { cycle_id: cycle.id }),
    db.all<Person>('people'),
    db.all<Nomination>('nominations', { cycle_id: cycle.id, status: 'approved' }),
  ]);
  const pm = idMap(people);
  return fin
    .filter((f) => pm[f.nominee_id])
    .map((f) => ({
      person: pub(pm[f.nominee_id]),
      quotes: noms.filter((n) => n.nominee_id === f.nominee_id).sort(byCreated).map(quoteOf),
    }))
    .sort((a, b) => a.person.full_name.localeCompare(b.person.full_name, 'es'));
}

async function createNomination(db: Db, me: Person, p: any, now: Date) {
  const cycle = await currentCycle(db);
  if (!cycle || cycle.status !== 'nominations') fail(409, 'Las nominaciones no están abiertas en este momento.');
  const c = cycle as Cycle;
  if (isPast(c.nominations_close_at, now)) fail(409, 'El plazo de nominaciones ya terminó.');
  const nominee = (await db.all<Person>('people', { id: p?.nomineeId }))[0];
  if (!nominee || !nominee.active) fail(404, 'No encontré a esa persona.');
  if (nominee.id === me.id) fail(400, 'No puedes nominarte a ti mismo. ¡Pero sí a cualquier compañero!');
  const valueKey = clean(p?.valueKey);
  if (!VALUES.some((v) => v.key === valueKey)) fail(400, 'Elige uno de los valores.');
  if (c.lock_value && valueKey !== c.value_key) fail(400, `Este ciclo solo admite el valor «${valueByKey(c.value_key).name}».`);
  const what = clean(p?.whatDid);
  const why = clean(p?.whyMattered);
  if (what.length < MIN_CHARS || why.length < MIN_CHARS)
    fail(400, `Cuéntanos un poco más: cada campo necesita mínimo ${MIN_CHARS} caracteres.`);
  const mine = await db.all<Nomination>('nominations', { cycle_id: c.id, nominator_id: me.id });
  if (mine.length >= c.max_nominations) fail(409, `Ya usaste tus ${c.max_nominations} nominaciones de este ciclo.`);
  if (mine.some((n) => n.nominee_id === nominee!.id)) fail(409, 'Ya nominaste a esta persona en este ciclo.');
  await db.insert('nominations', {
    cycle_id: c.id, nominee_id: nominee!.id, nominator_id: me.id, value_key: valueKey,
    what_did: what, why_mattered: why, status: 'pending', reject_reason: null,
  });
  return { count: mine.length + 1, max: c.max_nominations };
}

async function setVotes(db: Db, me: Person, p: any, now: Date) {
  const cycle = await currentCycle(db);
  if (!cycle || cycle.status !== 'voting') fail(409, 'La votación no está abierta en este momento.');
  const c = cycle as Cycle;
  if (isPast(c.voting_close_at, now)) fail(409, 'El plazo de votación ya terminó.');
  const ids: string[] = Array.isArray(p?.nomineeIds) ? [...new Set<string>(p.nomineeIds)] : [];
  if (ids.length > c.votes_per_person)
    fail(400, c.votes_per_person === 1 ? 'Tienes un solo voto.' : `Tienes ${c.votes_per_person} votos.`);
  const fin = new Set((await db.all<Finalist>('finalists', { cycle_id: c.id })).map((f) => f.nominee_id));
  for (const id of ids) {
    if (id === me.id) fail(400, 'No puedes votar por ti mismo.');
    if (!fin.has(id)) fail(400, 'Solo puedes votar por los finalistas.');
  }
  await db.remove('votes', { cycle_id: c.id, voter_id: me.id });
  if (ids.length) await db.insert('votes', ids.map((id) => ({ cycle_id: c.id, voter_id: me.id, nominee_id: id })));
  return { myVoteIds: ids };
}

async function results(db: Db, me: Person): Promise<ResultsData> {
  const cycle = await currentCycle(db);
  if (!cycle || cycle.status !== 'published') fail(409, 'Los resultados todavía no se han publicado.');
  const c = cycle as Cycle;
  const [people, fin, winners, noms] = await Promise.all([
    db.all<Person>('people'),
    db.all<Finalist>('finalists', { cycle_id: c.id }),
    db.all<Winner>('winners', { cycle_id: c.id }),
    db.all<Nomination>('nominations', { cycle_id: c.id, status: 'approved' }),
  ]);
  const pm = idMap(people);
  const { tally } = await tallyVotes(db, c.id, fin.map((f) => f.nominee_id));
  const win = new Set(winners.map((w) => w.nominee_id));
  const mineWin = winners.find((w) => w.nominee_id === me.id);
  return {
    cycle: c,
    ranking: Object.entries(tally)
      .filter(([id]) => pm[id])
      .map(([id, votes]) => ({ person: pub(pm[id]), votes, isWinner: win.has(id) }))
      .sort((a, b) => b.votes - a.votes || a.person.full_name.localeCompare(b.person.full_name, 'es')),
    winners: winners
      .filter((w) => pm[w.nominee_id])
      .sort((a, b) => a.position - b.position)
      .map((w) => ({
        person: pub(pm[w.nominee_id]), position: w.position, votes: w.votes,
        prize_choice: w.nominee_id === me.id || me.role === 'committee' ? w.prize_choice : null,
        tie_note: w.tie_note,
        quotes: noms.filter((n) => n.nominee_id === w.nominee_id).sort(byCreated).map(quoteOf),
      })),
    myWinner: !!mineWin,
    myPrize: mineWin?.prize_choice ?? null,
  };
}

async function choosePrize(db: Db, me: Person, p: any) {
  const cycle = await currentCycle(db);
  if (!cycle || cycle.status !== 'published') fail(409, 'Los premios se eligen cuando se publican los resultados.');
  const c = cycle as Cycle;
  const prize = clean(p?.prize);
  if (!PRIZES.some((x) => x.key === prize)) fail(400, 'Elige uno de los premios.');
  const mine = (await db.all<Winner>('winners', { cycle_id: c.id, nominee_id: me.id }))[0];
  if (!mine) fail(403, 'Solo las personas ganadoras eligen premio.');
  await db.update('winners', { cycle_id: c.id, nominee_id: me.id }, { prize_choice: prize });
  return { prize };
}

async function wall(db: Db): Promise<WallEntry[]> {
  const cycles = (await db.all<Cycle>('cycles', { status: 'published' })).sort(byPeriodDesc);
  if (!cycles.length) return [];
  const [people, winners, noms] = await Promise.all([
    db.all<Person>('people'),
    db.all<Winner>('winners'),
    db.all<Nomination>('nominations', { status: 'approved' }),
  ]);
  const pm = idMap(people);
  return cycles.map((cycle) => ({
    cycle,
    winners: winners
      .filter((w) => w.cycle_id === cycle.id && pm[w.nominee_id])
      .sort((a, b) => a.position - b.position)
      .map((w) => {
        const q = noms.filter((n) => n.cycle_id === cycle.id && n.nominee_id === w.nominee_id).sort(byCreated)[0];
        return { person: pub(pm[w.nominee_id]), position: w.position, quote: q ? quoteOf(q) : null };
      }),
  }));
}

// ---------- acciones de Admin ----------

async function adminState(db: Db, p: any): Promise<AdminState> {
  const cycles = (await db.all<Cycle>('cycles')).sort(byPeriodDesc);
  const cycle = (p?.cycleId ? cycles.find((c) => c.id === p.cycleId) : cycles.find((c) => c.status !== 'published') ?? cycles[0]) ?? null;
  const people = (await db.all<Person>('people')).sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
  const base: AdminState = {
    cycles, cycle, people, nominations: [], finalistIds: [], tally: null, votersCount: 0, nominatorsCount: 0,
    winners: [], recognized: {}, tie: null, expectedWinners: 0,
  };
  if (!cycle) return base;
  const pm = idMap(people);
  const [noms, fin, winners] = await Promise.all([
    db.all<Nomination>('nominations', { cycle_id: cycle.id }),
    db.all<Finalist>('finalists', { cycle_id: cycle.id }),
    db.all<Winner>('winners', { cycle_id: cycle.id }),
  ]);
  base.nominations = noms
    .filter((n) => pm[n.nominee_id] && pm[n.nominator_id])
    .sort(byCreated)
    .map((n): AdminNomination => ({ ...n, nominee: pub(pm[n.nominee_id]), nominator: pub(pm[n.nominator_id]) }));
  base.nominatorsCount = new Set(noms.map((n) => n.nominator_id)).size;
  base.finalistIds = fin.map((f) => f.nominee_id);
  base.recognized = await recognizedBefore(db, cycle);
  base.winners = winners
    .filter((w) => pm[w.nominee_id])
    .sort((a, b) => a.position - b.position)
    .map((w) => ({ ...w, person: pub(pm[w.nominee_id]) }));
  if (['voting', 'closed', 'published'].includes(cycle.status)) {
    const t = await tallyVotes(db, cycle.id, base.finalistIds);
    base.tally = t.tally;
    base.votersCount = t.votersCount;
  }
  if (cycle.status === 'closed' || cycle.status === 'published') {
    const { out, expected } = await outcomeFor(db, cycle);
    base.expectedWinners = expected;
    if (out.tie && winners.length < expected) {
      const taken = new Set(winners.map((w) => w.nominee_id));
      const cands = out.tie.candidateIds.filter((id) => !taken.has(id) && pm[id]);
      base.tie = {
        slots: expected - winners.length,
        note: out.tie.note,
        candidates: cands.map((id) => ({
          person: { ...pub(pm[id]), role: pm[id].role as Role },
          votes: base.tally?.[id] ?? 0,
          recognizedBefore: !!base.recognized[id],
          abstain: pm[id].role === 'committee',
        })),
      } satisfies TieInfo;
    }
  }
  return base;
}

function validateCyclePayload(p: any) {
  const month = Number(p?.month), year = Number(p?.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) fail(400, 'El mes no es válido.');
  if (!Number.isInteger(year) || year < 2024 || year > 2100) fail(400, 'El año no es válido.');
  const value_key = clean(p?.value_key);
  if (!VALUES.some((v) => v.key === value_key)) fail(400, 'Elige el valor del ciclo.');
  const winners_count = Number(p?.winners_count ?? 2);
  const max_nominations = Number(p?.max_nominations ?? 2);
  const votes_per_person = Number(p?.votes_per_person ?? 1);
  const max_finalists = Number(p?.max_finalists ?? 12);
  const inRange = (n: number, a: number, b: number) => Number.isInteger(n) && n >= a && n <= b;
  if (!inRange(winners_count, 1, 10)) fail(400, 'El número de ganadores debe estar entre 1 y 10.');
  if (!inRange(max_nominations, 1, 10)) fail(400, 'Las nominaciones por persona deben estar entre 1 y 10.');
  if (!inRange(votes_per_person, 1, 5)) fail(400, 'Los votos por persona deben estar entre 1 y 5.');
  if (!inRange(max_finalists, 2, 30) || max_finalists < winners_count) fail(400, 'El máximo de finalistas no es válido.');
  const date = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(String(v));
    if (isNaN(d.getTime())) fail(400, 'Una de las fechas no es válida.');
    return d.toISOString();
  };
  const nominations_close_at = date(p?.nominations_close_at);
  const voting_close_at = date(p?.voting_close_at);
  if (nominations_close_at && voting_close_at && voting_close_at <= nominations_close_at)
    fail(400, 'El cierre de votación debe ser después del cierre de nominaciones.');
  return { month, year, value_key, winners_count, max_nominations, votes_per_person, max_finalists, nominations_close_at, voting_close_at, lock_value: !!p?.lock_value };
}

async function saveCycle(db: Db, p: any) {
  const data = validateCyclePayload(p);
  const all = await db.all<Cycle>('cycles');
  if (all.some((c) => c.month === data.month && c.year === data.year && c.id !== p?.id))
    fail(409, `Ya existe un ciclo de ${monthName(data.month)} de ${data.year}.`);
  if (p?.id) {
    await getCycle(db, p.id);
    const [row] = await db.update<Cycle>('cycles', { id: p.id }, data);
    return { cycle: row };
  }
  const [row] = await db.insert<Cycle>('cycles', { ...data, cycle_type: 'conexion', status: 'draft' });
  return { cycle: row };
}

async function applyOutcome(db: Db, cycle: Cycle) {
  const { out } = await outcomeFor(db, cycle);
  await db.remove('winners', { cycle_id: cycle.id });
  if (out.clear.length)
    await db.insert('winners', out.clear.map((w) => ({ cycle_id: cycle.id, nominee_id: w.nominee_id, position: w.position, votes: w.votes, prize_choice: null, tie_note: w.tie_note })));
}

async function setStatus(db: Db, p: any) {
  const cycle = await getCycle(db, p?.cycleId);
  const target = p?.status as CycleStatus;
  const from = STATUS_ORDER.indexOf(cycle.status);
  const to = STATUS_ORDER.indexOf(target);
  if (to < 0) fail(400, 'Ese estado no existe.');
  if (to === from) return { cycle };
  if (Math.abs(to - from) !== 1) fail(400, 'Solo puedes avanzar o retroceder un paso a la vez.');
  const fin = await db.all<Finalist>('finalists', { cycle_id: cycle.id });

  if (target === 'voting') {
    if (fin.length < cycle.winners_count) fail(409, `Necesitas al menos ${cycle.winners_count} finalistas para abrir la votación.`);
    const pm = idMap(await db.all<Person>('people'));
    const covered = new Set(fin.map((f) => pm[f.nominee_id]?.jefatura));
    const missing = JEFATURAS.filter((j) => !covered.has(j.name)).map((j) => j.name);
    if (missing.length && !p?.force)
      fail(409, `Faltan finalistas de: ${missing.join(', ')}.`, 'coverage');
  }
  if (target === 'closed' && from < to) {
    const [row] = await db.update<Cycle>('cycles', { id: cycle.id }, { status: 'closed' });
    await applyOutcome(db, row);
    return { cycle: row };
  }
  if (target === 'published') {
    const { expected } = await outcomeFor(db, cycle);
    const winners = await db.all<Winner>('winners', { cycle_id: cycle.id });
    if (winners.length < expected) fail(409, 'Primero resuelve el empate para tener a todos los ganadores.');
  }
  if (cycle.status === 'closed' && target === 'voting') await db.remove('winners', { cycle_id: cycle.id });
  const [row] = await db.update<Cycle>('cycles', { id: cycle.id }, { status: target });
  return { cycle: row };
}

async function reviewNomination(db: Db, p: any) {
  const n = (await db.all<Nomination>('nominations', { id: p?.id }))[0];
  if (!n) return fail(404, 'No encontré esa nominación.');
  const cycle = await getCycle(db, n!.cycle_id);
  if (!['nominations', 'selection'].includes(cycle.status)) fail(409, 'Ya no se pueden revisar nominaciones de este ciclo.');
  const status = p?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) fail(400, 'Estado de nominación no válido.');
  const reason = clean(p?.reject_reason);
  if (status === 'rejected' && !reason) fail(400, 'Escribe el motivo del rechazo.');
  await db.update('nominations', { id: n!.id }, { status, reject_reason: status === 'rejected' ? reason : null });
  if (status !== 'approved') {
    const left = await db.all<Nomination>('nominations', { cycle_id: n!.cycle_id, nominee_id: n!.nominee_id, status: 'approved' });
    if (!left.length) await db.remove('finalists', { cycle_id: n!.cycle_id, nominee_id: n!.nominee_id });
  }
  return { ok: true };
}

async function setFinalists(db: Db, p: any) {
  const cycle = await getCycle(db, p?.cycleId);
  if (!['nominations', 'selection'].includes(cycle.status)) fail(409, 'Los finalistas solo se editan antes de abrir la votación.');
  const ids: string[] = [...new Set<string>(Array.isArray(p?.nomineeIds) ? p.nomineeIds : [])];
  if (ids.length > cycle.max_finalists) fail(400, `El máximo es ${cycle.max_finalists} finalistas.`);
  const approved = new Set((await db.all<Nomination>('nominations', { cycle_id: cycle.id, status: 'approved' })).map((n) => n.nominee_id));
  for (const id of ids) if (!approved.has(id)) fail(400, 'Cada finalista debe tener al menos una nominación aprobada.');
  const current = await db.all<Finalist>('finalists', { cycle_id: cycle.id });
  for (const f of current) if (!ids.includes(f.nominee_id)) {
    await db.remove('finalists', { cycle_id: cycle.id, nominee_id: f.nominee_id });
    await db.remove('votes', { cycle_id: cycle.id, nominee_id: f.nominee_id });
  }
  const have = new Set(current.map((f) => f.nominee_id));
  const add = ids.filter((id) => !have.has(id));
  if (add.length) await db.insert('finalists', add.map((id) => ({ cycle_id: cycle.id, nominee_id: id })));
  return { finalistIds: ids };
}

async function resolveTie(db: Db, p: any) {
  const cycle = await getCycle(db, p?.cycleId);
  if (!['closed', 'published'].includes(cycle.status)) fail(409, 'La votación debe estar cerrada.');
  const { out, expected } = await outcomeFor(db, cycle);
  const winners = await db.all<Winner>('winners', { cycle_id: cycle.id });
  if (!out.tie || winners.length >= expected) fail(409, 'No hay ningún empate pendiente.');
  const slots = expected - winners.length;
  const taken = new Set(winners.map((w) => w.nominee_id));
  const cands = new Set(out.tie!.candidateIds.filter((id) => !taken.has(id)));
  const ids: string[] = [...new Set<string>(Array.isArray(p?.nomineeIds) ? p.nomineeIds : [])];
  if (ids.length !== slots) fail(400, `Debes elegir exactamente ${slots} ${slots === 1 ? 'persona' : 'personas'}.`);
  for (const id of ids) if (!cands.has(id)) fail(400, 'Esa persona no está entre las empatadas.');
  const note = clean(p?.note);
  if (!note) fail(400, 'Deja una nota explicando cómo decidieron los Admin.');
  const { tally } = await outcomeFor(db, cycle);
  const start = Math.max(0, ...winners.map((w) => w.position));
  await db.insert('winners', ids.map((id, i) => ({
    cycle_id: cycle.id, nominee_id: id, position: start + i + 1, votes: tally[id] ?? 0, prize_choice: null,
    tie_note: `${out.tie!.note} Decisión de Admin: ${note}`,
  })));
  return { ok: true };
}

async function savePerson(db: Db, me: Person, p: any) {
  const full_name = clean(p?.full_name);
  const email = clean(p?.email).toLowerCase();
  const jefatura = normalizeJefatura(clean(p?.jefatura));
  const role: Role = p?.role === 'committee' ? 'committee' : 'member';
  const active = p?.active !== false;
  if (!full_name) fail(400, 'Falta el nombre.');
  if (!isEmail(email)) fail(400, 'El correo no es válido.');
  if (!jefatura) fail(400, 'Elige una de las 6 jefaturas.');
  const all = await db.all<Person>('people');
  if (all.some((x) => x.email.toLowerCase() === email && x.id !== p?.id)) fail(409, 'Ya existe una persona con ese correo.');
  const data = { full_name, cargo: clean(p?.cargo), jefatura, email, role, active };
  if (p?.id) {
    const cur = all.find((x) => x.id === p.id);
    if (!cur) fail(404, 'No encontré a esa persona.');
    const remaining = all.filter((x) => x.id !== p.id && x.role === 'committee' && x.active).length;
    if (cur!.role === 'committee' && cur!.active && (role !== 'committee' || !active) && remaining === 0)
      fail(409, 'Debe quedar al menos una persona activa como Admin.');
    const [row] = await db.update<Person>('people', { id: p.id }, data);
    return { person: row };
  }
  const [row] = await db.insert<Person>('people', { ...data, photo_url: null, is_demo: false });
  return { person: row };
}

async function importPeople(db: Db, rows: ImportRow[]) {
  if (!Array.isArray(rows) || !rows.length) fail(400, 'El archivo no tiene filas.');
  if (rows.length > 500) fail(400, 'Máximo 500 filas por importación.');
  const all = await db.all<Person>('people');
  const byEmail = new Map(all.map((x) => [x.email.toLowerCase(), x]));
  let created = 0, updated = 0;
  const errors: { row: number; message: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const full_name = clean(r.full_name);
    const email = clean(r.email).toLowerCase().replace(/[;,]+$/, '');
    const jefatura = normalizeJefatura(clean(r.jefatura));
    if (!full_name || !isEmail(email) || !jefatura) {
      errors.push({ row: i + 2, message: !full_name ? 'Falta el nombre' : !isEmail(email) ? 'Correo no válido' : `Jefatura no reconocida: «${clean(r.jefatura)}»` });
      continue;
    }
    const roleRaw = clean(r.role).toLowerCase();
    const role: Role | null = /^(admin|comit|committee)/.test(roleRaw) ? 'committee' : /^(miembro|member)/.test(roleRaw) ? 'member' : null;
    const photo = clean(r.photo_url);
    const existing = byEmail.get(email);
    if (existing) {
      const patch: Record<string, unknown> = { full_name, cargo: clean(r.cargo) || existing.cargo, jefatura };
      if (role) patch.role = role;
      if (/^https?:\/\//.test(photo)) patch.photo_url = photo;
      await db.update('people', { id: existing.id }, patch);
      updated++;
    } else {
      const [row] = await db.insert<Person>('people', {
        full_name, cargo: clean(r.cargo), jefatura, email, role: role ?? 'member', active: true, is_demo: false,
        photo_url: /^https?:\/\//.test(photo) ? photo : null,
      });
      byEmail.set(email, row);
      created++;
    }
  }
  return { created, updated, errors };
}

async function uploadPhoto(db: Db, p: any) {
  const person = (await db.all<Person>('people', { id: p?.personId }))[0];
  if (!person) return fail(404, 'No encontré a esa persona.');
  const dataUrl = String(p?.dataUrl ?? '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) fail(400, 'La foto debe ser JPG, PNG o WebP.');
  if (dataUrl.length > 700_000) fail(400, 'La foto es muy pesada. Prueba con una más pequeña.');
  const url = await db.uploadPhoto(person!.id, dataUrl);
  await db.update('people', { id: person!.id }, { photo_url: url });
  return { photo_url: url };
}

async function recognitions(db: Db, p: any): Promise<{ years: number[]; rows: RecognitionRow[] }> {
  const cycles = (await db.all<Cycle>('cycles', { status: 'published' })).sort(byPeriodDesc);
  const years = [...new Set(cycles.map((c) => c.year))].sort((a, b) => b - a);
  const year = Number(p?.year) || years[0];
  const [people, winners, noms] = await Promise.all([
    db.all<Person>('people'), db.all<Winner>('winners'), db.all<Nomination>('nominations', { status: 'approved' }),
  ]);
  const pm = idMap(people);
  const rows: RecognitionRow[] = [];
  for (const c of cycles.filter((x) => x.year === year).sort((a, b) => a.month - b.month)) {
    for (const w of winners.filter((x) => x.cycle_id === c.id).sort((a, b) => a.position - b.position)) {
      const person = pm[w.nominee_id];
      if (!person) continue;
      const q = noms.filter((n) => n.cycle_id === c.id && n.nominee_id === w.nominee_id).sort(byCreated)[0];
      rows.push({
        year: c.year, month: c.month, value: valueByKey(c.value_key).name, name: person.full_name, cargo: person.cargo,
        jefatura: person.jefatura, position: w.position, votes: w.votes,
        prize: PRIZES.find((x) => x.key === w.prize_choice)?.name ?? '',
        quote_what: q?.what_did ?? '', quote_why: q?.why_mattered ?? '',
      });
    }
  }
  return { years, rows };
}

// ---------- punto de entrada ----------

export async function handle(db: Db, me: Person, action: string, payload: any, now: Date = new Date()): Promise<unknown> {
  if (!me.active) fail(403, 'Tu usuario está desactivado. Escríbele a Admin.');
  switch (action) {
    case 'bootstrap': return bootstrap(db, me, now);
    case 'finalists': {
      const c = await currentCycle(db);
      if (!c || c.status !== 'voting') return fail(409, 'La votación no está abierta en este momento.');
      return finalistCards(db, c);
    }
    case 'nominate': return createNomination(db, me, payload, now);
    case 'setVotes': return setVotes(db, me, payload, now);
    case 'results': return results(db, me);
    case 'choosePrize': return choosePrize(db, me, payload);
    case 'wall': return wall(db);
  }
  if (!action.startsWith('admin')) fail(404, 'Acción desconocida.');
  if (me.role !== 'committee') fail(403, 'Esta sección es solo para Admin.');
  switch (action) {
    case 'adminState': return adminState(db, payload);
    case 'adminSaveCycle': return saveCycle(db, payload);
    case 'adminSetStatus': return setStatus(db, payload);
    case 'adminReviewNomination': return reviewNomination(db, payload);
    case 'adminSetFinalists': return setFinalists(db, payload);
    case 'adminResolveTie': return resolveTie(db, payload);
    case 'adminSavePerson': return savePerson(db, me, payload);
    case 'adminImportPeople': return importPeople(db, payload?.rows);
    case 'adminUploadPhoto': return uploadPhoto(db, payload);
    case 'adminRecognitions': return recognitions(db, payload);
  }
  return fail(404, 'Acción desconocida.');
}
