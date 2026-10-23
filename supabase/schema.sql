-- =====================================================================
-- Tiempos DAC — esquema para Supabase
-- Pegar completo en: Supabase > SQL Editor > New query > Run
-- Se puede ejecutar más de una vez sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Usuarios y perfiles ----------
-- Roles: admin (todo), jefe (todo), analista (sus vistas), gerente (solo dashboard), sistema (proceso de carga)
create table if not exists public.dac_perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique,          -- forma normalizada del nombre: "hilcia.paola"
  nombre text not null,                  -- como se muestra: "Hilcia Paola"
  rol text not null check (rol in ('admin','jefe','analista','gerente','sistema')),
  analista text,                         -- nombre del analista tal como aparece en el sistema (rol analista)
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Datos que carga el proceso de actualización ----------
create table if not exists public.dac_solicitudes (
  solicitud bigint primary key,
  periodo text not null,                 -- AAAA-MM del ingreso al DAC (primer POR ASIGNAR A ANALISTA)
  creada timestamp,
  ingreso_dac timestamp not null,
  tipo_credito text,
  producto text not null check (producto in ('PYMES','MOTO','PERS')),
  reestructura boolean not null default false,
  monto_colocado numeric,
  estado_actual text,
  promotor text,
  sucursal text,
  decision text,
  fecha_decision timestamp,
  segundos_total numeric,                -- de la creación a la última decisión del analista o TUD
  actualizado timestamptz not null default now()
);
create index if not exists ix_dac_sol_periodo on public.dac_solicitudes (periodo);

create table if not exists public.dac_tramos (
  solicitud bigint not null references public.dac_solicitudes(solicitud) on delete cascade,
  n int not null,
  tipo text not null check (tipo in ('analisis','reproceso')),
  analista text,
  inicio timestamp not null,
  fin timestamp,
  fin_estado text,
  estados jsonb,                         -- {estado: [segundos reloj, segundos en jornada]}
  cruza_dia boolean not null default false,
  primary key (solicitud, n)
);
create index if not exists ix_dac_tramos_analista on public.dac_tramos (analista);

-- ---------- Lo que se registra en la app ----------
create table if not exists public.dac_analistas (
  nombre text primary key,               -- tal como aparece en el histórico (USUARIO MODIFICA)
  producto text not null check (producto in ('PYMES','MOTO','PERS')),
  activo boolean not null default true,
  desde date,
  hasta date
);

-- Días que no son hábiles a nivel general (feriados). valor = fracción hábil que queda ese día (0 o 0.5)
create table if not exists public.dac_feriados (
  fecha date primary key,
  valor numeric not null default 0 check (valor >= 0 and valor <= 1),
  descripcion text not null
);

-- Horario hábil especial de una fecha (p. ej. el DAC cierra a las 8:00 pm). Reemplaza el horario normal ese día.
create table if not exists public.dac_horarios (
  fecha date primary key,
  inicio time not null,
  fin time not null,
  descripcion text,
  check (fin > inicio)
);

-- Vacaciones / permisos de un analista. dias = días hábiles que no estuvo (se calcula en la app y se puede ajustar)
create table if not exists public.dac_ausencias (
  id bigint generated always as identity primary key,
  analista text not null,
  desde date not null,
  hasta date not null,
  tipo text not null default 'Vacaciones',
  medio_dia boolean not null default false,
  nota text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (hasta >= desde)
);

-- Eventos especiales: días que para ciertos analistas SÍ son hábiles (o cuentan más) aunque a nivel general no
create table if not exists public.dac_eventos (
  id bigint generated always as identity primary key,
  nombre text not null,
  fecha date not null,
  valor numeric not null default 1 check (valor > 0 and valor <= 1),
  analistas text[] not null,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.dac_config (
  clave text primary key,
  valor jsonb not null
);

create table if not exists public.dac_actualizaciones (
  id bigint generated always as identity primary key,
  solicitado_por uuid default auth.uid(),
  solicitado_nombre text,
  solicitado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','ok','error')),
  iniciado_en timestamptz,
  terminado_en timestamptz,
  mensaje text
);

-- ---------- Funciones de apoyo ----------
create or replace function public.dac_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.dac_perfiles where id = auth.uid() and activo
$$;
create or replace function public.dac_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.dac_rol() in ('admin','jefe'), false)
$$;
create or replace function public.dac_es_sql() returns boolean
language sql stable as $$ select session_user <> 'authenticator' $$;

-- ---------- Seguridad por fila ----------
alter table public.dac_perfiles enable row level security;
alter table public.dac_solicitudes enable row level security;
alter table public.dac_tramos enable row level security;
alter table public.dac_analistas enable row level security;
alter table public.dac_feriados enable row level security;
alter table public.dac_horarios enable row level security;
alter table public.dac_ausencias enable row level security;
alter table public.dac_eventos enable row level security;
alter table public.dac_config enable row level security;
alter table public.dac_actualizaciones enable row level security;

drop policy if exists perfiles_leer on public.dac_perfiles;
create policy perfiles_leer on public.dac_perfiles for select to authenticated
  using (id = auth.uid() or public.dac_es_admin());

do $$
declare t text;
begin
  foreach t in array array['dac_solicitudes','dac_tramos','dac_analistas','dac_feriados','dac_horarios','dac_ausencias','dac_eventos','dac_config','dac_actualizaciones'] loop
    execute format('drop policy if exists leer on public.%I', t);
    execute format('create policy leer on public.%I for select to authenticated using (public.dac_rol() is not null)', t);
  end loop;
  foreach t in array array['dac_analistas','dac_feriados','dac_horarios','dac_ausencias','dac_eventos','dac_config'] loop
    execute format('drop policy if exists escribir on public.%I', t);
    execute format('create policy escribir on public.%I for all to authenticated using (public.dac_es_admin()) with check (public.dac_es_admin())', t);
  end loop;
end $$;

-- Cualquier usuario puede pedir una actualización (botón del dashboard); solo el proceso la atiende
drop policy if exists pedir on public.dac_actualizaciones;
create policy pedir on public.dac_actualizaciones for insert to authenticated
  with check (public.dac_rol() is not null and estado = 'pendiente');
drop policy if exists atender on public.dac_actualizaciones;
create policy atender on public.dac_actualizaciones for update to authenticated
  using (public.dac_rol() in ('sistema','admin')) with check (true);

-- ---------- Carga de datos: dac_cargar y dac_cargar_extra están al final (cambios del 23-oct) ----------

-- ---------- Usuarios (sin correo real) ----------
-- "Hilcia Paola" ingresa escribiendo su nombre; internamente es hilcia.paola@tiemposdac.local
create or replace function public.dac_crear_usuario(p_usuario text, p_nombre text, p_rol text, p_password text, p_analista text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; correo text := lower(trim(p_usuario)) || '@tiemposdac.local';
begin
  if not (public.dac_es_admin() or public.dac_es_sql()) then raise exception 'Solo administración puede crear usuarios'; end if;
  if trim(p_usuario) !~ '^[a-z0-9._-]+$' then raise exception 'Usuario inválido'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  if p_rol not in ('admin','jefe','analista','gerente','sistema') then raise exception 'Rol inválido'; end if;
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

create or replace function public.dac_restablecer_clave(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.dac_es_admin() then raise exception 'Solo administración puede restablecer contraseñas'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_id and id in (select id from public.dac_perfiles where rol <> 'sistema');
end $$;

create or replace function public.dac_editar_usuario(p_id uuid, p_rol text, p_analista text, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.dac_es_admin() then raise exception 'Solo administración puede editar usuarios'; end if;
  if p_rol not in ('admin','jefe','analista','gerente') then raise exception 'Rol inválido'; end if;
  update public.dac_perfiles set rol = p_rol, analista = nullif(upper(trim(p_analista)), ''), activo = p_activo
  where id = p_id and rol <> 'sistema';
end $$;

-- ---------- Valores iniciales de configuración ----------
insert into public.dac_config (clave, valor) values
  ('jornada', '{"lv": ["08:00", "18:00"], "sab": ["08:00", "14:00"]}'),
  ('modo_hoy', '"proporcional"'),
  ('modo_tiempo', '"jornada"'),
  -- Como el Excel: no cuentan para el analista los estados en que la solicitud espera a otra área
  ('estados_excluidos', '["PENDIENTES","VERIFICADOR MOTORIZADO","REVISION APROBADOR","COMITE CREDITO","DEVUELTO GERENCIA","RESOLUCION APROBADA","RECHAZADO RESOLUCION","RECHAZADO POR RECEPCION","RECHAZADO POR MOTOR","ENVIADO","POR ASIGNAR A ANALISTA"]'),
  ('meta_minutos', '30'),
  ('cada_minutos', '60')
on conflict (clave) do nothing;

-- =====================================================================
-- Cambios del 23-oct-2026 (también en migracion_2026_10_23.sql)
-- =====================================================================

-- Estado en que está hoy cada solicitud (cartera actual) y monto aprobado
alter table public.dac_solicitudes add column if not exists monto_aprobado numeric;
alter table public.dac_solicitudes add column if not exists ultimo_estado text;
alter table public.dac_solicitudes add column if not exists ultimo_cambio timestamp;
alter table public.dac_solicitudes add column if not exists ultimo_usuario text;

-- Flujo Rápido (motor de decisiones): resolución del motor y siguió sin pasar por un analista
create table if not exists public.dac_flujo_rapido (
  solicitud bigint primary key,
  periodo text not null,                 -- AAAA-MM de creación
  creada timestamp,
  resolucion text,                       -- APROBADO POR MOTOR / RECHAZADO POR MOTOR
  fecha_resolucion timestamp,
  tipo_credito text,
  producto text not null,
  monto_aprobado numeric,
  estado_actual text,
  ultimo_estado text
);
create index if not exists ix_dac_flujo_periodo on public.dac_flujo_rapido (periodo);

-- Todos los créditos que ingresaron en el mes (bitácora), agrupados. Se conserva cada mes al cerrar.
create table if not exists public.dac_bitacora_resumen (
  periodo text not null,                 -- AAAA-MM de creación
  producto text not null,
  estado text not null,                  -- estado actual en la bitácora
  camino text not null check (camino in ('dac','rapido','otro')),
  n int not null,
  monto_aprobado numeric not null default 0,
  primary key (periodo, producto, estado, camino)
);

alter table public.dac_flujo_rapido enable row level security;
alter table public.dac_bitacora_resumen enable row level security;
drop policy if exists leer on public.dac_flujo_rapido;
create policy leer on public.dac_flujo_rapido for select to authenticated using (public.dac_rol() is not null);
drop policy if exists leer on public.dac_bitacora_resumen;
create policy leer on public.dac_bitacora_resumen for select to authenticated using (public.dac_rol() is not null);

create or replace function public.dac_cargar(p_solicitudes jsonb, p_tramos jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(public.dac_rol(), '') not in ('sistema','admin') and not public.dac_es_sql() then
    raise exception 'Solo el proceso de actualización puede cargar datos';
  end if;
  insert into public.dac_solicitudes (solicitud, periodo, creada, ingreso_dac, tipo_credito, producto, reestructura,
    monto_colocado, monto_aprobado, estado_actual, promotor, sucursal, decision, fecha_decision, segundos_total,
    ultimo_estado, ultimo_cambio, ultimo_usuario)
    select solicitud, periodo, creada, ingreso_dac, tipo_credito, producto, reestructura,
      monto_colocado, monto_aprobado, estado_actual, promotor, sucursal, decision, fecha_decision, segundos_total,
      ultimo_estado, ultimo_cambio, ultimo_usuario
    from jsonb_populate_recordset(null::public.dac_solicitudes, p_solicitudes)
  on conflict (solicitud) do update set
    periodo = excluded.periodo, creada = excluded.creada, ingreso_dac = excluded.ingreso_dac,
    tipo_credito = excluded.tipo_credito, producto = excluded.producto, reestructura = excluded.reestructura,
    monto_colocado = excluded.monto_colocado, monto_aprobado = excluded.monto_aprobado,
    estado_actual = excluded.estado_actual, promotor = excluded.promotor,
    sucursal = excluded.sucursal, decision = excluded.decision, fecha_decision = excluded.fecha_decision,
    segundos_total = excluded.segundos_total, ultimo_estado = excluded.ultimo_estado,
    ultimo_cambio = excluded.ultimo_cambio, ultimo_usuario = excluded.ultimo_usuario, actualizado = now();
  delete from public.dac_tramos where solicitud in
    (select (x->>'solicitud')::bigint from jsonb_array_elements(p_solicitudes) x);
  insert into public.dac_tramos select * from jsonb_populate_recordset(null::public.dac_tramos, p_tramos);
  get diagnostics n = row_count;
  insert into public.dac_config (clave, valor) values ('ultima_actualizacion', to_jsonb(now()))
    on conflict (clave) do update set valor = excluded.valor;
  return n;
end $$;

-- Reemplaza el Flujo Rápido y el resumen de la bitácora solo de los meses que trae la consulta;
-- los meses anteriores (ya cerrados) quedan guardados.
create or replace function public.dac_cargar_extra(p_periodos text[], p_flujo jsonb, p_resumen jsonb)
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
end $$;

-- Metas por producto (minutos) y jefatura del DAC (no es Flujo Rápido si interviene)
insert into public.dac_config (clave, valor) values
  ('metas', '{"PERS": 20, "MOTO": 40, "PYMES": 50}'),
  ('jefatura', '["HILCIA PAOLA MORALES MENDEZ", "KATHERINE GISSELL MORA GARCIA"]')
on conflict (clave) do nothing;

-- =====================================================================
-- Cambios del 23-oct-2026, segunda parte (también en migracion_2026_10_23b.sql)
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
