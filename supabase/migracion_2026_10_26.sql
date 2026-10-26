-- =====================================================================
-- Tiempos DAC — tiempos y productividad en el mes de la última resolución (26-oct-2026)
-- Sin corte de mes: cada solicitud se cuenta completa en el mes de su última decisión; sin decisión, en el último
-- mes en que tuvo un estado del DAC. Los ingresos siguen por la fecha de ingreso al DAC.
-- Pegar completo en: Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- =====================================================================
alter table public.dac_solicitudes add column if not exists fecha_cuenta timestamp;
create index if not exists ix_dac_sol_fecha_cuenta on public.dac_solicitudes (fecha_cuenta);

create or replace function public.dac_cargar(p_solicitudes jsonb, p_tramos jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(public.dac_rol(), '') not in ('sistema','admin') and not public.dac_es_sql() then
    raise exception 'Solo el proceso de actualización puede cargar datos';
  end if;
  insert into public.dac_solicitudes (solicitud, periodo, creada, ingreso_dac, tipo_credito, producto, reestructura,
    monto_colocado, monto_aprobado, estado_actual, promotor, sucursal, decision, fecha_decision, segundos_total,
    fecha_cuenta, ultimo_estado, ultimo_cambio, ultimo_usuario, ciclo)
    select solicitud, periodo, creada, ingreso_dac, tipo_credito, producto, reestructura,
      monto_colocado, monto_aprobado, estado_actual, promotor, sucursal, decision, fecha_decision, segundos_total,
      fecha_cuenta, ultimo_estado, ultimo_cambio, ultimo_usuario, ciclo
    from jsonb_populate_recordset(null::public.dac_solicitudes, p_solicitudes)
  on conflict (solicitud) do update set
    periodo = excluded.periodo, creada = excluded.creada, ingreso_dac = excluded.ingreso_dac,
    tipo_credito = excluded.tipo_credito, producto = excluded.producto, reestructura = excluded.reestructura,
    monto_colocado = excluded.monto_colocado, monto_aprobado = excluded.monto_aprobado,
    estado_actual = excluded.estado_actual, promotor = excluded.promotor,
    sucursal = excluded.sucursal, decision = excluded.decision, fecha_decision = excluded.fecha_decision,
    segundos_total = excluded.segundos_total, fecha_cuenta = excluded.fecha_cuenta, ultimo_estado = excluded.ultimo_estado,
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
