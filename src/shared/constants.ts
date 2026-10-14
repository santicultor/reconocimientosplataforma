import type { CycleStatus } from './types';

// Las descripciones de los valores son un borrador: Admin puede ajustarlas aquí.
export const VALUES = [
  { key: 'trabajo_bien_hecho', emoji: '🎯', name: 'Trabajo bien hecho', desc: 'Hacer las cosas con cuidado, criterio y calidad, incluso cuando nadie lo está mirando.' },
  { key: 'trabajo_en_equipo', emoji: '🤝', name: 'Trabajo en equipo', desc: 'Sumar con otros: compartir, apoyar y lograr juntos lo que solos no se lograría.' },
  { key: 'invisible', emoji: '🪄', name: 'Trabajo invisible', desc: 'Lo que sostiene todo y casi nunca se nota: los detalles, los apoyos, lo que evita problemas.' },
  { key: 'innovacion_servicio', emoji: '💡', name: 'Innovación y servicio', desc: 'Encontrar mejores maneras de servir a los estudiantes y a las personas del equipo.' },
  { key: 'cuidado_sostenibilidad', emoji: '🌱', name: 'Cuidado y sostenibilidad', desc: 'Cuidar a las personas, los recursos y los procesos para que lo bueno dure.' },
] as const;

export type ValueKey = (typeof VALUES)[number]['key'];

export const valueByKey = (key: string) => VALUES.find((v) => v.key === key) ?? VALUES[2];

export const JEFATURAS = [
  { name: 'Experiencia del Estudiante', short: 'Experiencia', color: '#6EA8FF' },
  { name: 'Desarrollo Cultural, Protocolo y Eventos', short: 'Cultura y Eventos', color: '#E39BFF' },
  { name: 'Éxito Académico', short: 'Éxito Académico', color: '#6FE3B3' },
  { name: 'Prevención y Salud', short: 'Prevención y Salud', color: '#FF9C9C' },
  { name: 'Desarrollo Deportivo', short: 'Deportivo', color: '#FFC46B' },
  { name: 'Gestión de Becarios', short: 'Becarios', color: '#9DA6FF' },
] as const;

export const jefaturaInfo = (name: string) =>
  JEFATURAS.find((j) => j.name === name) ?? { name, short: name, color: '#9FB3D9' };

export const PRIZES = [
  { key: 'bono_aliados', emoji: '🎁', name: 'Bono Aliados', detail: 'Para usar en comercios aliados' },
  { key: 'jaime_duque_cine', emoji: '🦁', name: 'Pasaporte Parque Jaime Duque + Cine', detail: 'Un plan de día completo' },
  { key: 'multiparque_cine', emoji: '🎢', name: 'Entrada Multiparque + Cine', detail: 'Diversión y película' },
  { key: 'kit_institucional', emoji: '🧢', name: 'Kit Institucional', detail: 'Hoodie + gorra' },
] as const;

export const prizeByKey = (key: string | null | undefined) => PRIZES.find((p) => p.key === key) ?? null;

export const MIN_CHARS = 60;

export const STATUS_ORDER: CycleStatus[] = ['draft', 'nominations', 'selection', 'voting', 'closed', 'published'];

export const STATUS_LABEL: Record<CycleStatus, string> = {
  draft: 'Borrador',
  nominations: 'Nominaciones abiertas',
  selection: 'Selección de finalistas',
  voting: 'Votación abierta',
  closed: 'Votación cerrada',
  published: 'Resultados publicados',
};

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const monthName = (m: number) => MONTHS[(m - 1 + 12) % 12];

export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Devuelve el nombre oficial de la jefatura, tolerando tildes, mayúsculas y abreviaturas comunes. */
export function normalizeJefatura(input: string): string | null {
  const n = normalizeText(input);
  if (!n) return null;
  for (const j of JEFATURAS) {
    if (normalizeText(j.name) === n || normalizeText(j.short) === n) return j.name;
  }
  if (n.includes('cultur') || n.includes('protocolo')) return JEFATURAS[1].name;
  if (n.includes('exito') || n.includes('academ')) return JEFATURAS[2].name;
  if (n.includes('prevencion') || n.includes('salud')) return JEFATURAS[3].name;
  if (n.includes('deport')) return JEFATURAS[4].name;
  if (n.includes('becari')) return JEFATURAS[5].name;
  if (n.includes('experiencia')) return JEFATURAS[0].name;
  return null;
}

export const DEFAULT_PLACEHOLDERS_WHAT = [
  'Ej: Reorganizó solo el inventario del taller antes de la semana de bienvenida, sin que nadie se lo pidiera.',
  'Ej: Acompañó a un estudiante en crisis hasta que se sintió seguro, y luego hizo el seguimiento por su cuenta.',
  'Ej: Rehízo el formato de inscripción para que los estudiantes lo llenen en dos minutos.',
];
export const DEFAULT_PLACEHOLDERS_WHY = [
  'Ej: Gracias a eso el evento arrancó a tiempo y nadie notó el problema que se evitó.',
  'Ej: Ese estudiante hoy sigue en la universidad y encontró una red de apoyo.',
  'Ej: Bajó la cantidad de errores y le ahorró horas de trabajo a todo el equipo.',
];
