-- SimplyTasks — Supabase schema + Row-Level Security
-- Run this whole file in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: everything uses "if not exists" / "or replace" / "drop ... if exists".
--
-- Timestamps (created_at / updated_at / due_date) are stored as epoch
-- MILLISECONDS in bigint columns, to exactly match the local SQLite
-- representation. That makes last-write-wins comparisons trivial and avoids
-- any timezone/format drift between device and server.

------------------------------------------------------------------------
-- 1. profiles — a public mirror of auth.users.
--    Clients cannot query auth.users directly, so we need this to resolve
--    "share with this email" to a user id, and to show member names.
------------------------------------------------------------------------
create table if not exists public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name  text
);

-- Automatically create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------
-- 2. core tables
------------------------------------------------------------------------
create table if not exists public.lists (
  id         uuid primary key,
  name       text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted    boolean not null default false
);

create table if not exists public.list_members (
  list_id    uuid not null references public.lists(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'editor',      -- 'owner' | 'editor' | 'viewer'
  created_at bigint not null,
  primary key (list_id, user_id)
);

create table if not exists public.tasks (
  id         uuid primary key,
  list_id    uuid not null references public.lists(id) on delete cascade,
  title      text not null,
  notes      text,
  due_date   bigint,
  completed  boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  deleted    boolean not null default false
);

------------------------------------------------------------------------
-- 3. helper functions
--    SECURITY DEFINER so they bypass RLS internally — this is what prevents
--    infinite recursion between the lists and list_members policies (each
--    would otherwise need to read the other under RLS).
------------------------------------------------------------------------
create or replace function public.is_member(_list_id uuid, _user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.list_members
     where list_id = _list_id and user_id = _user_id
  );
$$;

create or replace function public.is_owner(_list_id uuid, _user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.lists
     where id = _list_id and owner_id = _user_id
  );
$$;

------------------------------------------------------------------------
-- 4. enable RLS + policies
------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.lists         enable row level security;
alter table public.list_members  enable row level security;
alter table public.tasks         enable row level security;

-- profiles: any signed-in user may read (needed to look up share targets by
-- email); may update only their own row.
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- lists: members can read/update; you can only insert a list you own.
drop policy if exists "lists_select" on public.lists;
create policy "lists_select" on public.lists
  for select to authenticated using (public.is_member(id, auth.uid()));

drop policy if exists "lists_insert" on public.lists;
create policy "lists_insert" on public.lists
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "lists_update" on public.lists;
create policy "lists_update" on public.lists
  for update to authenticated
  using (public.is_member(id, auth.uid()))
  with check (public.is_member(id, auth.uid()));

-- list_members: members can see the roster; you can insert yourself (when
-- creating a list) or, as the owner, add others; only the owner changes roles.
drop policy if exists "members_select" on public.list_members;
create policy "members_select" on public.list_members
  for select to authenticated using (public.is_member(list_id, auth.uid()));

drop policy if exists "members_insert" on public.list_members;
create policy "members_insert" on public.list_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_owner(list_id, auth.uid()));

drop policy if exists "members_update" on public.list_members;
create policy "members_update" on public.list_members
  for update to authenticated
  using (public.is_owner(list_id, auth.uid()))
  with check (public.is_owner(list_id, auth.uid()));

-- tasks: full read/write for any member of the task's list.
drop policy if exists "tasks_all" on public.tasks;
create policy "tasks_all" on public.tasks
  for all to authenticated
  using (public.is_member(list_id, auth.uid()))
  with check (public.is_member(list_id, auth.uid()));
