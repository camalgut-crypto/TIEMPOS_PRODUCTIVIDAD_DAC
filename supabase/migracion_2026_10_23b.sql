-- =====================================================================
-- Tiempos DAC — cambios del 23-oct-2026 (segunda parte)
-- Perfil "Analista con reprocesamiento", tiempos del motor y ciclo de la solicitud por departamento (gerente).
-- Pegar completo en: Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- =====================================================================

-- Nuevo rol: analista con reprocesamiento (ve también Preaprobado condicionado)
alter table public.dac_perfiles drop constraint if exists dac_perfiles_rol_check;
alter table public.dac_perfiles add constraint dac_perfiles_rol_check
  check (rol in ('admin','jefe','analista','reproceso','gerente','sistema'));

create or replace function public.dac_crear_usuario(p_usuario text, p_nombre text, p_rol text, p_password text, p_analista text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; correo text := lower(trim(p_usuario)) || '@tiemposdac.local';
begin
  if not (public.dac_es_admin() or public.dac_es_sql()) then raise exception 'Solo administración puede crear usuarios'; end if;
  if trim(p_usuario) !~ '^[a-z0-9._-]+$' then raise exception 'Usuario inválido'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  if p_rol not in ('admin','jefe','analista','reproceso','gerente','sistema') then raise exception 'Rol inválido'; end if;
  if p_rol = 'sistema' and not public.dac_es_sql() then raise exception 'El usuario de sistema solo se crea desde el SQL Editor'; end if;
  select id into uid from public.dac_perfiles where usuario = lower(trim(p_usuario));
  if uid is not null then
    if public.dac_es_sql() then return uid; end if;
    raise exception 'Ese usuario ya existe';
  end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', correo,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre), now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', correo, 'email_verified', true), 'email', now(), now(), now());
  insert into public.dac_perfiles (id, usuario, nombre, rol, analista)
  values (uid, lower(trim(p_usuario)), trim(p_nombre), p_rol, nullif(upper(trim(p_analista)), ''));
  return uid;
end $$;

create or replace function public.dac_editar_usuario(p_id uuid, p_rol text, p_analista text, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.dac_es_admin() then raise exception 'Solo administración puede editar usuarios'; end if;
  if p_rol not in ('admin','jefe','analista','reproceso','gerente') then raise exception 'Rol inválido'; end if;
  update public.dac_perfiles set rol = p_rol, analista = nullif(upper(trim(p_analista)), ''), activo = p_activo
  where id = p_id and rol <> 'sistema';
end $$;

-- Ciclo de la solicitud (creación → fin) por estado y departamento, y tiempo del motor en el Flujo Rápido
alter table public.dac_solicitudes add column if not exists ciclo jsonb;
alter table public.dac_flujo_rapido add column if not exists seg_motor numeric;
alter table public.dac_flujo_rapido add column if not exists ciclo jsonb;

-- Tiempo del motor (ENVIADO → APROBADO / RECHAZADO POR MOTOR), por día; la meta es 1 minuto
create table if not exists public.dac_motor_resumen (
  periodo text not null,                 -- AAAA-MM de creación
  fecha date not null,                   -- día de la resolución
  producto text not null,
  resolucion text not null,
  camino text not null,                  -- dac / rapido / otro
  n int not null,
  seg_total numeric not null,
  seg_max numeric not null,
  b10 int not null, b20 int not null, b30 int not null, b60 int not null, bmas int not null,
  primary key (periodo, fecha, producto, resolucion, camino)
);
create table if not exists public.dac_motor_lentas (
  solicitud bigint primary key,
  periodo text not null,
  creada timestamp,
  fecha_resolucion timestamp,
  producto text,
  resolucion text,
  camino text,
  segundos numeric
);
alter table public.dac_motor_resumen enable row level security;
alter table public.dac_motor_lentas enable row level security;
drop policy if exists leer on public.dac_motor_resumen;
create policy leer on public.dac_motor_resumen for select to authenticated using (public.dac_rol() is not null);
drop policy if exists leer on public.dac_motor_lentas;
create policy leer on public.dac_motor_lentas for select to authenticated using (public.dac_rol() is not null);

create or replace function public.dac_cargar(p_solicitudes jsonb, p_tramos jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(public.dac_rol(), '') not in ('sistema','admin') and not public.dac_es_sql() then
    raise exception 'Solo el proceso de actualización puede cargar datos';
  end if;
  insert into public.dac_solicitudes (solicitud, periodo, creada, ingreso_dac, tipo_credito, producto, reestructura,
    monto_colocado, monto_aprobado, estado_actual, promotor, sucursal, decision, fecha_decision, segundos_total,
    ultimo_estado, ultimo_cambio, ultimo_usuario, ciclo)
    select solicitud, periodo, creada, ingreso_dac, tipo_credito, producto, reestructura,
      monto_colocado, monto_aprobado, estado_actual, promotor, sucursal, decision, fecha_decision, segundos_total,
      ultimo_estado, ultimo_cambio, ultimo_usuario, ciclo
    from jsonb_populate_recordset(null::public.dac_solicitudes, p_solicitudes)
  on conflict (solicitud) do update set
    periodo = excluded.periodo, creada = excluded.creada, ingreso_dac = excluded.ingreso_dac,
    tipo_credito = excluded.tipo_credito, producto = excluded.producto, reestructura = excluded.reestructura,
    monto_colocado = excluded.monto_colocado, monto_aprobado = excluded.monto_aprobado,
    estado_actual = excluded.estado_actual, promotor = excluded.promotor,
    sucursal = excluded.sucursal, decision = excluded.decision, fecha_decision = excluded.fecha_decision,
    segundos_total = excluded.segundos_total, ultimo_estado = excluded.ultimo_estado,
    ultimo_cambio = excluded.ultimo_cambio, ultimo_usuario = excluded.ultimo_usuario, ciclo = excluded.ciclo,
    actualizado = now();
  delete from public.dac_tramos where solicitud in
    (select (x->>'solicitud')::bigint from jsonb_array_elements(p_solicitudes) x);
  insert into public.dac_tramos select * from jsonb_populate_recordset(null::public.dac_tramos, p_tramos);
  get diagnostics n = row_count;
  insert into public.dac_config (clave, valor) values ('ultima_actualizacion', to_jsonb(now()))
    on conflict (clave) do update set valor = excluded.valor;
  return n;
end $$;

-- Reemplaza Flujo Rápido, resumen de la bitácora y tiempos del motor solo de los meses que trae la consulta
drop function if exists public.dac_cargar_extra(text[], jsonb, jsonb);
create or replace function public.dac_cargar_extra(p_periodos text[], p_flujo jsonb, p_resumen jsonb, p_motor jsonb, p_lentas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.dac_rol(), '') not in ('sistema','admin') and not public.dac_es_sql() then
    raise exception 'Solo el proceso de actualización puede cargar datos';
  end if;
  delete from public.dac_flujo_rapido where periodo = any(p_periodos);
  insert into public.dac_flujo_rapido select * from jsonb_populate_recordset(null::public.dac_flujo_rapido, p_flujo)
    on conflict (solicitud) do nothing;
  delete from public.dac_bitacora_resumen where periodo = any(p_periodos);
  insert into public.dac_bitacora_resumen select * from jsonb_populate_recordset(null::public.dac_bitacora_resumen, p_resumen);
  delete from public.dac_motor_resumen where periodo = any(p_periodos);
  insert into public.dac_motor_resumen select * from jsonb_populate_recordset(null::public.dac_motor_resumen, p_motor);
  delete from public.dac_motor_lentas where periodo = any(p_periodos);
  insert into public.dac_motor_lentas select * from jsonb_populate_recordset(null::public.dac_motor_lentas, p_lentas)
    on conflict (solicitud) do nothing;
end $$;

-- El reprocesamiento (preaprobado condicionado) queda a nombre de este analista
insert into public.dac_config (clave, valor) values ('analista_reproceso', '"LILIANA ARGENTINA LOPEZ MENDIETA"')
on conflict (clave) do nothing;
