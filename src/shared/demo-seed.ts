import type { Snapshot } from './memory-db';

const DAY = 86_400_000;

/** Personas ficticias para el modo demostración. Ningún dato real. */
const PEOPLE: [string, string, string, string, 'member' | 'committee'][] = [
  ['Laura Gómez', 'Coordinadora de Experiencia', 'Experiencia del Estudiante', 'laura', 'committee'],
  ['Andrés Rincón', 'Profesional de Acompañamiento', 'Experiencia del Estudiante', 'andres', 'member'],
  ['Mariana León', 'Auxiliar Administrativa', 'Experiencia del Estudiante', 'mariana', 'committee'],
  ['Camila Torres', 'Gestora Cultural', 'Desarrollo Cultural, Protocolo y Eventos', 'camila', 'member'],
  ['Julián Pardo', 'Coordinador de Protocolo', 'Desarrollo Cultural, Protocolo y Eventos', 'julian', 'committee'],
  ['Esteban Quintero', 'Productor de Eventos', 'Desarrollo Cultural, Protocolo y Eventos', 'esteban', 'member'],
  ['Valentina Ruiz', 'Asesora Académica', 'Éxito Académico', 'valentina', 'member'],
  ['Santiago Mejía', 'Tutor Par', 'Éxito Académico', 'santiago', 'member'],
  ['Natalia Herrera', 'Psicóloga', 'Prevención y Salud', 'natalia', 'committee'],
  ['Felipe Cárdenas', 'Enfermero', 'Prevención y Salud', 'felipe', 'member'],
  ['Daniela Ospina', 'Entrenadora de Voleibol', 'Desarrollo Deportivo', 'daniela', 'member'],
  ['Mateo Vargas', 'Coordinador Deportivo', 'Desarrollo Deportivo', 'mateo', 'committee'],
  ['Sofía Castaño', 'Analista de Becas', 'Gestión de Becarios', 'sofia', 'member'],
  ['Tomás Beltrán', 'Gestor de Becarios', 'Gestión de Becarios', 'tomas', 'committee'],
];

export function demoSeed(now = new Date()): Snapshot {
  const ts = (offset: number) => new Date(now.getTime() + offset).toISOString();
  const people = PEOPLE.map(([full_name, cargo, jefatura, slug, role], i) => ({
    id: `demo-${slug}`, full_name, cargo, jefatura, email: `demo.${slug}@conexion.test`,
    photo_url: null, role, active: true, is_demo: true, created_at: ts(-90 * DAY + i),
  }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const cycles = [
    {
      id: 'demo-cycle-prev', cycle_type: 'conexion', month: prevMonth, year: prevYear, value_key: 'trabajo_en_equipo',
      status: 'published', nominations_close_at: ts(-35 * DAY), voting_close_at: ts(-28 * DAY), winners_count: 2,
      lock_value: false, max_nominations: 2, votes_per_person: 1, max_finalists: 12, created_at: ts(-45 * DAY),
    },
    {
      id: 'demo-cycle-now', cycle_type: 'conexion', month, year, value_key: 'invisible',
      status: 'nominations', nominations_close_at: ts(7 * DAY), voting_close_at: ts(14 * DAY), winners_count: 2,
      lock_value: false, max_nominations: 2, votes_per_person: 1, max_finalists: 12, created_at: ts(-3 * DAY),
    },
  ];
  const nom = (id: string, cycle: string, nominee: string, by: string, value: string, what: string, why: string, status = 'approved') => ({
    id, cycle_id: cycle, nominee_id: `demo-${nominee}`, nominator_id: `demo-${by}`, value_key: value,
    what_did: what, why_mattered: why, status, reject_reason: null, created_at: ts(-40 * DAY),
  });
  const nominations = [
    nom('n1', 'demo-cycle-prev', 'daniela', 'felipe', 'trabajo_en_equipo',
      'Coordinó los horarios de tres equipos deportivos para que todos pudieran usar la cancha sin cruces durante el torneo interno.',
      'Gracias a eso el torneo salió sin quejas y varios estudiantes que casi no jugaban pudieron participar.'),
    nom('n2', 'demo-cycle-prev', 'esteban', 'camila', 'trabajo_en_equipo',
      'Se quedó hasta tarde armando la tarima con el equipo de logística y ayudó a otras áreas que se habían quedado cortas de manos.',
      'El evento abrió a tiempo y varias personas del equipo sintieron que no estaban solas en la carga de trabajo.'),
    nom('n3', 'demo-cycle-prev', 'valentina', 'santiago', 'trabajo_en_equipo',
      'Preparó un resumen de casos para que los tutores pares tuvieran el mismo lenguaje al acompañar a los estudiantes.',
      'Los tutores se sintieron más seguros y los estudiantes recibieron un acompañamiento más coherente.'),
    nom('p1', 'demo-cycle-now', 'felipe', 'natalia', 'invisible',
      'Revisó y repuso el botiquín de todas las sedes sin que nadie se lo pidiera, y dejó un registro para que el siguiente turno lo continúe.',
      'Cuando hubo una emergencia pequeña en el campus todo estaba a mano y se resolvió en minutos.', 'pending'),
    nom('p2', 'demo-cycle-now', 'sofia', 'tomas', 'invisible',
      'Depuró durante semanas la base de becarios para corregir datos duplicados antes del reporte semestral.',
      'El reporte salió limpio y se evitaron confusiones con estudiantes que dependen de su beca.', 'pending'),
    nom('p3', 'demo-cycle-now', 'andres', 'laura', 'invisible',
      'Hizo seguimiento uno a uno a estudiantes que habían dejado de asistir a los talleres y los reconectó con el programa.',
      'Varios de ellos volvieron a participar y uno nos contó que casi abandona la universidad.', 'pending'),
  ];
  return {
    people, cycles, nominations,
    finalists: [
      { cycle_id: 'demo-cycle-prev', nominee_id: 'demo-daniela' },
      { cycle_id: 'demo-cycle-prev', nominee_id: 'demo-esteban' },
      { cycle_id: 'demo-cycle-prev', nominee_id: 'demo-valentina' },
    ],
    votes: [],
    winners: [
      { cycle_id: 'demo-cycle-prev', nominee_id: 'demo-daniela', position: 1, votes: 5, prize_choice: 'kit_institucional', tie_note: null },
      { cycle_id: 'demo-cycle-prev', nominee_id: 'demo-esteban', position: 2, votes: 4, prize_choice: null, tie_note: null },
    ],
  };
}
