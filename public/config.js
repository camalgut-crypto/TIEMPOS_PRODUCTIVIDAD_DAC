// Conexión a Supabase. La clave "anon/publishable" es pública por diseño:
// la seguridad la dan las políticas RLS definidas en supabase/schema.sql.
// Mientras falte la URL o la clave la app funciona en modo de vista previa local (public/local/datos.json).
window.DAC_CONFIG = {
  SUPABASE_URL: 'https://lzgteejsjxrbadsqlpnd.supabase.co',
  SUPABASE_ANON_KEY: '',
};
