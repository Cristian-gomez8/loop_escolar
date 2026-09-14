-- =========================================================
-- seed_admin.sql — Crea la primera cuenta admin lista para usar,
-- sin depender de registrarte primero como "usuario" y luego
-- prometerte a ti mismo a mano.
--
-- Edita el correo, la clave y el nombre de abajo ANTES de
-- ejecutarlo, y córrelo una sola vez en el SQL Editor del
-- dashboard de Supabase (después de `supabase db push`).
--
-- Alternativa: si prefieres no correr esto, puedes crear el
-- usuario a mano desde Authentication → Users → Add user en el
-- dashboard, y luego ejecutar solo el UPDATE final de este
-- archivo (ajustando el correo) para promoverlo a admin.
-- =========================================================

do $$
declare
  v_email  text := 'admin@colegio.edu';
  v_pass   text := 'admin123';
  v_nombre text := 'Administrador';
  v_id     uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, crypt(v_pass, gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', v_nombre),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- El trigger on_auth_user_created ya insertó la fila en
  -- public.usuarios con rol='usuario'; se promueve a admin aquí.
  update public.usuarios set rol = 'admin' where id = v_id;
end $$;
