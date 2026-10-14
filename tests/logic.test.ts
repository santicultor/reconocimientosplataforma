import { describe, expect, it } from 'vitest';
import { MemoryDb } from '../src/shared/memory-db';
import { demoSeed } from '../src/shared/demo-seed';
import { ApiError, computeOutcome, handle } from '../src/shared/logic';
import type { AdminState, Person } from '../src/shared/types';

const setup = () => {
  const db = new MemoryDb(demoSeed(new Date('2026-10-14T12:00:00Z')));
  const who = async (slug: string) => (await db.all<Person>('people', { id: `demo-${slug}` }))[0];
  return { db, who };
};
const long = 'Hizo un trabajo cuidadoso y constante que nadie le pidió, y lo dejó documentado para el resto.';

describe('flujo completo del ciclo', () => {
  it('nominar → aprobar → finalistas → votar → cerrar → publicar', async () => {
    const { db, who } = setup();
    const laura = await who('laura'); // comité
    const camila = await who('camila');
    const felipe = await who('felipe');
    const cycle = (await db.all<any>('cycles', { id: 'demo-cycle-now' }))[0];

    // reglas de nominación
    await expect(handle(db, camila, 'nominate', { nomineeId: camila.id, valueKey: 'invisible', whatDid: long, whyMattered: long }))
      .rejects.toThrow(/nominarte/);
    await expect(handle(db, camila, 'nominate', { nomineeId: felipe.id, valueKey: 'invisible', whatDid: 'corto', whyMattered: long }))
      .rejects.toThrow(/mínimo 60/);
    await handle(db, camila, 'nominate', { nomineeId: felipe.id, valueKey: 'invisible', whatDid: long, whyMattered: long });
    await expect(handle(db, camila, 'nominate', { nomineeId: felipe.id, valueKey: 'invisible', whatDid: long, whyMattered: long }))
      .rejects.toThrow(/Ya nominaste/);
    await handle(db, camila, 'nominate', { nomineeId: (await who('sofia')).id, valueKey: 'invisible', whatDid: long, whyMattered: long });
    await expect(handle(db, camila, 'nominate', { nomineeId: (await who('mateo')).id, valueKey: 'invisible', whatDid: long, whyMattered: long }))
      .rejects.toThrow(/Ya usaste/);

    // un miembro no puede entrar al panel
    await expect(handle(db, camila, 'adminState', {})).rejects.toThrow(/comité/);

    // comité aprueba todas
    let st = (await handle(db, laura, 'adminState', {})) as AdminState;
    for (const n of st.nominations) await handle(db, laura, 'adminReviewNomination', { id: n.id, status: 'approved' });
    await expect(handle(db, laura, 'adminReviewNomination', { id: st.nominations[0].id, status: 'rejected' })).rejects.toThrow(/motivo/);

    await handle(db, laura, 'adminSetStatus', { cycleId: cycle.id, status: 'selection' });
    st = (await handle(db, laura, 'adminState', {})) as AdminState;
    const nominees = [...new Set(st.nominations.map((n) => n.nominee_id))];
    expect(nominees.length).toBeGreaterThanOrEqual(3);
    await handle(db, laura, 'adminSetFinalists', { cycleId: cycle.id, nomineeIds: nominees });

    // cobertura: no se abre sin confirmar
    const err = await handle(db, laura, 'adminSetStatus', { cycleId: cycle.id, status: 'voting' }).catch((e) => e as ApiError);
    expect((err as ApiError).code).toBe('coverage');
    await handle(db, laura, 'adminSetStatus', { cycleId: cycle.id, status: 'voting', force: true });

    // voto secreto
    const [a, b, c] = nominees;
    const voters = ['andres', 'camila', 'mateo', 'tomas', 'natalia'];
    const picks = [a, a, b, b, c];
    for (let i = 0; i < voters.length; i++) {
      const p = await who(voters[i]);
      if (picks[i] === p.id) continue;
      await handle(db, p, 'setVotes', { nomineeIds: [picks[i]] });
    }
    const andres = await who('andres');
    await expect(handle(db, andres, 'setVotes', { nomineeIds: [andres.id] })).rejects.toThrow(/ti mismo/);
    await expect(handle(db, andres, 'setVotes', { nomineeIds: [a, b] })).rejects.toThrow(/un solo voto/);
    const boot: any = await handle(db, andres, 'bootstrap', {});
    expect(JSON.stringify(boot)).not.toContain('voter_id');
    await expect(handle(db, andres, 'results', {})).rejects.toThrow(/todavía/);

    await handle(db, laura, 'adminSetStatus', { cycleId: cycle.id, status: 'closed' });
    st = (await handle(db, laura, 'adminState', {})) as AdminState;
    expect(st.winners.length + (st.tie?.slots ?? 0)).toBe(2);
    if (st.tie) {
      await expect(handle(db, laura, 'adminResolveTie', { cycleId: cycle.id, nomineeIds: [st.tie.candidates[0].person.id], note: '' })).rejects.toThrow(/nota/);
      await handle(db, laura, 'adminResolveTie', { cycleId: cycle.id, nomineeIds: [st.tie.candidates[0].person.id], note: 'Decidimos por sorteo' });
    }
    await handle(db, laura, 'adminSetStatus', { cycleId: cycle.id, status: 'published' });
    const res: any = await handle(db, andres, 'results', {});
    expect(res.winners).toHaveLength(2);
  });
});

describe('desempate', () => {
  it('sin empate: gana por votos', () => {
    const o = computeOutcome(2, ['a', 'b', 'c'], { a: 5, b: 3, c: 1 }, new Set());
    expect(o.clear.map((w) => w.nominee_id)).toEqual(['a', 'b']);
    expect(o.tie).toBeNull();
  });
  it('empate por el 2.º: gana quien no ha sido reconocido en el año', () => {
    const o = computeOutcome(2, ['a', 'b', 'c'], { a: 5, b: 3, c: 3 }, new Set(['b']));
    expect(o.clear.map((w) => w.nominee_id)).toEqual(['a', 'c']);
    expect(o.clear[1].tie_note).toMatch(/no había sido reconocido/);
    expect(o.tie).toBeNull();
  });
  it('si persiste el empate, decide el comité', () => {
    const o = computeOutcome(2, ['a', 'b', 'c'], { a: 5, b: 3, c: 3 }, new Set());
    expect(o.clear.map((w) => w.nominee_id)).toEqual(['a']);
    expect(o.tie?.slots).toBe(1);
    expect(o.tie?.candidateIds.sort()).toEqual(['b', 'c']);
  });
  it('empate por el 1.º entre dos: ambos ganan', () => {
    const o = computeOutcome(2, ['a', 'b', 'c'], { a: 4, b: 4, c: 1 }, new Set());
    expect(o.clear.map((w) => w.nominee_id).sort()).toEqual(['a', 'b']);
  });
});

describe('personas', () => {
  it('importa por correo sin duplicar y valida jefaturas', async () => {
    const { db, who } = setup();
    const laura = await who('laura');
    const r: any = await handle(db, laura, 'adminImportPeople', { rows: [
      { full_name: 'Ana Prueba', cargo: 'Auxiliar', jefatura: 'exito academico', email: 'ana@unisabana.edu.co' },
      { full_name: 'Ana Prueba 2', cargo: 'Auxiliar', jefatura: 'Éxito Académico', email: 'ANA@unisabana.edu.co;' },
      { full_name: 'Sin jefatura', jefatura: 'Marte', email: 'x@y.co' },
    ] });
    expect(r.created).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.errors).toHaveLength(1);
  });
});
