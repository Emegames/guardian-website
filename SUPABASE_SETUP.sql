-- EME GAMES / Supabase - configuración inicial segura
-- Ejecutar en Supabase > SQL Editor.
-- Este script asume que ya creaste las tablas indicadas en el proyecto.

-- =========================================================
-- 1) PROFILES: relación con Auth
-- =========================================================
alter table public.profiles
  add constraint profiles_id_auth_users_fk
  foreign key (id) references auth.users(id) on delete cascade;

-- =========================================================
-- 2) GAME VERSIONS -> GAMES
-- =========================================================
alter table public.game_versions
  add constraint game_versions_game_id_fk
  foreign key (game_id) references public.games(id) on delete cascade;

-- =========================================================
-- 3) DONATIONS -> PROFILES
-- =========================================================
alter table public.donations
  add constraint donations_user_id_fk
  foreign key (user_id) references public.profiles(id) on delete set null;

-- =========================================================
-- 4) RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.news enable row level security;
alter table public.donations enable row level security;
alter table public.site_settings enable row level security;

-- =========================================================
-- 5) POLÍTICAS PÚBLICAS DE LECTURA
-- =========================================================
create policy "Public can read games"
on public.games
for select
to anon, authenticated
using (true);

create policy "Public can read game versions"
on public.game_versions
for select
to anon, authenticated
using (true);

create policy "Public can read published news"
on public.news
for select
to anon, authenticated
using (published = true);

-- =========================================================
-- 6) PROFILES: cada usuario puede leer/actualizar su propio perfil
-- =========================================================
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- =========================================================
-- 7) DONATIONS: el usuario puede ver sus propios registros
-- =========================================================
create policy "Users can read own donations"
on public.donations
for select
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 8) CREAR PROFILE AUTOMÁTICAMENTE AL REGISTRARSE
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'country', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- 9) VALORES POR DEFECTO RECOMENDADOS
-- =========================================================
alter table public.games alter column id set default gen_random_uuid();
alter table public.games alter column created_at set default now();
alter table public.games alter column updated_at set default now();

alter table public.game_versions alter column id set default gen_random_uuid();
alter table public.game_versions alter column created_at set default now();

alter table public.news alter column id set default gen_random_uuid();
alter table public.news alter column created_at set default now();
alter table public.news alter column updated_at set default now();
alter table public.news alter column published set default false;

alter table public.donations alter column id set default gen_random_uuid();
alter table public.donations alter column created_at set default now();

alter table public.site_settings alter column id set default gen_random_uuid();
alter table public.site_settings alter column updated_at set default now();

alter table public.profiles alter column id drop default;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column updated_at set default now();

-- =========================================
-- EME GAMES - DONACIONES / MERCADO PAGO
-- Card Payment Brick + Orders API
-- =========================================
alter table public.donations
  add column if not exists amount_mxn numeric(10,2),
  add column if not exists currency text not null default 'MXN',
  add column if not exists status text not null default 'created',
  add column if not exists external_reference text,
  add column if not exists preference_id text,
  add column if not exists init_point text,
  add column if not exists order_id text,
  add column if not exists payment_id text,
  add column if not exists payment_status_detail text,
  add column if not exists payment_type text,
  add column if not exists payer_email text,
  add column if not exists paid_at timestamptz,
  add column if not exists raw_payment jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists donations_external_reference_uidx
  on public.donations(external_reference)
  where external_reference is not null;
create index if not exists donations_user_id_idx on public.donations(user_id);
create index if not exists donations_status_idx on public.donations(status);
create index if not exists donations_order_id_idx on public.donations(order_id);
create index if not exists donations_payment_id_idx on public.donations(payment_id);

grant select on table public.donations to authenticated;