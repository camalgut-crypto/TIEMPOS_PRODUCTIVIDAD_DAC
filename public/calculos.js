// Cálculos de Tiempos DAC: calendario hábil de Nicaragua, disponibilidad, productividad y tiempos.
// Todo se calcula en el navegador a partir de las solicitudes y tramos que carga el proceso de actualización.
(function () {
  const PRODUCTOS = ['PERS', 'PYMES', 'MOTO'];
  const RANGOS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 90, 240];
  const METAS = { PERS: 20, MOTO: 40, PYMES: 50 }; // minutos; se cambian en Administración

  const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fecha = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function* dias(desde, hasta) { for (let d = fecha(desde); iso(d) <= hasta; d = sumarDias(d, 1)) yield iso(d); }
  const minutosHHMM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

  // ---------- Feriados de Nicaragua ----------
  function pascua(y) { // algoritmo de Meeus/Jones/Butcher
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  // Propuesta de feriados nacionales del año. Si caen domingo se reponen el lunes (regla indicada por el DAC).
  function feriadosPropuestos(y) {
    const p = pascua(y);
    const base = [
      [`${y}-01-01`, 'Año Nuevo'],
      [iso(sumarDias(p, -3)), 'Jueves Santo'],
      [iso(sumarDias(p, -2)), 'Viernes Santo'],
      [iso(sumarDias(p, -1)), 'Sábado Santo'],
      [`${y}-05-01`, 'Día Internacional del Trabajo'],
      [`${y}-05-30`, 'Día de las Madres'],
      [`${y}-07-19`, 'Aniversario de la Revolución'],
      [`${y}-09-14`, 'Batalla de San Jacinto'],
      [`${y}-09-15`, 'Día de la Independencia'],
      [`${y}-12-08`, 'Inmaculada Concepción'],
      [`${y}-12-25`, 'Navidad'],
    ];
    const out = [];
    for (const [f, desc] of base) {
      if (fecha(f).getDay() === 0) out.push({ fecha: iso(sumarDias(fecha(f), 1)), valor: 0, descripcion: `${desc} (cae domingo, se repone el lunes)` });
      else out.push({ fecha: f, valor: 0, descripcion: desc });
    }
    return out;
  }

  // ---------- Contexto de cálculo ----------
  // D: {solicitudes, tramos, analistas, feriados, ausencias, eventos, config}
  function contexto(D, ahora = new Date()) {
    const cfg = Object.assign({ modo_hoy: 'proporcional', modo_tiempo: 'jornada', estados_excluidos: ["PENDIENTES", "VERIFICADOR MOTORIZADO", "REVISION APROBADOR", "COMITE CREDITO", "DEVUELTO GERENCIA", "RESOLUCION APROBADA", "RECHAZADO RESOLUCION", "RECHAZADO POR RECEPCION", "RECHAZADO POR MOTOR", "ENVIADO", "POR ASIGNAR A ANALISTA"],
      meta_minutos: 30, jornada: { lv: ['08:00', '18:00'], sab: ['08:00', '14:00'] } }, D.config || {});
    cfg.metas = { ...METAS, ...(cfg.metas || {}) };
    const feriados = new Map((D.feriados || []).map((f) => [f.fecha, Number(f.valor)]));
    const especiales = new Map((D.horarios || []).map((x) => [x.fecha, [x.inicio.slice(0, 5), x.fin.slice(0, 5)]]));
    // Horario hábil de un día: el especial de esa fecha o el normal (L-V / sábado)
    const horario = (f) => especiales.get(f) || (fecha(f).getDay() === 0 ? null : fecha(f).getDay() === 6 ? cfg.jornada.sab : cfg.jornada.lv);
    const hoy = iso(ahora);
    const analistas = (D.analistas || []).filter((a) => a.activo !== false);
    const esAnalista = new Set(analistas.map((a) => a.nombre));
    const productoDe = new Map(analistas.map((a) => [a.nombre, a.producto]));

    const valorDia = (f) => {
      if (feriados.has(f)) return feriados.get(f);
      const w = fecha(f).getDay();
      return w === 0 ? 0 : w === 6 ? 0.5 : 1;
    };
    // Fracción del día de hoy que ya transcurrió dentro de la jornada
    const fraccionHoy = () => {
      const h = horario(hoy);
      if (!h) return 0;
      const [a, b] = h.map(minutosHHMM);
      const m = ahora.getHours() * 60 + ahora.getMinutes();
      return Math.max(0, Math.min(1, (m - a) / (b - a)));
    };
    // Valor hábil de un día ya considerando que hoy está en curso y que el futuro no cuenta
    const valorTranscurrido = (f) => {
      if (f > hoy) return 0;
      const v = valorDia(f);
      if (f < hoy) return v;
      if (cfg.modo_hoy === 'excluir') return 0;
      if (cfg.modo_hoy === 'completo') return v;
      return v * fraccionHoy();
    };

    const ausenciasDe = new Map();
    for (const a of D.ausencias || []) {
      if (!ausenciasDe.has(a.analista)) ausenciasDe.set(a.analista, []);
      ausenciasDe.get(a.analista).push(a);
    }
    const eventosDe = new Map();
    for (const e of D.eventos || []) for (const n of e.analistas || []) {
      if (!eventosDe.has(n)) eventosDe.set(n, []);
      eventosDe.get(n).push(e);
    }

    // Días disponibles de un analista. personal=true suma los eventos especiales (solo para su productividad).
    function disponibilidad(nombre, desde, hasta, personal) {
      const a = analistas.find((x) => x.nombre === nombre);
      let total = 0;
      for (const f of dias(desde, hasta)) {
        if (a && ((a.desde && f < a.desde) || (a.hasta && f > a.hasta))) continue;
        let v = valorTranscurrido(f);
        const base = valorDia(f);
        for (const au of ausenciasDe.get(nombre) || []) {
          if (f >= au.desde && f <= au.hasta && base > 0) v = Math.max(0, v - (au.medio_dia ? Math.min(0.5, v) : v));
        }
        if (personal) for (const e of eventosDe.get(nombre) || []) {
          if (e.fecha === f && f <= hoy) v = Math.max(v, Number(e.valor) * (f === hoy ? fraccionHoy() || 1 : 1));
        }
        total += v;
      }
      return total;
    }
    const diasHabiles = (desde, hasta) => { let t = 0; for (const f of dias(desde, hasta)) t += valorTranscurrido(f); return t; };
    const diasHabilesTotales = (desde, hasta) => { let t = 0; for (const f of dias(desde, hasta)) t += valorDia(f); return t; };

    // ---------- Tiempos ----------
    const excl = new Set(cfg.estados_excluidos || []);
    const col = cfg.modo_tiempo === 'jornada' ? 1 : 0;
    // Reprocesamiento (preaprobado condicionado): solo el tiempo EN ANALISIS; mientras la solicitud está en
    // PREAPROBADO CONDICIONADO (esperando al promotor) el tiempo se detiene (indicado por el usuario 23-oct)
    const segundosTramo = (t) => {
      if (!t.fin || !t.estados) return null;
      let s = 0;
      for (const [e, v] of Object.entries(t.estados)) if (t.tipo === 'reproceso' ? e === 'EN ANALISIS' : !excl.has(e)) s += v[col];
      return s;
    };
    const tramosPorSol = new Map();
    for (const t of D.tramos || []) {
      if (!tramosPorSol.has(t.solicitud)) tramosPorSol.set(t.solicitud, []);
      tramosPorSol.get(t.solicitud).push(t);
    }
    for (const l of tramosPorSol.values()) l.sort((a, b) => a.n - b.n);
    const solPorId = new Map((D.solicitudes || []).map((s) => [s.solicitud, s]));
    // Valores para medir contra la meta del producto de la solicitud: {s: segundos, p: producto}
    const valorTramo = (t) => ({ s: segundosTramo(t), p: (solPorId.get(t.solicitud) || {}).producto, t });
    // Reprocesamiento de una solicitud: todos sus tramos de preaprobado condicionado como un solo caso
    function reprocesoDe(sol) {
      const tr = (tramosPorSol.get(sol) || []).filter((t) => t.tipo === 'reproceso');
      if (!tr.length) return null;
      const u = tr[tr.length - 1], abierto = tr.some((t) => !t.fin);
      const s = tr.reduce((a, t) => a + (segundosTramo(t) || 0), 0);
      return { solicitud: sol, analista: u.analista, s, p: (solPorId.get(sol) || {}).producto, tramos: tr, inicio: tr[0].inicio,
        fin: abierto ? null : u.fin, fin_estado: abierto ? 'EN CURSO' : u.fin_estado, abierto };
    }

    // Tiempo de la solicitud = último tramo de análisis cerrado; el caso queda a ese analista
    // El caso queda a quien dio la última decisión (aprobado/rechazado por analista, rechazado por recepción o resolución, TUD o preaprobado condicionado).
    // Si esa decisión cierra un reprocesamiento, queda al analista que dejó la solicitud en preaprobado condicionado.
    // El tiempo de la solicitud es el del tramo de ese analista.
    const DECISIONES = ['APROBADO POR ANALISTA', 'RECHAZADO POR ANALISTA', 'RECHAZADO POR RECEPCION', 'RECHAZADO RESOLUCION',
      'PREAPROBADO CONDICIONADO'];
    const esDecision = (e) => !!e && (DECISIONES.includes(e) || e.startsWith('TUD'));
    function global(s) {
      const tr = (tramosPorSol.get(s.solicitud) || []).filter((t) => t.fin);
      const analisis = tr.filter((t) => t.tipo === 'analisis');
      const dec = tr.filter((t) => esDecision(t.fin_estado));
      let u = dec[dec.length - 1];
      if (u && u.tipo === 'reproceso') u = analisis.filter((t) => t.fin <= u.inicio).pop();
      if (!u) u = analisis[analisis.length - 1]; // sin decisión: último tramo de análisis
      return u ? { analista: u.analista, segundos: segundosTramo(u), tramo: u, s: segundosTramo(u), p: s.producto, sol: s } : null;
    }
    // Horas hábiles de jornada de un día (para la capacidad instalada)
    const horasDia = (f) => {
      if (feriados.has(f) && !feriados.get(f)) return 0;
      const h = horario(f);
      if (!h) return 0;
      const [a, b] = h.map(minutosHHMM);
      return ((b - a) / 60) * (feriados.has(f) ? feriados.get(f) : 1);
    };

    return { cfg, hoy, ahora, horario, especiales, analistas, esAnalista, productoDe, valorDia, valorTranscurrido, fraccionHoy, disponibilidad,
      diasHabiles, diasHabilesTotales, segundosTramo, tramosPorSol, solPorId, global, valorTramo, horasDia, reprocesoDe };
  }

  // ---------- Métricas de un período ----------
  function metricas(C, D, desde, hasta, filtro = {}) {
    const enRango = (f) => f && f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta;
    const pasa = (s) => (!filtro.producto || s.producto === filtro.producto) && (!filtro.tipo || s.tipo_credito === filtro.tipo);
    const sols = D.solicitudes.filter((s) => enRango(s.ingreso_dac) && pasa(s));
    const dh = C.diasHabiles(desde, hasta);

    // Departamento y producto
    const porProducto = {};
    for (const p of PRODUCTOS) {
      const n = sols.filter((s) => s.producto === p).length;
      const an = C.analistas.filter((a) => a.producto === p);
      const disp = an.reduce((t, a) => t + C.disponibilidad(a.nombre, desde, hasta, false), 0);
      porProducto[p] = { n, analistas: an.length, disp, equiv: dh ? disp / dh : 0, prod: disp ? n / disp : null, porDia: dh ? n / dh : null };
    }
    const dispTotal = C.analistas.reduce((t, a) => t + C.disponibilidad(a.nombre, desde, hasta, false), 0);
    const depto = { n: sols.length, reestructuras: sols.filter((s) => s.reestructura).length, diasHabiles: dh,
      diasMes: C.diasHabilesTotales(desde, hasta), analistas: C.analistas.length, disp: dispTotal,
      equiv: dh ? dispTotal / dh : 0, porDia: dh ? sols.length / dh : null, prod: null, peso: {} };
    // Productividad del departamento: promedio de la productividad de cada producto, ponderado por su peso en solicitudes
    const conProd = PRODUCTOS.filter((p) => porProducto[p].prod != null);
    const nPond = conProd.reduce((t, p) => t + porProducto[p].n, 0);
    for (const p of PRODUCTOS) depto.peso[p] = nPond && porProducto[p].prod != null ? porProducto[p].n / nPond : 0;
    if (nPond) depto.prod = conProd.reduce((t, p) => t + porProducto[p].prod * depto.peso[p], 0);

    // Por analista: cada solicitud cuenta para cada analista que intervino (aunque sea de otro producto)
    const part = new Map();
    for (const t of D.tramos) {
      if (!t.analista || !enRango(t.inicio)) continue;
      const s = C.solPorId.get(t.solicitud);
      if (!s || !pasa(s)) continue;
      if (!part.has(t.analista)) part.set(t.analista, { sols: new Set(), propio: new Set(), otros: new Set(), reproceso: new Set() });
      const p = part.get(t.analista);
      p.sols.add(s.solicitud);
      (s.producto === C.productoDe.get(t.analista) ? p.propio : p.otros).add(s.solicitud);
      if (t.tipo === 'reproceso') p.reproceso.add(s.solicitud);
    }
    const porAnalista = C.analistas.map((a) => {
      const p = part.get(a.nombre) || { sols: new Set(), propio: new Set(), otros: new Set(), reproceso: new Set() };
      const disp = C.disponibilidad(a.nombre, desde, hasta, true);
      return { nombre: a.nombre, producto: a.producto, n: p.sols.size, propio: p.propio.size, otros: p.otros.size,
        reproceso: p.reproceso.size, disp, prod: disp ? p.sols.size / disp : null };
    });
    const sinConfigurar = [...part.keys()].filter((n) => !C.esAnalista.has(n))
      .map((n) => ({ nombre: n, n: part.get(n).sols.size }));
    return { sols, depto, porProducto, porAnalista, sinConfigurar };
  }

  // ---------- Distribución de tiempos ----------
  function rango(seg) {
    const m = seg / 60;
    for (const r of RANGOS) if (m <= r) return r;
    return Infinity;
  }
  // lista: segundos o {s, p} (p = producto, para medir contra su meta). metas: minutos o {PERS, PYMES, MOTO}
  function resumenTiempos(lista, metas) {
    const it = lista.map((x) => (x == null || typeof x === 'number' ? { s: x } : x)).filter((x) => x.s != null).sort((a, b) => a.s - b.s);
    const v = it.map((x) => x.s);
    const n = v.length;
    const lim = (x) => (typeof metas === 'number' ? metas : (metas[x.p] ?? 30)) * 60;
    const dist = new Map([...RANGOS, Infinity].map((r) => [r, 0]));
    for (const s of v) dist.set(rango(s), dist.get(rango(s)) + 1);
    return { n, prom: n ? v.reduce((a, b) => a + b, 0) / n : null, mediana: n ? v[Math.floor((n - 1) / 2)] : null,
      enMeta: n ? it.filter((x) => x.s <= lim(x)).length / n : null, dist };
  }
  // Casos de reprocesamiento cerrados que empezaron en el período (un caso por solicitud)
  function reprocesos(C, D, desde, hasta, filtro = {}) {
    const ids = new Set();
    for (const t of D.tramos) if (t.tipo === 'reproceso') ids.add(t.solicitud);
    const out = [];
    for (const id of ids) {
      const s = C.solPorId.get(id);
      if (!s || s.reestructura || (filtro.producto && s.producto !== filtro.producto) || (filtro.tipo && s.tipo_credito !== filtro.tipo)) continue;
      const r = C.reprocesoDe(id);
      if (!r || r.abierto || r.inicio.slice(0, 10) < desde || r.inicio.slice(0, 10) > hasta) continue;
      out.push(r);
    }
    return out;
  }
  // Universo DAC: una solicitud que se creó en un mes y entró al DAC en el siguiente (creada el 31, entra el 1) no cuenta como ingreso
  const mismoMes = (s) => !s.creada || s.creada.slice(0, 7) === s.ingreso_dac.slice(0, 7);
  // Semana del mes (W1 = del día 1 al primer domingo)
  const semanaMes = (f) => { const d = fecha(f), off = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7; return Math.floor((d.getDate() - 1 + off) / 7) + 1; };
  // Tramos de un tipo en el período (sin reestructuras: a ellas no se les miden tiempos)
  function tramosPeriodo(C, D, tipo, desde, hasta, filtro = {}) {
    return D.tramos.filter((t) => {
      if (t.tipo !== tipo || !t.fin || t.inicio.slice(0, 10) < desde || t.inicio.slice(0, 10) > hasta) return false;
      const s = C.solPorId.get(t.solicitud);
      return s && !s.reestructura && (!filtro.producto || s.producto === filtro.producto) && (!filtro.tipo || s.tipo_credito === filtro.tipo);
    });
  }

  window.DAC = { PRODUCTOS, RANGOS, METAS, slug, iso, fecha, sumarDias, dias, feriadosPropuestos, contexto, metricas,
    resumenTiempos, tramosPeriodo, mismoMes, semanaMes, reprocesos };
})();
