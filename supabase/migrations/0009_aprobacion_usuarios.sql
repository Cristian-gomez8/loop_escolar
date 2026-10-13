-- Las cuentas existentes siguen aprobadas; las cuentas nuevas esperan revision.
alter table public.usuarios
	add column estado_aprobacion text not null default 'aprobado',
	add constraint usuarios_estado_aprobacion_check
		check (estado_aprobacion in ('pendiente', 'aprobado', 'rechazado'));

create or replace function public.mi_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
	select rol
	from public.usuarios
	where id = auth.uid()
		and estado_aprobacion = 'aprobado';
$$;

create or replace function public.usuario_aprobado()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
	select exists (
		select 1
		from public.usuarios
		where id = auth.uid()
			and estado_aprobacion = 'aprobado'
	);
$$;

grant execute on function public.mi_rol() to anon, authenticated;
grant execute on function public.usuario_aprobado() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.usuarios (id, nombre, email, rol, estado_aprobacion)
	values (
		new.id,
		coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
		new.email,
		'usuario',
		'pendiente'
	);
	return new;
end;
$$;

create or replace function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if old.rol = 'admin' and old.estado_aprobacion = 'aprobado' then
		if tg_op = 'DELETE' then
			if (select count(*) from public.usuarios where rol = 'admin' and estado_aprobacion = 'aprobado') <= 1 then
				raise exception 'No se puede eliminar ni quitar el rol al ultimo administrador.';
			end if;
		elsif new.rol <> 'admin' or new.estado_aprobacion <> 'aprobado' then
			if (select count(*) from public.usuarios where rol = 'admin' and estado_aprobacion = 'aprobado') <= 1 then
				raise exception 'No se puede eliminar ni quitar el rol al ultimo administrador.';
			end if;
		end if;
	end if;

	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

drop policy if exists prendas_select on public.prendas;
create policy prendas_select on public.prendas
	for select using (
		public.usuario_aprobado()
		and (
			estado in ('disponible', 'reservada')
			or donante_id = auth.uid()
			or public.mi_rol() in ('almacen', 'admin')
		)
	);

drop policy if exists prendas_insert on public.prendas;
create policy prendas_insert on public.prendas
	for insert with check (
		public.usuario_aprobado()
		and donante_id = auth.uid()
		and (estado = 'pendiente' or public.mi_rol() = 'admin')
	);

drop policy if exists prendas_update on public.prendas;
create policy prendas_update on public.prendas
	for update using (public.usuario_aprobado() and public.mi_rol() in ('almacen', 'admin'));

drop policy if exists prendas_delete on public.prendas;
create policy prendas_delete on public.prendas
	for delete using (public.usuario_aprobado() and public.mi_rol() = 'admin');

drop policy if exists reservas_select on public.reservas;
create policy reservas_select on public.reservas
	for select using (
		public.usuario_aprobado()
		and (usuario_id = auth.uid() or public.mi_rol() in ('almacen', 'admin'))
	);

drop policy if exists prendas_storage_insert on storage.objects;
create policy prendas_storage_insert on storage.objects
	for insert with check (
		bucket_id = 'prendas'
		and public.usuario_aprobado()
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists prendas_storage_delete on storage.objects;
create policy prendas_storage_delete on storage.objects
	for delete using (
		bucket_id = 'prendas'
		and public.usuario_aprobado()
		and ((storage.foldername(name))[1] = auth.uid()::text or public.mi_rol() = 'admin')
	);

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
	if not public.usuario_aprobado() then
		raise exception 'Tu cuenta esta pendiente de aprobacion.';
	end if;

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
		raise exception 'La prenda ya no esta disponible.';
	end if;

	insert into public.reservas (usuario_id, prenda_id, fecha_entrega)
	values (auth.uid(), p_prenda_id, p_fecha_entrega)
	returning * into nueva;

	return nueva;
end;
$$;

create or replace function public.cancelar_reserva(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	r public.reservas;
	p public.prendas;
begin
	if not public.usuario_aprobado() then
		raise exception 'Tu cuenta esta pendiente de aprobacion.';
	end if;

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

create or replace function public.marcar_entregado(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	r public.reservas;
begin
	if not public.usuario_aprobado() or coalesce(public.mi_rol(), '') not in ('almacen', 'admin') then
		raise exception 'No autorizado.';
	end if;

	select * into r from public.reservas where id = p_reserva_id;
	if not found then
		raise exception 'La reserva no existe.';
	end if;

	update public.prendas set estado = 'entregado' where id = r.prenda_id;
end;
$$;

create or replace function public.eliminar_usuario(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	rol_solicitante text;
	rol_objetivo text;
	estado_objetivo text;
begin
	select rol into rol_solicitante
	from public.usuarios
	where id = auth.uid() and estado_aprobacion = 'aprobado';

	if rol_solicitante is distinct from 'admin' then
		raise exception 'Solo un administrador aprobado puede eliminar usuarios.';
	end if;

	if p_usuario_id = auth.uid() then
		raise exception 'No puedes eliminar tu propia cuenta.';
	end if;

	select rol, estado_aprobacion into rol_objetivo, estado_objetivo
	from public.usuarios
	where id = p_usuario_id;

	if rol_objetivo is null then
		raise exception 'El usuario no existe.';
	end if;

	if rol_objetivo = 'admin'
		 and estado_objetivo = 'aprobado'
		 and (select count(*) from public.usuarios where rol = 'admin' and estado_aprobacion = 'aprobado') <= 1 then
		raise exception 'No se puede eliminar al ultimo administrador.';
	end if;

	delete from auth.users where id = p_usuario_id;

	if not found then
		raise exception 'La cuenta de autenticacion no existe.';
	end if;
end;
$$;

drop function if exists public.listar_usuarios_admin();
create function public.listar_usuarios_admin()
returns table (
	id uuid,
	nombre text,
	email text,
	rol text,
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
		coalesce(u.estado_aprobacion, 'pendiente') as estado_aprobacion,
		coalesce(u.creado_en, au.created_at) as creado_en
	from auth.users au
	left join public.usuarios u on u.id = au.id
	where public.mi_rol() = 'admin'
	order by coalesce(u.estado_aprobacion, 'pendiente') = 'pendiente' desc,
		coalesce(u.creado_en, au.created_at) desc;
$$;

grant execute on function public.listar_usuarios_admin() to authenticated;

create or replace function public.resolver_solicitud_usuario(p_usuario_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if public.mi_rol() is distinct from 'admin' then
		raise exception 'Solo un administrador aprobado puede resolver solicitudes.';
	end if;
	if p_estado is null or p_estado not in ('aprobado', 'rechazado') then
		raise exception 'El estado solicitado no es valido.';
	end if;

	update public.usuarios
	set estado_aprobacion = p_estado
	where id = p_usuario_id and estado_aprobacion = 'pendiente';

	if found then
		return;
	end if;

	insert into public.usuarios (id, nombre, email, rol, estado_aprobacion)
	select
		au.id,
		coalesce(au.raw_user_meta_data ->> 'nombre', au.email),
		au.email,
		'usuario',
		p_estado
	from auth.users au
	where au.id = p_usuario_id
		and not exists (select 1 from public.usuarios u where u.id = au.id);

	if not found then
		raise exception 'La solicitud ya fue resuelta o la cuenta no existe.';
	end if;
end;
$$;

grant execute on function public.resolver_solicitud_usuario(uuid, text) to authenticated;
