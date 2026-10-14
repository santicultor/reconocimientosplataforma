import { Link } from 'react-router-dom';
import { useData } from '../lib/app';
import { Countdown } from '../ui/bits';
import { STATUS_LABEL, STATUS_ORDER, monthName, valueByKey } from '../shared/constants';
import { fmtDateTime } from '../lib/format';

export default function Home() {
  const { cycle, progress, myNominations, myVoteIds, me } = useData();

  if (!cycle)
    return (
      <section className="page home">
        <div className="hero-empty">
          <h1 className="display">Hola, {me.full_name.split(' ')[0]}</h1>
          <p className="lead">Todavía no hay un ciclo de reconocimientos. Cuando el comité abra el primero, lo verás aquí.</p>
        </div>
      </section>
    );

  const value = valueByKey(cycle.value_key);
  const s = cycle.status;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const idx = STATUS_ORDER.indexOf(s);

  const cta =
    s === 'nominations' ? { to: '/nominar', text: 'Nominar a un compañero' } :
    s === 'voting' ? { to: '/muro', text: myVoteIds.length ? 'Ver o cambiar mi voto' : 'Votar' } :
    s === 'published' ? { to: '/resultados', text: 'Ver resultados' } : null;

  const waiting: Record<string, string> = {
    draft: 'El comité está preparando este ciclo. Muy pronto abrimos las nominaciones.',
    selection: 'Cerraron las nominaciones. El comité está armando la lista de finalistas.',
    closed: 'La votación terminó. El comité está confirmando a las personas ganadoras.',
  };

  return (
    <section className="page home">
      <div className="hero">
        <p className="mono-label">Ciclo de {monthName(cycle.month)} · {cycle.year}</p>
        <div className="value-emoji" aria-hidden="true">{value.emoji}</div>
        <h1 className="display huge">{value.name}</h1>
        <p className="lead">{value.desc}</p>
      </div>

      <ol className="phases" aria-label="Fases del ciclo">
        {STATUS_ORDER.map((st, i) => (
          <li key={st} className={i < idx ? 'done' : i === idx ? 'now' : ''} aria-current={i === idx ? 'step' : undefined}>
            <span className="dot" />
            <span className="phase-name">{i === idx ? STATUS_LABEL[st] : ''}</span>
          </li>
        ))}
      </ol>

      <div className="home-grid">
        {s === 'nominations' && <Countdown to={cycle.nominations_close_at} label="Cierran las nominaciones" />}
        {s === 'voting' && <Countdown to={cycle.voting_close_at} label="Cierra la votación" />}
        {(s === 'nominations' || s === 'voting') && (
          <div className="progress-card">
            <p><b>{progress.done}</b> de {progress.total} ya participaron</p>
            <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
            <small>Es un conteo anónimo: no mostramos quiénes.</small>
          </div>
        )}
        {s === 'nominations' && (
          <p className="my-status">Tus nominaciones: <b>{myNominations.length} de {cycle.max_nominations}</b> · cierran el {fmtDateTime(cycle.nominations_close_at)}</p>
        )}
        {s === 'voting' && (
          <p className="my-status">{myVoteIds.length ? 'Tu voto está registrado. Puedes cambiarlo hasta el cierre.' : 'Aún no has votado.'}</p>
        )}
        {waiting[s] && <p className="my-status">{waiting[s]}</p>}
      </div>

      {cta && <Link to={cta.to} className="btn gold big">{cta.text}</Link>}
      {s !== 'voting' && <Link to="/muro" className="link soft">Ver el muro de reconocidos</Link>}
    </section>
  );
}
