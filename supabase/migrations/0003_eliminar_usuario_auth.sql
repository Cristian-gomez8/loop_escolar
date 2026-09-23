-- =========================================================
-- 0003_eliminar_usuario_auth.sql — Elimina la cuenta completa,
-- incluyendo auth.users y su perfil public.usuarios.
-- Aplicar con: supabase db push
-- =========================================================

create or replace function public.eliminar_usuario(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rol_solicitante text;
  rol_objetivo text;
begin
  select rol into rol_solicitante
  from public.usuarios
  where id = auth.uid();

  if rol_solicitante <> 'admin' then
    raise exception 'Solo un administrador puede eliminar usuarios.';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta.';
  end if;

  select rol into rol_objetivo
  from public.usuarios
  where id = p_usuario_id;

  if rol_objetivo is null then
    raise exception 'El usuario no existe.';
  end if;

  if rol_objetivo = 'admin'
     and (select count(*) from public.usuarios where rol = 'admin') <= 1 then
    raise exception 'No se puede eliminar al ultimo administrador.';
  end if;

  delete from auth.users where id = p_usuario_id;

  if not found then
    raise exception 'La cuenta de autenticacion no existe.';
  end if;
end;
$$;

grant execute on function public.eliminar_usuario(uuid) to authenticated;
