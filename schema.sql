create extension if not exists "pgcrypto";

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  daily_rate numeric not null default 0,
  monthly_salary numeric not null default 0,
  work_days numeric not null default 0,
  overtime_hours numeric not null default 0,
  overtime_rate numeric not null default 0,
  advance numeric not null default 0
);

alter table workers add column if not exists monthly_salary numeric not null default 0;
alter table workers add column if not exists work_days numeric not null default 0;
alter table workers add column if not exists overtime_hours numeric not null default 0;
alter table workers add column if not exists overtime_rate numeric not null default 0;
alter table workers add column if not exists advance numeric not null default 0;
create table if not exists worker_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  entry_date date not null,
  days numeric not null default 1,
  attendance numeric not null default 0,
  overtime_hours numeric not null default 0
);
alter table worker_entries add column if not exists attendance numeric not null default 0;
alter table worker_entries add column if not exists overtime_hours numeric not null default 0;
create table if not exists diggers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric not null default 0,
  service_hours numeric not null default 0
);
alter table diggers add column if not exists service_hours numeric not null default 0;
create table if not exists digger_entries (
  id uuid primary key default gen_random_uuid(),
  digger_id uuid not null references diggers(id) on delete cascade,
  entry_date date not null,
  hours numeric not null default 0
);
create table if not exists trucks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hauling_rate numeric not null default 0
);
alter table trucks add column if not exists hauling_rate numeric not null default 0;
create table if not exists truck_entries (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id) on delete cascade,
  entry_date date not null,
  loads numeric not null default 0
);

alter table workers enable row level security;
alter table worker_entries enable row level security;
alter table diggers enable row level security;
alter table digger_entries enable row level security;
alter table trucks enable row level security;
alter table truck_entries enable row level security;

create policy "public workshop access" on workers for all using (true) with check (true);
create policy "public workshop access" on worker_entries for all using (true) with check (true);
create policy "public workshop access" on diggers for all using (true) with check (true);
create policy "public workshop access" on digger_entries for all using (true) with check (true);
create policy "public workshop access" on trucks for all using (true) with check (true);
create policy "public workshop access" on truck_entries for all using (true) with check (true);