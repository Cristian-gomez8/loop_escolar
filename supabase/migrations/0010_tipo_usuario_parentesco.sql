-- Guarda si la cuenta pertenece a un estudiante o a un padre de familia.
alter table public.usuarios
  add column tipo_usuario text not null default 'estudiante',
  add column nombre_estudiante text,
  add constraint usuarios_tipo_usuario_check
    check (tipo_usuario in ('estudiante', 'padre_familia')),
  add constraint usuarios_nombre_estudiante_check
    check (
      (tipo_usuario = 'estudiante' and nombre_estudiante is null)
      or (
        tipo_usuario = 'padre_familia'
        and nombre_estudiante is not null
        and btrim(nombre_estudiante) <> ''
        and char_length(nombre_estudiante) <= 150
      )
    );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tipo text;
  estudiante text;
begin
  tipo := coalesce(new.raw_user_meta_data ->> 'tipo_usuario', 'estudiante');
  estudiante := nullif(btrim(new.raw_user_meta_data ->> 'nombre_estudiante'), '');

  if tipo not in ('estudiante', 'padre_familia') then
    raise exception 'El tipo de usuario no es valido.';
  end if;
  if tipo = 'padre_familia' and (estudiante is null or char_length(estudiante) > 150) then
    raise exception 'Debes indicar el nombre del estudiante a cargo.';
  end if;

  insert into public.usuarios (id, nombre, email, rol, estado_aprobacion, tipo_usuario, nombre_estudiante)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    new.email,
    'usuario',
    'pendiente',
    tipo,
    case when tipo = 'padre_familia' then estudiante else null end
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
  rol text,
  tipo_usuario text,
  nombre_estudiante text,
  estado_aprobacion text,
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
    coalesce(u.rol, 'usuario') as rol,
    coalesce(u.tipo_usuario, 'estudiante') as tipo_usuario,
    u.nombre_estudiante,
    coalesce(u.estado_aprobacion, 'pendiente') as estado_aprobacion,
    coalesce(u.creado_en, au.created_at) as creado_en
  from auth.users au
  left join public.usuarios u on u.id = au.id
  where public.mi_rol() = 'admin'
  order by coalesce(u.estado_aprobacion, 'pendiente') = 'pendiente' desc,
    coalesce(u.creado_en, au.created_at) desc;
$$;

grant execute on function public.listar_usuarios_admin() to authenticated;