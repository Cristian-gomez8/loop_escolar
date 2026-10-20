alter table public.reservas
  alter column fecha_entrega drop not null,
  add column hora_entrega time;

update public.reservas
set fecha_entrega = null
where hora_entrega is null;

alter table public.reservas
  add constraint reservas_cita_completa_check
  check (
    (fecha_entrega is null and hora_entrega is null)
    or (fecha_entrega is not null and hora_entrega is not null)
  );

create or replace function public.asignar_fecha_reserva(
  p_reserva_id uuid,
  p_fecha_entrega date,
  p_hora_entrega time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_aprobado() or coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Solo un administrador aprobado puede asignar la cita.';
  end if;

  if p_fecha_entrega is null or p_hora_entrega is null then
    raise exception 'Debes indicar la fecha y la hora de entrega.';
  end if;

  if (p_fecha_entrega + p_hora_entrega) <= (now() at time zone 'America/Bogota') then
    raise exception 'La fecha y hora de entrega deben ser futuras.';
  end if;

  update public.reservas
  set fecha_entrega = p_fecha_entrega,
      hora_entrega = p_hora_entrega
  where id = p_reserva_id
    and exists (
      select 1
      from public.prendas
      where prendas.id = reservas.prenda_id
        and prendas.estado <> 'entregado'
    );

  if not found then
    raise exception 'No existe una reserva activa para asignar o actualizar.';
  end if;
end;
$$;

grant execute on function public.asignar_fecha_reserva(uuid, date, time) to authenticated;
