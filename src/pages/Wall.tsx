import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Avatar } from '../ui/Avatar';
import { Spinner, useToast } from '../ui/bits';
import { monthName, valueByKey } from '../shared/constants';
import type { WallEntry } from '../shared/types';

export default function Wall() {
  const [rows, setRows] = useState<WallEntry[] | null>(null);
  const toast = useToast();
  useEffect(() => { api<WallEntry[]>('wall').then(setRows).catch((e) => toast(e.message, 'error')); }, []); // eslint-disable-line
  if (!rows) return <div className="page"><Spinner /></div>;

  return (
    <section className="wall page">
      <h1 className="display huge">Muro de reconocidos</h1>
      <p className="lead">Lo que se reconoce queda a la vista, no solo en el anuncio del mes.</p>
      {!rows.length && <p className="empty">Todavía no hay personas reconocidas. El primer ciclo aparecerá aquí cuando se publiquen sus resultados.</p>}
      {rows.map(({ cycle, winners }) => {
        const v = valueByKey(cycle.value_key);
        return (
          <article key={cycle.id} className="wall-cycle">
            <header>
              <h2 className="display">{monthName(cycle.month)} {cycle.year}</h2>
              <span className="vtag">{v.emoji} {v.name}</span>
            </header>
            <div className="wall-winners">
              {winners.map((w) => (
                <div key={w.person.id} className="wall-card">
                  <Avatar person={w.person} size={72} className="gold-ring" />
                  <div>
                    <h3>{w.person.full_name}</h3>
                    <p className="cargo">{w.person.cargo}</p>
                    {w.quote && <blockquote>“{w.quote.what_did} {w.quote.why_mattered}”</blockquote>}
                  </div>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}
