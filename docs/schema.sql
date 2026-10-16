-- Team Tank: draft Supabase (Postgres) schema
-- Demo scope: one project, four fictional members, no login.
-- Server uses the service-role key; the browser never talks to Supabase directly.

create extension if not exists "pgcrypto";

create type step_status     as enum ('todo', 'in_progress', 'done', 'blocked', 'behind');
create type proposal_kind   as enum ('kickoff', 'replan');
create type proposal_status as enum ('pending', 'approved', 'declined', 'failed_checks');
create type decision        as enum ('accept', 'decline');

-- A project and its raw inputs (T1)
create table projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  rubric_text  text not null,
  due_date     date not null,
  created_at   timestamptz not null default now()
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  skills_text   text not null default '',        -- free text
  prefs_text    text not null default '',        -- free text
  weekly_hours  numeric not null check (weekly_hours >= 0),
  created_at    timestamptz not null default now()
);

-- Output of T2 (rubric interpretation)
create table criteria (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  points      numeric not null check (points >= 0),
  position    int not null default 0
);

-- The live plan: small, owned, dated steps
create table steps (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  criterion_id  uuid references criteria(id) on delete set null,
  title         text not null,
  done_when     text not null,
  hours         numeric not null check (hours > 0),   -- T3 enforces <= 2
  owner_id      uuid references members(id) on delete set null,
  due_date      date,
  status        step_status not null default 'todo',
  deferred      boolean not null default false,
  why_owner     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table step_dependencies (
  step_id             uuid not null references steps(id) on delete cascade,
  depends_on_step_id  uuid not null references steps(id) on delete cascade,
  primary key (step_id, depends_on_step_id),
  check (step_id <> depends_on_step_id)
);

-- Member check-ins; an insert with status blocked/behind is Trigger B
create table checkins (
  id            uuid primary key default gen_random_uuid(),
  step_id       uuid not null references steps(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  status        step_status not null,
  note          text not null default '',
  hours_logged  numeric not null default 0 check (hours_logged >= 0),
  created_at    timestamptz not null default now()
);

-- Every agent call, for the "agent run" record (T2, T4)
create table agent_runs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  task         text not null check (task in ('T2', 'T4')),
  model        text not null,
  input        jsonb not null,
  output       jsonb,
  status       text not null default 'running' check (status in ('running', 'done', 'failed', 'capped')),
  tool_calls   int not null default 0,
  duration_ms  int,
  created_at   timestamptz not null default now()
);

-- The T4 investigation trace shown in the UI (the Level 3 evidence)
create table agent_tool_calls (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs(id) on delete cascade,
  seq         int not null,
  tool_name   text not null,
  tool_input  jsonb not null,
  tool_output jsonb,
  rationale   text,               -- the model's stated reason for this call
  created_at  timestamptz not null default now(),
  unique (run_id, seq)
);

-- T2 / T4 output waiting on T3 checks and the human checkpoints (H1, H2)
create table plan_proposals (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  kind            proposal_kind not null,
  status          proposal_status not null default 'pending',
  payload         jsonb not null,      -- kickoff: full step list; replan: list of changes
  justification   text,
  check_results   jsonb,               -- T3: one entry per manageability check
  agent_run_id    uuid references agent_runs(id) on delete set null,
  trigger_checkin uuid references checkins(id) on delete set null,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

create table proposal_decisions (
  proposal_id  uuid not null references plan_proposals(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  decision     decision not null,
  decided_at   timestamptz not null default now(),
  primary key (proposal_id, member_id)
);

-- Used by T3 check 3 (planned hours per member per week vs. availability)
create view v_member_week_load as
select
  m.id   as member_id,
  m.name as member_name,
  date_trunc('week', s.due_date)::date as week_start,
  sum(s.hours) as planned_hours,
  m.weekly_hours as available_hours
from members m
join steps s on s.owner_id = m.id and s.deferred = false and s.status <> 'done'
group by m.id, m.name, m.weekly_hours, date_trunc('week', s.due_date);

create index on steps (project_id, owner_id);
create index on checkins (step_id, created_at desc);
create index on agent_tool_calls (run_id, seq);
