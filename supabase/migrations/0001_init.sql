-- =========================================================
-- 0001_init.sql — Esquema inicial de Loop Escolar en Supabase.
-- Tablas usuarios/prendas/reservas, RLS, funciones RPC para las
-- mutaciones que tocan más de una tabla, y el bucket de Storage
-- para las fotos de prendas.
-- Aplicar con: supabase db push
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------

create table public.usuarios (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text not null,
  email     text not null,
  rol       text not null default 'usuario' check (rol in ('usuario', 'almacen', 'admin')),
  creado_en timestamptz not null default now()
);

create table public.prendas (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  talla      text not null,
  defectos   text,
  estado     text not null check (estado in ('pendiente', 'disponible', 'rechazada', 'reservada', 'entregado')),
  donante_id uuid references public.usuarios(id) on delete set null,
  imagen_url text,
  creada     timestamptz not null default now()
);

create table public.reservas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid references public.usuarios(id) on delete set null,
  prenda_id     uuid not null references public.prendas(id) on delete cascade,
  fecha_entrega date not null,
  creada        timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Helper: rol del usuario autenticado, sin recursión de RLS.
-- ---------------------------------------------------------

create function public.mi_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid();
$$;

-- ---------------------------------------------------------
-- Trigger: crea el perfil en usuarios al registrarse en auth.users.
-- ---------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, email, rol)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email), new.email, 'usuario');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Trigger: no dejar la app sin ningún admin (borrado o degradación).
-- ---------------------------------------------------------

create function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.rol = 'admin' and (tg_op = 'DELETE' or new.rol <> 'admin') then
    if (select count(*) from public.usuarios where rol = 'admin') <= 1 then
      raise exception 'No se puede eliminar ni quitar el rol al último administrador.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger proteger_ultimo_admin_upd
  before update on public.usuarios
  for each row execute function public.proteger_ultimo_admin();

create trigger proteger_ultimo_admin_del
  before delete on public.usuarios
  for each row execute function public.proteger_ultimo_admin();

-- ---------------------------------------------------------
-- RLS: usuarios
-- ---------------------------------------------------------

alter table public.usuarios enable row level security;

create policy usuarios_select on public.usuarios
  for select using (id = auth.uid() or public.mi_rol() in ('almacen', 'admin'));

create policy usuarios_update on public.usuarios
  for update using (public.mi_rol() = 'admin');

create policy usuarios_delete on public.usuarios
  for delete using (public.mi_rol() = 'admin');

-- ---------------------------------------------------------
-- RLS: prendas
-- ---------------------------------------------------------

alter table public.prendas enable row level security;

create policy prendas_select on public.prendas
  for select using (
    estado in ('disponible', 'reservada')
    or donante_id = auth.uid()
    or public.mi_rol() in ('almacen', 'admin')
  );

create policy prendas_insert on public.prendas
  for insert with check (
    donante_id = auth.uid()
    and (estado = 'pendiente' or public.mi_rol() = 'admin')
  );

create policy prendas_update on public.prendas
  for update using (public.mi_rol() in ('almacen', 'admin'));

create policy prendas_delete on public.prendas
  for delete using (public.mi_rol() = 'admin');

-- ---------------------------------------------------------
-- RLS: reservas (sin insert/update/delete directo: todo por RPC)
-- ---------------------------------------------------------

alter table public.reservas enable row level security;

create policy reservas_select on public.reservas
  for select using (usuario_id = auth.uid() or public.mi_rol() in ('almacen', 'admin'));

-- ---------------------------------------------------------
-- RPC: mutaciones que tocan prendas + reservas de forma atómica.
-- ---------------------------------------------------------

create function public.reservar_prenda(p_prenda_id uuid, p_fecha_entrega date)
returns public.reservas
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva public.reservas;
begin
  update public.prendas set estado = 'reservada'
  where id = p_prenda_id and estado = 'disponible';

  if not found then
    raise exception 'La prenda ya no está disponible.';
  end if;

  insert into public.reservas (usuario_id, prenda_id, fecha_entrega)
  values (auth.uid(), p_prenda_id, p_fecha_entrega)
  returning * into nueva;

  return nueva;
end;
$$;

create function public.cancelar_reserva(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservas;
  p public.prendas;
begin
  select * into r from public.reservas where id = p_reserva_id;
  if not found then
    raise exception 'La reserva no existe.';
  end if;

  if r.usuario_id <> auth.uid() and public.mi_rol() not in ('almacen', 'admin') then
    raise exception 'No autorizado para cancelar esta reserva.';
  end if;

  select * into p from public.prendas where id = r.prenda_id;
  if p.estado = 'entregado' then
    raise exception 'Esta prenda ya fue entregada; no se puede cancelar.';
  end if;

  update public.prendas set estado = 'disponible' where id = r.prenda_id;
  delete from public.reservas where id = p_reserva_id;
end;
$$;

create function public.marcar_entregado(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservas;
begin
  if public.mi_rol() not in ('almacen', 'admin') then
    raise exception 'No autorizado.';
  end if;

  select * into r from public.reservas where id = p_reserva_id;
  if not found then
    raise exception 'La reserva no existe.';
  end if;

  update public.prendas set estado = 'entregado' where id = r.prenda_id;
end;
$$;

-- ---------------------------------------------------------
-- Storage: bucket de fotos de prendas.
-- ---------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('prendas', 'prendas', true)
on conflict (id) do nothing;

create policy prendas_storage_select on storage.objects
  for select using (bucket_id = 'prendas');

create policy prendas_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'prendas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy prendas_storage_delete on storage.objects
  for delete using (
    bucket_id = 'prendas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.mi_rol() = 'admin')
  );
