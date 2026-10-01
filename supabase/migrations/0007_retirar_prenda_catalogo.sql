-- Permite retirar prendas del catalogo sin borrar su historial ni sus fotos.
alter table public.prendas
  drop constraint if exists prendas_estado_check;

alter table public.prendas
  add constraint prendas_estado_check
  check (estado in ('pendiente', 'disponible', 'rechazada', 'reservada', 'entregado', 'retirada'));

create or replace function public.retirar_prenda_catalogo(p_prenda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(), '') not in ('almacen', 'admin') then
    raise exception 'No autorizado para retirar prendas del catalogo.';
  end if;

  update public.prendas
  set estado = 'retirada'
  where id = p_prenda_id and estado = 'disponible';

  if not found then
    raise exception 'La prenda ya no esta disponible en el catalogo.';
  end if;
end;
$$;

grant execute on function public.retirar_prenda_catalogo(uuid) to authenticated;
