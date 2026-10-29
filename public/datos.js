// Acceso a datos. En línea usa Supabase; sin configuración (o con ?local) usa public/local/datos.json y guarda
// los registros en este navegador, solo para revisar la app antes de publicarla.
(function () {
  const CFG = window.DAC_CONFIG || {};
  const DOMINIO = '@tiemposdac.local';
  const CLAVE_INICIAL = '12345678';
  const local = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || new URLSearchParams(location.search).has('local');
  const TABLAS = ['dac_analistas', 'dac_feriados', 'dac_horarios', 'dac_ausencias', 'dac_eventos', 'dac_config', 'dac_actualizaciones'];
  const LLAVE = { dac_analistas: 'nombre', dac_feriados: 'fecha', dac_horarios: 'fecha', dac_config: 'clave' };
  // Tablas de la migración del 23-oct: si todavía no existen, la app sigue funcionando sin ellas
  const OPCIONALES = { flujo_rapido: ['dac_flujo_rapido', 'solicitud'], bitacora_resumen: ['dac_bitacora_resumen', 'periodo'],
    motor_resumen: ['dac_motor_resumen', 'fecha'], motor_lentas: ['dac_motor_lentas', 'solicitud'] };

  // ---------- Supabase ----------
  const sb = local ? null : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  // Supabase entrega hasta 1000 filas por llamada: la primera trae el total y el resto se pide en paralelo
  // (el Flujo Rápido trae todas las resoluciones del motor, unas 7 mil por mes)
  async function todo(tabla, orden) {
    const r = await sb.from(tabla).select('*', { count: 'exact' }).order(orden).range(0, 999);
    const out = ok(r), total = r.count ?? out.length;
    const pags = [];
    for (let i = 1000; i < total; i += 1000) pags.push(i);
    for (let k = 0; k < pags.length; k += 8) {
      const lotes = await Promise.all(pags.slice(k, k + 8).map((i) => sb.from(tabla).select('*').order(orden).range(i, i + 999)));
      for (const l of lotes) out.push(...ok(l));
    }
    return out;
  }

  const nube = {
    modo: 'nube',
    async sesion() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      return ok(await sb.from('dac_perfiles').select('*').eq('id', data.session.user.id).maybeSingle());
    },
    async ingresar(usuario, clave) {
      ok(await sb.auth.signInWithPassword({ email: DAC.slug(usuario) + DOMINIO, password: clave }));
      const p = await this.sesion();
      if (!p || !p.activo) { await sb.auth.signOut(); throw new Error('Usuario sin acceso a Tiempos DAC'); }
      return p;
    },
    salir: () => sb.auth.signOut(),
    async cambiarClave(perfil, actual, nueva) {
      ok(await sb.auth.signInWithPassword({ email: perfil.usuario + DOMINIO, password: actual }));
      ok(await sb.auth.updateUser({ password: nueva }));
    },
    async cargar() {
      const [solicitudes, tramos, ...resto] = await Promise.all([
        todo('dac_solicitudes', 'solicitud'), todo('dac_tramos', 'solicitud'),
        ...TABLAS.map((t) => todo(t, LLAVE[t] || 'id'))]);
      const D = { solicitudes, tramos };
      TABLAS.forEach((t, i) => { D[t.slice(4)] = resto[i]; });
      await Promise.all(Object.entries(OPCIONALES).map(async ([k, [t, o]]) => {
        try { D[k] = await todo(t, o); } catch (e) { console.warn(`${t}: ${e.message}`); D[k] = []; }
      }));
      return D;
    },
    async guardar(tabla, fila) {
      const conflicto = LLAVE[tabla];
      return ok(await (conflicto ? sb.from(tabla).upsert(fila, { onConflict: conflicto }) : sb.from(tabla).insert(fila)).select());
    },
    async borrar(tabla, campo, valor) { ok(await sb.from(tabla).delete().eq(campo, valor)); },
    async pedirActualizacion(nombre) {
      return ok(await sb.from('dac_actualizaciones').insert({ solicitado_nombre: nombre }).select().single());
    },
    async estadoActualizacion(id) { return ok(await sb.from('dac_actualizaciones').select('*').eq('id', id).single()); },
    usuarios: async () => ok(await sb.from('dac_perfiles').select('*').neq('rol', 'sistema').order('nombre')),
    crearUsuario: async (nombre, rol, analista) => ok(await sb.rpc('dac_crear_usuario',
      { p_usuario: DAC.slug(nombre), p_nombre: nombre, p_rol: rol, p_password: CLAVE_INICIAL, p_analista: analista || null })),
    editarUsuario: async (id, rol, analista, activo) => ok(await sb.rpc('dac_editar_usuario',
      { p_id: id, p_rol: rol, p_analista: analista || null, p_activo: activo })),
    restablecer: async (id) => ok(await sb.rpc('dac_restablecer_clave', { p_id: id, p_password: CLAVE_INICIAL })),
  };

  // ---------- Local (vista previa) ----------
  const ls = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem('dac.' + k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('dac.' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  let semilla = null;
  async function datosLocales() {
    if (!semilla) semilla = await (await fetch('local/datos.json', { cache: 'no-store' })).json();
    return semilla;
  }
  // Usuarios de la vista previa: los mismos que se crearán en Supabase
  async function usuariosLocales() {
    const base = [
      { nombre: 'Carlos Manuel Alvarez Gutierrez', rol: 'admin' },
      { nombre: 'Hilcia Paola Morales Mendez', rol: 'jefe' },
      { nombre: 'Katherine Gissell Mora Garcia', rol: 'jefe' },
      { nombre: 'Karen Maritza Arana Melendez', rol: 'gerente' },
    ];
    const an = ls.get('dac_analistas', null) || (await analistasSemilla());
    return ls.get('usuarios', null) || base.concat(an.map((a) => ({ nombre: titulo(a.nombre), rol: a.nombre.startsWith('LILIANA') ? 'reproceso' : 'analista', analista: a.nombre })))
      .map((u) => ({ id: DAC.slug(u.nombre), usuario: DAC.slug(u.nombre), activo: true, analista: null, ...u }));
  }
  const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  // Analistas iniciales: quienes registraron ANALISTA ASIGNADO o reprocesaron, con el producto que más atendieron.
  // Es solo un punto de partida para revisar en Administración.
  async function analistasSemilla() {
    const d = await datosLocales();
    const prod = new Map(d.solicitudes.map((s) => [s.solicitud, s.producto]));
    const cuenta = new Map();
    for (const t of d.tramos) {
      if (!t.analista || t.analista.startsWith('KATHERINE') || t.analista.startsWith('HILCIA')) continue;
      const c = cuenta.get(t.analista) || {};
      const p = prod.get(t.solicitud);
      c[p] = (c[p] || 0) + 1;
      cuenta.set(t.analista, c);
    }
    return [...cuenta].map(([nombre, c]) => ({ nombre, producto: Object.entries(c).sort((a, b) => b[1] - a[1])[0][0], activo: true, desde: null, hasta: null }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  const loc = {
    modo: 'local',
    async sesion() { return ls.get('sesion', null); },
    async ingresar(usuario, clave) {
      const u = (await usuariosLocales()).find((x) => x.usuario === DAC.slug(usuario));
      if (!u || clave !== (ls.get('claves', {})[u.usuario] || CLAVE_INICIAL)) throw new Error('Usuario o contraseña incorrectos');
      ls.set('sesion', u);
      return u;
    },
    async salir() { ls.set('sesion', null); },
    async cambiarClave(perfil, actual, nueva) {
      const c = ls.get('claves', {});
      if (actual !== (c[perfil.usuario] || CLAVE_INICIAL)) throw new Error('La contraseña actual no coincide');
      c[perfil.usuario] = nueva; ls.set('claves', c);
    },
    async cargar() {
      const d = await datosLocales();
      const D = { solicitudes: d.solicitudes, tramos: d.tramos, flujo_rapido: d.flujo_rapido || [], bitacora_resumen: d.bitacora_resumen || [],
        motor_resumen: d.motor_resumen || [], motor_lentas: d.motor_lentas || [] };
      D.analistas = ls.get('dac_analistas', null) || (await analistasSemilla());
      D.feriados = ls.get('dac_feriados', null) || DAC.feriadosPropuestos(new Date().getFullYear());
      D.horarios = ls.get('dac_horarios', []);
      D.ausencias = ls.get('dac_ausencias', []);
      D.eventos = ls.get('dac_eventos', []);
      D.config = ls.get('dac_config', null) || [];
      D.config = D.config.concat([{ clave: 'ultima_actualizacion', valor: d.ultima_actualizacion }]);
      if (!D.config.some((c) => c.clave === 'analista_reproceso')) D.config.push({ clave: 'analista_reproceso', valor: 'LILIANA ARGENTINA LOPEZ MENDIETA' });
      D.actualizaciones = ls.get('dac_actualizaciones', []);
      return D;
    },
    async guardar(tabla, fila) {
      const lista = tabla === 'dac_config' ? ls.get(tabla, []) : (await this.cargar())[tabla.slice(4)].slice();
      const k = LLAVE[tabla];
      const filas = [].concat(fila).map((f) => (k ? f : { id: f.id || Date.now() + Math.random(), ...f }));
      for (const f of filas) {
        const i = k ? lista.findIndex((x) => x[k] === f[k]) : -1;
        if (i >= 0) lista[i] = { ...lista[i], ...f }; else lista.push(f);
      }
      ls.set(tabla, lista);
      return filas;
    },
    async borrar(tabla, campo, valor) {
      ls.set(tabla, (await this.cargar())[tabla.slice(4)].filter((x) => x[campo] !== valor));
    },
    async pedirActualizacion() { throw new Error('En la vista previa local no hay actualización en línea. Ejecute worker/actualizar.py --local'); },
    usuarios: usuariosLocales,
    async crearUsuario(nombre, rol, analista) {
      const l = await usuariosLocales();
      if (l.some((u) => u.usuario === DAC.slug(nombre))) throw new Error('Ese usuario ya existe');
      l.push({ id: DAC.slug(nombre), usuario: DAC.slug(nombre), nombre, rol, analista, activo: true });
      ls.set('usuarios', l);
    },
    async editarUsuario(id, rol, analista, activo) {
      ls.set('usuarios', (await usuariosLocales()).map((u) => (u.id === id ? { ...u, rol, analista, activo } : u)));
    },
    async restablecer(id) { const c = ls.get('claves', {}); delete c[id]; ls.set('claves', c); },
  };

  window.API = local ? loc : nube;
})();
