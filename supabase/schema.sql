-- ============================================================
-- Conexión · Reconocimientos DBEE — esquema de base de datos
-- Pégalo completo en Supabase → SQL Editor → New query → Run.
-- Ejecútalo UNA sola vez en un proyecto nuevo.
-- ============================================================

create type public.cycle_status as enum ('draft','nominations','selection','voting','closed','published');
create type public.nomination_status as enum ('pending','approved','rejected');
create type public.person_role as enum ('member','committee');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cargo text not null default '',
  jefatura text not null,
  email text not null unique,
  photo_url text,
  role public.person_role not null default 'member',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index people_email_lower_idx on public.people (lower(email));

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  cycle_type text not null default 'conexion',   -- extensible: huella, legado, gala...
  month int not null check (month between 1 and 12),
  year int not null,
  value_key text not null,
  status public.cycle_status not null default 'draft',
  nominations_close_at timestamptz,
  voting_close_at timestamptz,
  winners_count int not null default 2,
  lock_value boolean not null default false,
  max_nominations int not null default 2,
  votes_per_person int not null default 1,
  max_finalists int not null default 12,
  created_at timestamptz not null default now(),
  unique (cycle_type, month, year)
);

create table public.nominations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  nominee_id uuid not null references public.people(id) on delete cascade,
  nominator_id uuid not null references public.people(id) on delete cascade,
  value_key text not null,
  what_did text not null,
  why_mattered text not null,
  status public.nomination_status not null default 'pending',
  reject_reason text,
  created_at timestamptz not null default now(),
  unique (cycle_id, nominator_id, nominee_id)
);

create table public.finalists (
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  nominee_id uuid not null references public.people(id) on delete cascade,
  primary key (cycle_id, nominee_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  voter_id uuid not null references public.people(id) on delete cascade,
  nominee_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cycle_id, voter_id, nominee_id)
);

create table public.winners (
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  nominee_id uuid not null references public.people(id) on delete cascade,
  position int not null,
  votes int not null default 0,
  prize_choice text,
  tie_note text,
  primary key (cycle_id, nominee_id)
);

-- Seguridad: RLS activado y SIN políticas para el navegador.
-- Todo el acceso pasa por la función del servidor (netlify/functions/api.ts),
-- que usa la llave de servicio y es quien protege el voto secreto.
alter table public.people      enable row level security;
alter table public.cycles      enable row level security;
alter table public.nominations enable row level security;
alter table public.finalists   enable row level security;
alter table public.votes       enable row level security;
alter table public.winners     enable row level security;

grant all on public.people, public.cycles, public.nominations,
             public.finalists, public.votes, public.winners to service_role;

-- Lista de correos autorizados (allowlist) para el inicio de sesión
create or replace function public.is_allowed_email(_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where lower(email) = lower(_email) and active)
$$;
grant execute on function public.is_allowed_email(text) to anon, authenticated;

-- Carpeta pública para las fotos de las personas
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Primera persona del comité (puede entrar y luego importar al resto del equipo)
insert into public.people (full_name, cargo, jefatura, email, role)
values ('Santiago Bedoya Barahona', 'Coordinador de Cultura', 'Desarrollo Cultural, Protocolo y Eventos',
        'santiago.bedoya@unisabana.edu.co', 'committee');
