export type CycleStatus = 'draft' | 'nominations' | 'selection' | 'voting' | 'closed' | 'published';
export type NominationStatus = 'pending' | 'approved' | 'rejected';
export type Role = 'member' | 'committee';

export interface Person {
  id: string;
  full_name: string;
  cargo: string;
  jefatura: string;
  email: string;
  photo_url: string | null;
  role: Role;
  active: boolean;
  is_demo: boolean;
  created_at: string;
}

/** Lo que cualquier miembro puede ver de otra persona (sin correo ni rol). */
export interface PublicPerson {
  id: string;
  full_name: string;
  cargo: string;
  jefatura: string;
  photo_url: string | null;
}

export interface Cycle {
  id: string;
  cycle_type: string;
  month: number;
  year: number;
  value_key: string;
  status: CycleStatus;
  nominations_close_at: string | null;
  voting_close_at: string | null;
  winners_count: number;
  lock_value: boolean;
  max_nominations: number;
  votes_per_person: number;
  max_finalists: number;
  created_at: string;
}

export interface Nomination {
  id: string;
  cycle_id: string;
  nominee_id: string;
  nominator_id: string;
  value_key: string;
  what_did: string;
  why_mattered: string;
  status: NominationStatus;
  reject_reason: string | null;
  created_at: string;
}

export interface Finalist {
  cycle_id: string;
  nominee_id: string;
}

export interface Vote {
  id: string;
  cycle_id: string;
  voter_id: string;
  nominee_id: string;
  created_at: string;
}

export interface Winner {
  cycle_id: string;
  nominee_id: string;
  position: number;
  votes: number;
  prize_choice: string | null;
  tie_note: string | null;
}

export type TableName = 'people' | 'cycles' | 'nominations' | 'finalists' | 'votes' | 'winners';

export interface Db {
  all<T = any>(table: TableName, where?: Record<string, unknown>): Promise<T[]>;
  insert<T = any>(table: TableName, rows: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]>;
  update<T = any>(table: TableName, where: Record<string, unknown>, patch: Record<string, unknown>): Promise<T[]>;
  remove(table: TableName, where: Record<string, unknown>): Promise<void>;
  /** Guarda una foto (data URL) y devuelve la URL con la que se mostrará. */
  uploadPhoto(personId: string, dataUrl: string): Promise<string>;
}

// ---------- Respuestas de la API ----------

export interface Quote {
  value_key: string;
  what_did: string;
  why_mattered: string;
}

export interface BootstrapData {
  me: PublicPerson & { role: Role };
  cycle: Cycle | null;
  people: PublicPerson[];
  progress: { done: number; total: number };
  myNominations: Pick<Nomination, 'id' | 'nominee_id' | 'status' | 'value_key'>[];
  myVoteIds: string[];
  serverNow: string;
}

export interface FinalistCard {
  person: PublicPerson;
  quotes: Quote[];
}

export interface ResultsData {
  cycle: Cycle;
  ranking: { person: PublicPerson; votes: number; isWinner: boolean }[];
  winners: {
    person: PublicPerson;
    position: number;
    votes: number;
    prize_choice: string | null;
    tie_note: string | null;
    quotes: Quote[];
  }[];
  myWinner: boolean;
  myPrize: string | null;
}

export interface WallEntry {
  cycle: Cycle;
  winners: { person: PublicPerson; position: number; quote: Quote | null }[];
}

export interface TieInfo {
  slots: number;
  candidates: { person: PublicPerson & { role: Role }; votes: number; recognizedBefore: boolean; abstain: boolean }[];
  note: string;
}

export interface AdminNomination extends Nomination {
  nominee: PublicPerson;
  nominator: PublicPerson;
}

export interface AdminState {
  cycles: Cycle[];
  cycle: Cycle | null;
  people: Person[];
  nominations: AdminNomination[];
  finalistIds: string[];
  tally: Record<string, number> | null;
  votersCount: number;
  nominatorsCount: number;
  winners: (Winner & { person: PublicPerson })[];
  recognized: Record<string, { month: number; year: number }[]>;
  tie: TieInfo | null;
  expectedWinners: number;
}

export interface RecognitionRow {
  year: number;
  month: number;
  value: string;
  name: string;
  cargo: string;
  jefatura: string;
  position: number;
  votes: number;
  prize: string;
  quote_what: string;
  quote_why: string;
}

export interface ImportRow {
  full_name: string;
  cargo?: string;
  jefatura: string;
  email: string;
  photo_url?: string;
  role?: string;
}
