-- =========================================================
-- 0002_grants.sql — Otorga a "authenticated" los permisos base de
-- tabla/función que PostgREST necesita antes de siquiera evaluar
-- las políticas RLS. Sin este GRANT, cualquier consulta a
-- usuarios/prendas/reservas devuelve 403 Forbidden de una vez,
-- sin importar qué digan las policies de 0001_init.sql.
-- Aplicar con: supabase db push
-- =========================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on public.usuarios, public.prendas, public.reservas
  to authenticated;

grant execute on function public.mi_rol() to authenticated;
grant execute on function public.reservar_prenda(uuid, date) to authenticated;
grant execute on function public.cancelar_reserva(uuid) to authenticated;
grant execute on function public.marcar_entregado(uuid) to authenticated;
