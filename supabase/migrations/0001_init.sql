-- Ilościowy: stan kawiarni w chmurze.
-- Jeden dokument JSON (cały stan aplikacji) + licznik wersji (rev) chroniący przed nadpisaniem
-- zmian z innego urządzenia + automatyczna historia wersji.

-- Kto może się zalogować i widzieć dane (adresy e-mail, małymi literami).
create table if not exists public.allowed_users (
  email text primary key check (email = lower(email))
);

create table if not exists public.app_state (
  id text primary key default 'kawiarnia',
  data jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.app_state_history (
  id bigserial primary key,
  state_id text not null,
  data jsonb not null,
  rev bigint,
  saved_at timestamptz not null default now(),
  saved_by text,
  note text
);
create index if not exists app_state_history_saved_at on public.app_state_history (state_id, saved_at desc);

alter table public.allowed_users enable row level security;
alter table public.app_state enable row level security;
alter table public.app_state_history enable row level security;

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where email = lower(auth.jwt() ->> 'email'))
$$;

drop policy if exists "sam siebie" on public.allowed_users;
create policy "sam siebie" on public.allowed_users for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "dozwoleni czytają" on public.app_state;
create policy "dozwoleni czytają" on public.app_state for select to authenticated using (public.is_allowed());
drop policy if exists "dozwoleni dodają" on public.app_state;
create policy "dozwoleni dodają" on public.app_state for insert to authenticated with check (public.is_allowed());
drop policy if exists "dozwoleni zmieniają" on public.app_state;
create policy "dozwoleni zmieniają" on public.app_state for update to authenticated
  using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "dozwoleni czytają historię" on public.app_state_history;
create policy "dozwoleni czytają historię" on public.app_state_history for select to authenticated using (public.is_allowed());
drop policy if exists "dozwoleni dopisują historię" on public.app_state_history;
create policy "dozwoleni dopisują historię" on public.app_state_history for insert to authenticated with check (public.is_allowed());

-- Przed zmianą stanu odkłada poprzednią wersję do historii — najwyżej raz na godzinę.
create or replace function public.app_state_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.app_state_history
    where state_id = old.id and note is null and saved_at > now() - interval '1 hour'
  ) then
    insert into public.app_state_history (state_id, data, rev, saved_at, saved_by)
    values (old.id, old.data, old.rev, old.updated_at, old.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists app_state_snapshot on public.app_state;
create trigger app_state_snapshot before update on public.app_state
  for each row execute function public.app_state_snapshot();

-- Zapis z kontrolą wersji: zwraca nowy rev albo null, gdy ktoś w międzyczasie zapisał nowszą wersję.
create or replace function public.save_state(p_expected_rev bigint, p_data jsonb) returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  new_rev bigint;
begin
  if p_expected_rev = 0 then
    insert into public.app_state (id, data, rev, updated_by)
    values ('kawiarnia', p_data, 1, auth.jwt() ->> 'email')
    on conflict (id) do nothing
    returning rev into new_rev;
  else
    update public.app_state
    set data = p_data, rev = rev + 1, updated_at = now(), updated_by = auth.jwt() ->> 'email'
    where id = 'kawiarnia' and rev = p_expected_rev
    returning rev into new_rev;
  end if;
  return new_rev;
end $$;

revoke all on function public.save_state(bigint, jsonb) from public, anon;
grant execute on function public.save_state(bigint, jsonb) to authenticated;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- Powiadomienia na żywo o zmianach (drugie urządzenie od razu widzi nową wersję).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;
