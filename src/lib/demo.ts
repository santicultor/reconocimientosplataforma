import { MemoryDb, type Snapshot } from '../shared/memory-db';
import { demoSeed } from '../shared/demo-seed';
import { handle } from '../shared/logic';
import type { Person } from '../shared/types';

const KEY = 'conexion-demo-v2';
const USER = 'conexion-demo-user';
let db: MemoryDb | null = null;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

function load(): MemoryDb {
  if (db) return db;
  let seed: Snapshot | undefined;
  const raw = read(KEY);
  if (raw) { try { seed = JSON.parse(raw); } catch { /* usa semilla */ } }
  db = new MemoryDb(seed ?? demoSeed(), (s) => write(KEY, JSON.stringify(s)));
  if (!seed) write(KEY, JSON.stringify(db.data));
  return db;
}

export function demoPeople(): Person[] { return load().data.people as Person[]; }
export const demoUserId = () => read(USER) ?? 'demo-andres';
export const setDemoUser = (id: string) => write(USER, id);

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
  db = null;
  load();
}

export async function demoCall(action: string, payload: unknown) {
  const d = load();
  const people = d.data.people as Person[];
  const me = people.find((p) => p.id === demoUserId()) ?? people[0];
  await new Promise((r) => setTimeout(r, 120)); // se siente como una red real
  return handle(d, me, action, payload);
}
