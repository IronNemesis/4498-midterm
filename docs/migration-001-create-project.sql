-- Run once in the Supabase SQL editor, after docs/schema.sql.
-- Lets the app create projects from uploaded documents and add teammates by email.

alter table members  add column if not exists email text;
alter table projects add column if not exists created_by   uuid;
alter table projects add column if not exists summary      text;
alter table projects add column if not exists milestones   jsonb not null default '[]';
alter table projects add column if not exists source_files jsonb not null default '[]';

create unique index if not exists members_project_email_idx on members (project_id, lower(email));
create index if not exists members_email_idx on members (lower(email));
