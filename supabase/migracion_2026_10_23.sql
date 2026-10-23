-- =====================================================================
-- Tiempos DAC — cambios del 23-oct-2026 (cartera actual, Flujo Rápido, capacidad instalada)
-- Pegar completo en: Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- (schema.sql ya incluye estos cambios para una instalación nueva)
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
