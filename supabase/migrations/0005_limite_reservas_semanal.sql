-- =========================================================
-- 0005_limite_reservas_semanal.sql — Limita a cinco reservas por
-- usuario durante cada semana calendario.
-- =========================================================

create index if not exists reservas_usuario_creada_idx
  on public.reservas (usuario_id, creada);

create or replace function public.reservar_prenda(p_prenda_id uuid, p_fecha_entrega date)
returns public.reservas
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva public.reservas;
  reservas_esta_semana integer;
begin
  -- Serializa las reservas del mismo usuario para que el conteo sea fiable
  -- aunque haya solicitudes simultaneas desde varias pestañas.
  perform 1 from public.usuarios where id = auth.uid() for update;

  select count(*) into reservas_esta_semana
  from public.reservas
  where usuario_id = auth.uid()
    and creada >= date_trunc('week', now());

  if reservas_esta_semana >= 5 then
    raise exception 'Solo puedes reservar hasta 5 prendas por semana.';
  end if;

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