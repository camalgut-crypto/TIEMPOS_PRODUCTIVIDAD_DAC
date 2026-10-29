-- =====================================================================
-- Tiempos DAC — nuevas metas de tiempo por producto (29-oct-2026)
-- MOTO 30 min y PYMES 40 min (antes 40 y 50); PERS sigue en 20 min.
-- Pegar completo en: Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- =====================================================================
insert into public.dac_config (clave, valor) values ('metas', '{"PERS": 20, "MOTO": 30, "PYMES": 40}')
on conflict (clave) do update set valor = public.dac_config.valor || '{"MOTO": 30, "PYMES": 40}'::jsonb;
