import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db, TableName } from './types';
import { ApiError } from './errors';

const PAGE = 1000;

/** Adaptador de Supabase (Postgres). Solo se usa en el servidor, con la llave de servicio. */
export class SupabaseDb implements Db {
  constructor(private sb: SupabaseClient) {}

  private check(error: { message: string; code?: string } | null) {
    if (!error) return;
    if (error.code === '23505') throw new ApiError(409, 'Ese registro ya existe.');
    throw new ApiError(500, 'Error en la base de datos: ' + error.message);
  }

  async all<T = any>(table: TableName, where: Record<string, unknown> = {}) {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb.from(table).select('*').match(where).range(from, from + PAGE - 1);
      this.check(error);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async insert<T = any>(table: TableName, rows: Record<string, unknown> | Record<string, unknown>[]) {
    const { data, error } = await this.sb.from(table).insert(rows as any).select();
    this.check(error);
    return (data ?? []) as T[];
  }

  async update<T = any>(table: TableName, where: Record<string, unknown>, patch: Record<string, unknown>) {
    const { data, error } = await this.sb.from(table).update(patch).match(where).select();
    this.check(error);
    return (data ?? []) as T[];
  }

  async remove(table: TableName, where: Record<string, unknown>) {
    const { error } = await this.sb.from(table).delete().match(where);
    this.check(error);
  }

  async uploadPhoto(personId: string, dataUrl: string) {
    const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) throw new ApiError(400, 'Foto no válida.');
    const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
    const path = `${personId}.${ext}`;
    const { error } = await this.sb.storage.from('fotos').upload(path, Buffer.from(m[2], 'base64'), { contentType: m[1], upsert: true });
    this.check(error);
    const { data } = this.sb.storage.from('fotos').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }
}
