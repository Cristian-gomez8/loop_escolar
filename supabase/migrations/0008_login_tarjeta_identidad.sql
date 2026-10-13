-- Permite iniciar sesion con tarjeta de identidad sin exponer el correo
-- asociado al cliente anonimo.
alter table public.usuarios
  add column if not exists tarjeta_identidad text;

alter table public.usuarios
  drop constraint if exists usuarios_tarjeta_identidad_formato,
  add constraint usuarios_tarjeta_identidad_formato
    check (tarjeta_identidad is null or tarjeta_identidad ~ '^[0-9]{1,20}$');

create unique index if not exists usuarios_tarjeta_identidad_unique
  on public.usuarios (tarjeta_identidad)
  where tarjeta_identidad is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, email, rol, tarjeta_identidad)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    new.email,
    'usuario',
    new.raw_user_meta_data ->> 'tarjeta_identidad'
  );
  return new;
end;
$$;

drop function if exists public.listar_usuarios_admin();

create function public.listar_usuarios_admin()
returns table (
  id uuid,
  nombre text,
  email text,
  tarjeta_identidad text,
  rol text,
  creado_en timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    au.id,
    coalesce(u.nombre, au.raw_user_meta_data ->> 'nombre', au.email) as nombre,
    coalesce(u.email, au.email) as email,
    u.tarjeta_identidad,
    coalesce(u.rol, 'usuario') as rol,
    coalesce(u.creado_en, au.created_at) as creado_en
  from auth.users au
  left join public.usuarios u on u.id = au.id
  where exists (
    select 1
    from public.usuarios solicitante
    where solicitante.id = auth.uid()
      and solicitante.rol = 'admin'
  )
  order by coalesce(u.creado_en, au.created_at) desc;
$$;

grant execute on function public.listar_usuarios_admin() to authenticated;