-- =====================================================================
-- Tiempos DAC — usuarios con el nombre completo (23-oct-2026)
-- Karen, Katherine e Hilcia ingresan escribiendo su nombre completo. La contraseña no cambia.
-- Pegar completo en: Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.
-- =====================================================================
do $$
declare
  c record;
  uid uuid;
begin
  for c in select * from (values
      ('karen.arana', 'karen.maritza.arana.melendez', 'Karen Maritza Arana Melendez'),
      ('katherine.guiselle', 'katherine.gissell.mora.garcia', 'Katherine Gissell Mora Garcia'),
      ('hilcia.paola', 'hilcia.paola.morales.mendez', 'Hilcia Paola Morales Mendez')
    ) as t(viejo, nuevo, nombre)
  loop
    select id into uid from public.dac_perfiles where usuario in (c.viejo, c.nuevo);
    if uid is null then
      raise notice 'No existe el usuario %', c.viejo;
      continue;
    end if;
    update public.dac_perfiles set usuario = c.nuevo, nombre = c.nombre where id = uid;
    update auth.users set email = c.nuevo || '@tiemposdac.local', updated_at = now(),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nombre', c.nombre)
    where id = uid;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', c.nuevo || '@tiemposdac.local'), updated_at = now()
    where user_id = uid and provider = 'email';
  end loop;
end $$;

select usuario, nombre, rol from public.dac_perfiles where rol in ('jefe', 'gerente') order by nombre;
