-- =========================================================
-- 0004_listar_usuarios_admin.sql — Lista las cuentas reales de
-- Authentication junto con su perfil público para el panel admin.
-- Aplicar con: supabase db push
-- =========================================================

create or replace function public.listar_usuarios_admin()
returns table (
  id uuid,
  nombre text,
  email text,
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
