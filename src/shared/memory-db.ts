import type { Db, TableName } from './types';

const TABLES: TableName[] = ['people', 'cycles', 'nominations', 'finalists', 'votes', 'winners'];
const WITH_ID = new Set<TableName>(['people', 'cycles', 'nominations', 'votes']);
const uid = () =>
  (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
  'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export type Snapshot = Record<TableName, any[]>;

/** Base de datos en memoria (con persistencia opcional). La usa el modo demostración y las pruebas. */
export class MemoryDb implements Db {
  data: Snapshot;
  private onChange?: (s: Snapshot) => void;

  constructor(seed?: Partial<Snapshot>, onChange?: (s: Snapshot) => void) {
    this.data = Object.fromEntries(TABLES.map((t) => [t, [...(seed?.[t] ?? [])]])) as Snapshot;
    this.onChange = onChange;
  }

  private save() { this.onChange?.(this.data); }

  private match(row: any, where?: Record<string, unknown>) {
    return !where || Object.entries(where).every(([k, v]) => row[k] === v);
  }

  async all<T = any>(table: TableName, where?: Record<string, unknown>) {
    return this.data[table].filter((r) => this.match(r, where)).map((r) => ({ ...r })) as T[];
  }

  async insert<T = any>(table: TableName, rows: Record<string, unknown> | Record<string, unknown>[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    const out = list.map((r) => {
      const row: any = { ...r };
      if (WITH_ID.has(table) && !row.id) row.id = uid();
      if (table !== 'finalists' && table !== 'winners' && !row.created_at) row.created_at = new Date().toISOString();
      this.data[table].push(row);
      return { ...row };
    });
    this.save();
    return out as T[];
  }

  async update<T = any>(table: TableName, where: Record<string, unknown>, patch: Record<string, unknown>) {
    const out: any[] = [];
    for (const r of this.data[table]) if (this.match(r, where)) { Object.assign(r, patch); out.push({ ...r }); }
    this.save();
    return out as T[];
  }

  async remove(table: TableName, where: Record<string, unknown>) {
    this.data[table] = this.data[table].filter((r) => !this.match(r, where));
    this.save();
  }

  async uploadPhoto(_personId: string, dataUrl: string) { return dataUrl; }
}
