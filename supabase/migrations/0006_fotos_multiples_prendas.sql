-- Guarda la galeria de cada prenda y conserva imagen_url para compatibilidad.
alter table public.prendas
  add column imagen_urls text[] not null default '{}'::text[];

update public.prendas
set imagen_urls = array[imagen_url]
where imagen_url is not null;

alter table public.prendas
  add constraint prendas_imagen_urls_limite
  check (cardinality(imagen_urls) <= 5);
