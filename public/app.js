// Tiempos DAC — Departamento de Análisis de Crédito, Instacredit Nicaragua
(function () {
  const { esc } = GRAF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DSEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const COLOR = { PERS: 'var(--s-pers)', PYMES: 'var(--s-pymes)', MOTO: 'var(--s-moto)' };
  const ROLES = { admin: 'Administrador', jefe: 'Jefe DAC', analista: 'Analista', reproceso: 'Analista con reprocesamiento', gerente: 'Gerente DAC' };
  const INICIO = '2026-01'; // información cargada desde enero 2026 (histórico) y en línea desde octubre
  const TABS = [
    ['dashboard', 'Dashboard', ['admin', 'jefe', 'gerente', 'analista', 'reproceso']],
    ['tiempos', 'Tiempos por analista', ['admin', 'jefe', 'analista', 'reproceso']],
    ['reproceso', 'Preaprobado condicionado', ['admin', 'jefe', 'reproceso']],
    ['cartera', 'Cartera actual', ['admin', 'jefe', 'analista', 'reproceso']],
    ['productividad', 'Productividad por analista', ['admin', 'jefe', 'analista', 'reproceso']],
    ['acumulado', 'Acumulado', ['admin', 'jefe', 'analista', 'reproceso']],
    ['global', 'Departamento (global)', ['admin', 'jefe']],
    ['motor', 'Flujo Rápido y motor', ['admin', 'jefe']],
    ['ciclo', 'Ciclo de la solicitud', ['admin', 'gerente']],
    ['capacidad', 'Capacidad instalada', ['admin', 'jefe']],
    ['calendario', 'Vacaciones y calendario', ['admin', 'jefe']],
    ['admin', 'Administración', ['admin', 'jefe']],
  ];

  const S = { perfil: null, D: null, C: null, tab: 'dashboard', mes: null, producto: '', tipo: '', vista: 'analista',
    gran: 'mes', anio: null, calMes: null, buscar: '', pedido: null, dgran: 'mes', dper: null, cap: null,
    camino: 'todas', cfin: 'final', cmed: null };
  const MES3 = MESES.map((m) => m.slice(0, 3));

  // ---------- Formato ----------
  const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString('es-NI'));
  const n2 = (v) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v) => (v == null ? '—' : (100 * v).toFixed(1) + '%');
  const dur = (s) => {
    if (s == null) return '—';
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')} h` : `${m}:${String(x).padStart(2, '0')} min`;
  };
  // Fechas con zona horaria (las que pone Supabase) se muestran en hora local; las del histórico ya vienen en hora local
  const fh = (s) => {
    if (!s) return '—';
    s = String(s);
    if (!/(Z|[+-]\d\d:?\d\d)$/.test(s)) return s.replace('T', ' ').slice(0, 16);
    const d = new Date(s);
    return `${DAC.iso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const titulo = (s) => (s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const mesTxt = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  const rangoMes = (p) => { const [y, m] = p.split('-').map(Number); return [`${p}-01`, DAC.iso(new Date(y, m, 0))]; };
  const prodTag = (p) => `<span class="prod"><i style="background:${COLOR[p]}"></i>${p}</span>`;
  const rangoTxt = (r) => (r === Infinity ? '+240' : `-${String(r).padStart(2, '0')}`);
  const heat = (v) => (v ? `background:rgba(75,157,69,${Math.min(0.85, 0.08 + v * 1.6)});color:${v > 0.3 ? '#fff' : 'inherit'}` : 'color:#B9BFCA');
  const puede = (tab) => TABS.find((t) => t[0] === tab)[2].includes(S.perfil.rol);
  const soloYo = () => (['analista', 'reproceso'].includes(S.perfil.rol) ? S.perfil.analista : null);
  const aviso = (e) => alert(e.message || e);
  const metas = () => S.C.cfg.metas;
  const metaTxt = () => DAC.PRODUCTOS.map((p) => `${p} ≤ ${metas()[p]} min`).join(' · ');
  const min2 = (s) => (s == null ? null : Math.round(s / 6) / 10); // segundos → minutos con un decimal (para Excel)

  // ---------- Ingreso ----------
  function login(msg = '') {
    app.innerHTML = `
      <div class="login">
        <div class="lado">
          <img class="logo" src="img/logo_claro.png" alt="Instacredit">
          <div><h1>Tiempos <span>DAC</span></h1><p>Departamento de Análisis de Crédito · Nicaragua<br>Tiempos de respuesta y productividad</p></div>
          <img class="mascota" src="img/prestamito_calculadora.png" alt="">
        </div>
        <form id="flog">
          <h2>Ingresar</h2>
          <p class="muted small">Escriba su usuario tal como se lo entregaron (por ejemplo: Hilcia Paola).</p>
          <label for="lu">Usuario</label><input id="lu" autocomplete="username" required>
          <label for="lp">Contraseña</label><input id="lp" type="password" autocomplete="current-password" required>
          <p class="small" style="color:var(--rojo);min-height:18px">${esc(msg)}</p>
          <button class="btn" style="width:100%">Entrar</button>
          ${API.modo === 'local' ? '<p class="nota alerta small">Vista previa local: los datos son los de la última ejecución de <b>actualizar.py --local</b> y lo que registre queda solo en este navegador.</p>' : ''}
        </form>
      </div>`;
    $('#flog').onsubmit = async (e) => {
      e.preventDefault();
      try { S.perfil = await API.ingresar($('#lu').value, $('#lp').value); await iniciar(); } catch (err) { login('Usuario o contraseña incorrectos'); }
    };
  }

  async function iniciar() {
    app.innerHTML = '<div class="vacio">Cargando información…</div>';
    S.D = preparar(await API.cargar());
    S.C = DAC.contexto({ ...S.D, config: S.D.config });
    const hoy = DAC.iso(new Date()).slice(0, 7);
    S.mes = S.mes || hoy;
    S.anio = S.anio || Number(hoy.slice(0, 4));
    S.calMes = S.calMes || hoy;
    if (!puede(S.tab)) S.tab = 'dashboard';
    pintar();
  }
  const recalcular = () => { S.C = DAC.contexto({ ...S.D, config: S.D.config }); };
  // Universo DAC: lo creado en un mes que entró al DAC el mes siguiente no cuenta como ingreso (queda en fueraDeMes)
  function preparar(D) {
    const sols = D.solicitudes || [];
    D.fueraDeMes = sols.filter((s) => !DAC.mismoMes(s));
    D.solicitudes = sols.filter(DAC.mismoMes);
    D.tramos = D.tramos || [];
    D.flujo_rapido = D.flujo_rapido || [];
    D.bitacora_resumen = D.bitacora_resumen || [];
    D.config = Object.fromEntries((D.config || []).map((c) => [c.clave, c.valor]));
    D.motor_resumen = D.motor_resumen || [];
    D.motor_lentas = D.motor_lentas || [];
    // Todo el preaprobado condicionado queda al analista con reprocesamiento (Liliana), aunque otro analista
    // haya vuelto a guardar el preaprobado (indicado por el usuario 23-oct)
    const rep = D.config.analista_reproceso;
    if (rep) for (const t of D.tramos) if (t.tipo === 'reproceso') t.analista = rep;
    return D;
  }

  // ---------- Estructura ----------
  function pintar() {
    const tabs = TABS.filter((t) => t[2].includes(S.perfil.rol));
    app.innerHTML = `
      <header class="top">
        <img src="img/logo_claro.png" alt="Instacredit">
        <div class="tit">Tiempos <span>DAC</span></div>
        <div class="yo"><span>${esc(S.perfil.nombre)}</span><span class="chip">${ROLES[S.perfil.rol]}</span>
          <button class="btn sec mini" data-act="clave">Cambiar contraseña</button>
          <button class="btn sec mini" data-act="salir">Salir</button></div>
      </header>
      ${tabs.length > 1 ? `<nav class="tabs">${tabs.map((t) => `<button data-tab="${t[0]}" class="${t[0] === S.tab ? 'on' : ''}">${t[1]}</button>`).join('')}</nav>` : ''}
      <main id="main"></main><div id="modal"></div>`;
    vista();
  }
  function vista() {
    const m = $('#main');
    LISTAS = [];
    try { m.innerHTML = VISTAS[S.tab](); } catch (e) { console.error(e); m.innerHTML = `<div class="card nota alerta">Error al calcular: ${esc(e.message)}</div>`; }
    if (S.tab === 'dashboard' || S.tab === 'cartera') vigilarPedido();
  }

  // ---------- Ventana de detalle (lista de solicitudes) ----------
  let MODAL = null;
  const limite = (f) => (f.metaSeg !== undefined ? f.metaSeg : (metas()[f.producto] || 30) * 60);
  function abrirLista(tituloLista, filas) {
    MODAL = { titulo: tituloLista, filas };
    const depto = filas.some((f) => f.dac != null);
    $('#modal').innerHTML = `<div class="velo" data-cerrar="1"><div class="ventana card" role="dialog" aria-label="${esc(tituloLista)}">
      <div class="cabeza"><h3>${tituloLista} · ${n0(filas.length)} ${filas.length === 1 ? 'registro' : 'registros'}</h3>
        <div><button class="btn sec mini" data-act="bajarModal">⬇ Descargar Excel</button> <button class="btn sec mini" data-cerrar="1">Cerrar</button></div></div>
      <div class="tabla"><table><thead><tr><th>Solicitud</th><th>Producto</th><th>Tipo de crédito</th><th>Tipo</th><th>Analista</th><th>Inicio</th><th>Fin</th><th>Termina en</th><th class="num">Tiempo</th>${depto ? '<th class="num">DAC</th><th class="num">Comercial</th>' : ''}<th class="num">Meta</th><th>Estado hoy</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td><button class="lnk" data-ver="${f.solicitud}">${f.solicitud}</button></td><td>${f.producto ? prodTag(f.producto) : ''}</td><td>${esc(f.tipo_credito || '')}</td>
        <td>${esc(f.tipo || '')}</td><td>${esc(titulo(f.analista || ''))}</td><td>${fh(f.inicio)}</td><td>${fh(f.fin)}</td><td>${esc(f.fin_estado || '')}</td>
        <td class="num"><b>${dur(f.segundos)}</b></td>${depto ? `<td class="num">${dur(f.dac)}</td><td class="num">${dur(f.com)}</td>` : ''}<td class="num">${f.segundos == null || limite(f) == null ? '' : f.segundos <= limite(f) ? '<span style="color:var(--verde)">✓</span>' : '<span style="color:var(--rojo)">✗</span>'}</td>
        <td class="small">${esc(f.estado_hoy || '')}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  }
  const cerrarLista = () => { MODAL = null; $('#modal').innerHTML = ''; };
  // Fila de detalle a partir de un tramo
  function filaTramo(t) {
    const s = S.C.solPorId.get(t.solicitud) || {};
    return { solicitud: t.solicitud, producto: s.producto, tipo_credito: s.tipo_credito, tipo: t.tipo === 'analisis' ? 'Análisis' : 'Preaprobado condicionado',
      analista: t.analista, inicio: t.inicio, fin: t.fin, fin_estado: t.fin_estado, segundos: S.C.segundosTramo(t), estado_hoy: s.ultimo_estado || s.estado_actual };
  }

  // ---------- Descarga a Excel (SheetJS, se carga solo al usarlo) ----------
  let xlsx = null;
  async function excel(nombre, hojas) {
    if (!xlsx) xlsx = new Promise((ok, mal) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = () => ok(window.XLSX); sc.onerror = () => { xlsx = null; mal(new Error('No se pudo cargar el generador de Excel (revise la conexión a internet).')); };
      document.head.appendChild(sc);
    });
    const X = await xlsx, wb = X.utils.book_new();
    for (const [h, filas] of Object.entries(hojas)) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin datos' }]), h.slice(0, 31));
    X.writeFile(wb, `${nombre}.xlsx`);
  }
  const xlsFila = (f) => ({ Solicitud: f.solicitud, Producto: f.producto, 'Tipo de crédito': f.tipo_credito, Tipo: f.tipo, Analista: f.analista,
    Inicio: f.inicio, Fin: f.fin, 'Termina en': f.fin_estado, 'Tiempo (min)': min2(f.segundos),
    ...(f.dac != null ? { 'DAC (min)': min2(f.dac), 'Comercial (min)': min2(f.com) } : {}),
    'Meta (min)': limite(f) == null ? null : limite(f) / 60, 'Estado hoy': f.estado_hoy });

  // Selector de mes, producto y tipo de crédito
  function meses() {
    const s = new Set([INICIO, DAC.iso(new Date()).slice(0, 7), ...S.D.solicitudes.map((x) => x.ingreso_dac.slice(0, 7))]);
    return [...s].filter((p) => p >= INICIO).sort().reverse();
  }
  function filtros({ producto = true, tipo = true, extra = '' } = {}) {
    const tipos = [...new Set(S.D.solicitudes.map((s) => s.tipo_credito).filter(Boolean))].sort();
    return `<div class="filtros">
      <label>Mes<select data-f="mes">${meses().map((p) => `<option value="${p}" ${p === S.mes ? 'selected' : ''}>${mesTxt(p)}</option>`).join('')}</select></label>
      ${producto ? `<label>Producto<select data-f="producto"><option value="">Todos</option>${DAC.PRODUCTOS.map((p) => `<option ${p === S.producto ? 'selected' : ''}>${p}</option>`).join('')}</select></label>` : ''}
      ${tipo ? `<label>Tipo de crédito<select data-f="tipo"><option value="">Todos</option>${tipos.map((t) => `<option ${t === S.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
      ${extra}</div>`;
  }
  const filtroDatos = () => ({ producto: S.producto, tipo: S.tipo });

  function notaHoy(M, [d, h] = rangoMes(S.mes)) {
    const C = S.C;
    if (!(C.hoy >= d && C.hoy <= h)) return `Días hábiles del período: <b>${n2(M.depto.diasMes)}</b>.`;
    const modo = { excluir: 'no se cuenta', completo: 'se cuenta completo', proporcional: `cuenta ${n2(C.valorTranscurrido(C.hoy))} de ${n2(C.valorDia(C.hoy))} (proporcional a la jornada transcurrida)` }[C.cfg.modo_hoy];
    return `Días hábiles transcurridos: <b>${n2(M.depto.diasHabiles)}</b> de ${n2(M.depto.diasMes)} del período · hoy ${modo}.`;
  }

  // ---------- Dashboard ----------
  const SERIE_META = () => [{ nombre: 'Dentro de la meta', color: 'var(--navy)' }, { nombre: 'Fuera de la meta', color: 'var(--verde)' }];
  const partesMeta = (R) => (R.n ? [Math.round(R.enMeta * R.n), R.n - Math.round(R.enMeta * R.n)] : [0, 0]);
  const tipMeta = (nom, R) => `<b>${nom}</b><br>${n0(R.n)} solicitudes con tiempo medido<br>Dentro de la meta: ${pct(R.enMeta)}<br>Mediana: ${dur(R.mediana)}`;
  function listaPeriodos(gran) {
    const out = [];
    for (let y = Number(INICIO.slice(0, 4)); y <= new Date().getFullYear(); y++) out.push(...periodos(gran, y));
    return out.reverse();
  }
  function periodoDash() {
    const L = listaPeriodos(S.dgran);
    const P = (S.dgran === 'mes' ? L.find((p) => p.desde.slice(0, 7) === S.mes) : L.find((p) => p.desde === S.dper)) || L[0];
    S.dper = P.desde;
    if (S.dgran === 'mes') S.mes = P.desde.slice(0, 7);
    return { P, L };
  }
  const mesesEntre = (d, h) => {
    const out = [];
    for (let m = d.slice(0, 7); m <= h.slice(0, 7);) { out.push(m); const [y, k] = m.split('-').map(Number); m = DAC.iso(new Date(y, k, 1)).slice(0, 7); }
    return out;
  };
  const casosDe = (C, sols) => sols.filter((s) => !s.reestructura).map((s) => C.global(s)).filter(Boolean);
  const flujoEn = (d, h) => S.D.flujo_rapido.filter((x) => x.creada && x.creada.slice(0, 10) >= d && x.creada.slice(0, 10) <= h);

  // Filtro del dashboard al hacer clic en un día, una hora, una celda del mapa o una semana: "fil|desde|hasta|hora"
  const filClic = (d1, d2, hora, analista = S.dfiltro && S.dfiltro.analista) => `fil|${d1 || ''}|${d2 || ''}|${hora ?? ''}|${analista || ''}`;
  function textoFiltro(F) {
    const dia = (f) => `${Number(f.slice(8))} ${MES3[Number(f.slice(5, 7)) - 1].toLowerCase()}`;
    const p = [];
    if (F.d1) p.push(F.d1 === F.d2 ? dia(F.d1) : `${dia(F.d1)} – ${dia(F.d2)}`);
    if (F.hora != null) p.push(`${F.hora}:00 a ${F.hora}:59`);
    if (F.analista) p.push(titulo(F.analista));
    return p.join(' · ');
  }

  function dashboard() {
    const { P, L } = periodoDash();
    const esMes = S.dgran === 'mes';
    // El filtro de día/hora solo vale para el período en que se hizo
    const F = S.dfiltro && S.dfiltro.per === `${S.dgran}:${P.desde}` ? S.dfiltro : (S.dfiltro = null);
    const d = (F && F.d1) || P.desde, h = (F && F.d2) || P.hasta;
    const deHora = (f) => !F || F.hora == null || (!!f && Number(f.slice(11, 13)) === F.hora);
    // Analista elegido: solicitudes en que intervino (cualquier tramo)
    const delAnalista = F && F.analista ? new Set(S.D.tramos.filter((t) => t.analista === F.analista).map((t) => t.solicitud)) : null;
    const deAnalista = (s) => !delAnalista || delAnalista.has(s.solicitud);
    const filtro = { pred: (s) => deHora(s.ingreso_dac) && deAnalista(s) };
    const C = S.C, M = DAC.metricas(C, S.D, d, h, filtro);
    const casos = casosDe(C, M.sols);
    const T = DAC.resumenTiempos(casos, metas());
    const R = DAC.resumenTiempos(DAC.reprocesos(C, S.D, d, h, filtro), metas());
    const fr = delAnalista ? [] : flujoEn(d, h).filter((x) => deHora(x.creada));
    const hastaHoy = P.hasta > C.hoy ? C.hoy : P.hasta;
    const nomP = esMes ? mesTxt(S.mes) : P.nom;

    // Flujo de ingresos: día (o mes) en el eje horizontal, hora de ingreso al DAC en el vertical. Siempre del período
    // completo, para poder elegir un día, una hora o una celda y filtrar el resto del dashboard.
    const solsP = S.D.solicitudes.filter((s) => s.ingreso_dac.slice(0, 10) >= P.desde && s.ingreso_dac.slice(0, 10) <= P.hasta && deAnalista(s));
    const cols = esMes ? [...DAC.dias(P.desde, hastaHoy)].map((f) => ({ k: f, d1: f, d2: f, t: Number(f.slice(8)), sub: DSEM[(DAC.fecha(f).getDay() + 6) % 7][0], nohabil: !C.valorDia(f) }))
      : mesesEntre(P.desde, hastaHoy).map((m) => ({ k: m, d1: `${m}-01`, d2: rangoMes(m)[1], t: MES3[Number(m.slice(5)) - 1], sub: '' }));
    const colDe = (s) => (esMes ? s.ingreso_dac.slice(0, 10) : s.ingreso_dac.slice(0, 7));
    const cnt = new Map();
    let hMin = 8, hMax = 18;
    for (const s of solsP) {
      const hr = Number(s.ingreso_dac.slice(11, 13)), key = `${colDe(s)}|${hr}`;
      cnt.set(key, (cnt.get(key) || 0) + 1);
      hMin = Math.min(hMin, hr); hMax = Math.max(hMax, hr);
    }
    const horasM = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
    const maxC = Math.max(1, ...cnt.values());
    const totCol = (c) => horasM.reduce((t, hr) => t + (cnt.get(`${c.k}|${hr}`) || 0), 0);
    const totHora = (hr) => cols.reduce((t, c) => t + (cnt.get(`${c.k}|${hr}`) || 0), 0);
    const selCol = (c) => F && F.d1 && F.d1 <= c.d1 && F.d2 >= c.d2;
    const selHora = (hr) => F && F.hora === hr;
    const celda = (c, hr) => {
      const n = cnt.get(`${c.k}|${hr}`) || 0, v = n / maxC;
      const on = (selCol(c) || !(F && F.d1)) && (selHora(hr) || !F || F.hora == null) && F && (F.d1 || F.hora != null) ? ' on' : '';
      return `<td class="c${on}" style="${n ? `background:rgba(6,37,91,${(0.08 + 0.85 * v).toFixed(2)});color:${v > 0.45 ? '#fff' : 'var(--navy)'}` : ''}"
        data-clic="${filClic(c.d1, c.d2, hr)}" data-tip="${esMes ? `${Number(c.k.slice(8))}/${c.k.slice(5, 7)}` : mesTxt(c.k)} · ${hr}:00 a ${hr}:59<br><b>${n0(n)}</b> solicitudes<br><i>clic para filtrar</i>">${n || ''}</td>`;
    };
    const mapa = `<h3>Flujo de ingresos al DAC por ${esMes ? 'día' : 'mes'} y hora</h3>
      <p class="muted small" style="margin-top:-4px">Cada celda es la cantidad de solicitudes que pasaron por primera vez a POR ASIGNAR A ANALISTA ese ${esMes ? 'día' : 'mes'} a esa hora (más oscuro = más solicitudes). Clic en ${esMes ? 'un día' : 'un mes'}, una hora o una celda para filtrar todo el dashboard; otro clic en lo mismo quita el filtro. Si se creó en un mes y entró al DAC el mes siguiente, no se cuenta como ingreso.</p>
      <div class="tabla mapa"><table><thead><tr><th>Hora</th>${cols.map((c) => `<th class="num${selCol(c) ? ' on' : ''}${c.nohabil ? ' nh' : ''}" data-clic="${esMes ? filClic(c.d1, c.d2, F && F.hora) : `mes:${c.k}`}" data-tip="${esMes ? 'Clic para filtrar este día' : 'Clic para ver el mes'}">${c.t}<br><span class="small">${c.sub}</span></th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${horasM.map((hr) => `<tr><td class="hh${selHora(hr) ? ' on' : ''}" data-clic="${filClic(F && F.d1, F && F.d2, hr)}" data-tip="Clic para filtrar esta hora">${hr}:00</td>${cols.map((c) => celda(c, hr)).join('')}<td class="num"><b>${n0(totHora(hr))}</b></td></tr>`).join('')}
      <tr class="total"><td>Total</td>${cols.map((c) => `<td class="num${selCol(c) ? ' on' : ''}" ${esMes ? `data-clic="${filClic(c.d1, c.d2, F && F.hora)}"` : `data-clic="mes:${c.k}"`}>${n0(totCol(c))}</td>`).join('')}<td class="num">${n0(solsP.length)}</td></tr></tbody></table></div>`;

    // Horas pico: hora en que ingresó al DAC (con el filtro de día aplicado). Clic en una hora para filtrar.
    const porHora = new Map();
    for (const s of M.sols) { const k = Number(s.ingreso_dac.slice(11, 13)); porHora.set(k, (porHora.get(k) || 0) + 1); }
    const maxH = Math.max(1, ...porHora.values());
    const horas = `<h3>Horas pico</h3><p class="muted small" style="margin-top:-4px">Hora en que la solicitud ingresó al DAC. Clic en una hora para filtrar.</p>
      <div class="tabla"><table class="compacta"><thead><tr><th>Hora de ingreso</th><th class="num">Cantidad</th><th class="num">%</th><th style="width:45%"></th></tr></thead><tbody>
      ${[...porHora.keys()].sort((a, b) => a - b).map((k) => { const n = porHora.get(k); return `<tr class="clicable${selHora(k) ? ' sel' : ''}" data-clic="${filClic(F && F.d1, F && F.d2, k)}"><td>${k}:00</td><td class="num">${n0(n)}</td><td class="num">${pct(n / M.sols.length)}</td>
        <td><div class="bar1"><b style="width:${(100 * n) / maxH}%;background:${n === maxH ? 'var(--navy)' : 'var(--verde)'}"></b></div></td></tr>`; }).join('')}
      <tr class="total"><td>Total</td><td class="num">${n0(M.sols.length)}</td><td class="num">${M.sols.length ? '100.0%' : '—'}</td><td></td></tr></tbody></table></div>`;

    // Tiempos de respuesta: por semana (mes) o por mes (trimestre, semestre, año). Clic en una semana para filtrar.
    const diasP = [...DAC.dias(P.desde, P.hasta)];
    const claves = esMes ? [...new Set(diasP.map((f) => `W${DAC.semanaMes(f)}`))] : mesesEntre(P.desde, P.hasta);
    const grupoDe = (c) => (esMes ? `W${DAC.semanaMes(c.sol.ingreso_dac)}` : c.sol.ingreso_dac.slice(0, 7));
    const diasSem = (w) => diasP.filter((x) => `W${DAC.semanaMes(x)}` === w);
    const rangoSem = (w) => { const f = diasSem(w); return `${Number(f[0].slice(8))}–${Number(f[f.length - 1].slice(8))} ${MES3[Number(P.desde.slice(5, 7)) - 1].toLowerCase()}`; };
    const porGrupo = claves.map((k) => {
      const Rk = DAC.resumenTiempos(casos.filter((c) => grupoDe(c) === k), metas());
      const f = esMes ? diasSem(k) : null;
      return { x: esMes ? k : MES3[Number(k.slice(5)) - 1], partes: partesMeta(Rk), tip: `${tipMeta(esMes ? `${k} (${rangoSem(k)})` : mesTxt(k), Rk)}<br><i>clic para ${esMes ? 'filtrar la semana' : 'ver el mes'}</i>`,
        clic: esMes ? filClic(f[0], f[f.length - 1], F && F.hora) : `mes:${k}` };
    });
    porGrupo.push({ x: 'Total', total: true, partes: partesMeta(T), tip: tipMeta(`Total ${F ? textoFiltro(F) : nomP}`, T) });

    // Evolución del año: tiempos de respuesta y productividad por mes (clic en un mes para verlo)
    const anio = P.desde.slice(0, 4), mesHoy = C.hoy.slice(0, 7);
    const mesesAnio = MESES.map((_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
    const MA = mesesAnio.map((m) => (m < INICIO || m > mesHoy ? null : DAC.metricas(C, S.D, ...rangoMes(m))));
    const RA = MA.map((x) => (x ? DAC.resumenTiempos(casosDe(C, x.sols), metas()) : null));
    const etq = (i) => `${MES3[i].toLowerCase()}-${anio.slice(2)}`;
    const evoT = GRAF.apiladas(mesesAnio.map((m, i) => ({ x: etq(i), partes: RA[i] ? partesMeta(RA[i]) : [0, 0],
      tip: RA[i] ? `${tipMeta(mesTxt(m), RA[i])}<br><i>clic para ver el mes</i>` : `${mesTxt(m)}: sin datos`, clic: RA[i] ? `mes:${m}` : null })), SERIE_META());
    const evoP = GRAF.columnas(mesesAnio.map((m, i) => ({ x: etq(i), y: MA[i] ? MA[i].depto.prod || 0 : 0,
      tip: MA[i] ? `<b>${mesTxt(m)}</b><br>Productividad ${n2(MA[i].depto.prod)}<br>${n0(MA[i].depto.n)} solicitudes · ${n2(MA[i].depto.diasHabiles)} días hábiles<br><i>clic para ver el mes</i>` : `${mesTxt(m)}: sin datos`,
      clic: MA[i] ? `mes:${m}` : null })), { fmt: n2, etiquetas: true, color: 'var(--navy)', marcarMax: false });

    const yo = soloYo();
    const pa = M.porAnalista.filter((a) => !yo || a.nombre === yo).sort((a, b) => (b.prod || 0) - (a.prod || 0));
    const ult = S.D.config.ultima_actualizacion;
    const seg = `<div class="seg">${[['mes', 'Mensual'], ['trimestre', 'Trimestral'], ['semestre', 'Semestral'], ['anio', 'Anual']].map(([k, t]) => `<button data-dgran="${k}" class="${S.dgran === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const selP = `<select data-f="dper">${L.map((x) => `<option value="${x.desde}" ${x.desde === P.desde ? 'selected' : ''}>${S.dgran === 'mes' ? mesTxt(x.desde.slice(0, 7)) : x.nom}</option>`).join('')}</select>`;
    return `
      <div class="cabeza">
        <div><h2>Departamento de Análisis · ${nomP}</h2>
          <div class="muted small">${notaHoy(M, [d, h])} Última actualización: <b>${fh(ult)}</b></div>
          ${F ? `<div class="chip-filtro">Filtrado: <b>${textoFiltro(F)}</b> <button class="btn sec mini" data-act="quitarFiltro">✕ Quitar filtro</button></div>` : ''}</div>
        <div><div class="filtros"><label>Período${seg}</label><label>&nbsp;${selP}</label><button class="btn" data-act="actualizar">⟳ Actualizar</button></div>
          <div class="estado-act muted" id="estadoAct" style="margin-top:-8px"></div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Solicitudes DAC</div><div class="v">${n0(M.depto.n)}</div><div class="s">${n0(M.depto.reestructuras)} reestructuras · ${n2(M.depto.porDia)} por día hábil</div></div>
        <div class="kpi verde"><div class="l">Productividad del departamento</div><div class="v">${n2(M.depto.prod)}</div><div class="s">ponderada por producto · ${DAC.PRODUCTOS.map((p) => `${p} ${pct(M.depto.peso[p])}`).join(' · ')}</div></div>
        <div class="kpi cielo"><div class="l">Tiempo de la solicitud</div><div class="v">${dur(T.mediana)}</div><div class="s">mediana · promedio ${dur(T.prom)}</div></div>
        <div class="kpi lima"><div class="l">Dentro de la meta</div><div class="v">${pct(T.enMeta)}</div><div class="s">${metaTxt()} · ${n0(T.n)} solicitudes</div></div>
        <div class="kpi naranja"><div class="l">Preaprobado condicionado</div><div class="v">${n0(R.n)}</div><div class="s">solicitudes reprocesadas · mediana en análisis ${dur(R.mediana)}</div></div>
        <div class="kpi blanco"><div class="l">Flujo Rápido (motor)</div><div class="v">${n0(fr.length)}</div><div class="s">sin pasar por un analista · ${n0(fr.filter((x) => x.resolucion === 'APROBADO POR MOTOR').length)} aprobadas por motor</div></div>
      </div>
      <div class="grid g3" style="margin-bottom:14px">${DAC.PRODUCTOS.map((p) => { const x = M.porProducto[p], Tp = DAC.resumenTiempos(casos.filter((c) => c.p === p), metas()); return `
        <div class="card"><h3>${prodTag(p)}</h3>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="tit" style="font-size:28px;font-weight:800;color:var(--navy)">${n2(x.prod)}</span><span class="muted small">productividad</span></div>
          <div class="muted small">${n0(x.n)} solicitudes · ${n2(x.porDia)} por día · ${x.analistas} analistas (${n2(x.equiv)} disponibles)<br>
            Meta ≤ ${metas()[p]} min: <b>${pct(Tp.enMeta)}</b> dentro · mediana ${dur(Tp.mediana)}</div></div>`; }).join('')}</div>
      <div class="card" style="margin-bottom:14px">${mapa}</div>
      <div class="grid g2">
        <div class="card">${horas}</div>
        <div class="card"><h3>Tiempos de respuesta · ${F ? textoFiltro(F) : nomP}</h3><p class="muted small" style="margin-top:-4px">Tiempo de la solicitud contra la meta de su producto (${metaTxt()}).${esMes ? ' Semanas de lunes a domingo según el día de ingreso al DAC; clic en una semana para filtrar.' : ' Clic en un mes para verlo.'}</p>
          ${GRAF.apiladas(porGrupo, SERIE_META())}</div>
        <div class="card" style="grid-column:1/-1"><h3>Productividad por analista${F ? ` · ${textoFiltro(F)}` : ''}</h3><p class="muted small" style="margin-top:-4px">Solicitudes en que intervino / días disponibles. Cambia con el filtro de día y hora; clic en un analista para filtrar todo el dashboard (incluido el mapa) a sus solicitudes.</p>
          ${GRAF.barras(pa.map((a) => ({ nombre: titulo(a.nombre), y: a.prod, color: COLOR[a.producto],
            tip: `${esc(titulo(a.nombre))} (${a.producto})<br>${a.n} solicitudes / ${n2(a.disp)} días = ${n2(a.prod)}<br><i>clic para ${F && F.analista === a.nombre ? 'quitar el filtro del analista' : 'filtrar el dashboard por este analista'}</i>`,
            clic: filClic(F && F.d1, F && F.d2, F && F.hora, F && F.analista === a.nombre ? '' : a.nombre), sel: F && F.analista === a.nombre })), { fmt: n2 })}
          <div class="leyenda" style="margin-top:8px">${DAC.PRODUCTOS.map((p) => `<span><i style="background:${COLOR[p]};height:10px;width:10px"></i>${p}</span>`).join('')}</div></div>
        <div class="card"><h3>Tiempos de respuesta por mes · ${anio}</h3><p class="muted small" style="margin-top:-4px">Año completo, sin el filtro de día u hora. Clic en un mes para verlo.</p>${evoT}</div>
        <div class="card"><h3>Productividad por mes · ${anio}</h3><p class="muted small" style="margin-top:-4px">Productividad del departamento, año completo. Clic en un mes para verlo.</p>${evoP}</div>
      </div>`;
  }

  // Botón Actualizar: deja la solicitud en la nube; el proceso de actualización la atiende
  async function pedirActualizacion() {
    try {
      const p = await API.pedirActualizacion(S.perfil.nombre);
      S.pedido = p.id;
      vigilarPedido();
    } catch (e) { aviso(e); }
  }
  let reloj = null;
  async function vigilarPedido() {
    clearTimeout(reloj);
    const el = $('#estadoAct');
    if (!el || !S.pedido) return;
    try {
      const p = await API.estadoActualizacion(S.pedido);
      const txt = { pendiente: 'Solicitud enviada; esperando al proceso de actualización…', procesando: 'Actualizando: consultando el datawarehouse…', ok: '✓ Actualizado', error: 'Error: ' + (p.mensaje || '') }[p.estado];
      el.textContent = txt;
      if (p.estado === 'ok') { S.pedido = null; await iniciar(); return; }
      if (p.estado === 'error') { S.pedido = null; return; }
      if (p.estado === 'pendiente' && Date.now() - new Date(p.solicitado_en) > 120000) el.textContent = 'Solicitud enviada; el proceso de actualización no ha respondido. Verifique que el equipo donde corre esté encendido.';
      reloj = setTimeout(vigilarPedido, 5000);
    } catch (e) { el.textContent = e.message; }
  }

  // ---------- Tablas de tiempos ----------
  // Listas que se abren al hacer clic en una cantidad (se reinicia en cada vista)
  let LISTAS = [];
  const lista = (tituloLista, filas) => LISTAS.push({ titulo: tituloLista, filas }) - 1;
  const conLista = (n, tituloLista, filas) => (filas && filas.length ? `<button class="lnk" data-casos="${lista(tituloLista, filas)}" data-tip="Ver las solicitudes">${n0(n)}</button>` : n0(n));

  // grupos: [{nombre, valores: [{s, p}], filas: [detalle]}]
  function tablaTiempos(grupos, etiqueta = 'Analista', tituloLista = '') {
    const total = DAC.resumenTiempos(grupos.flatMap((g) => g.valores), metas());
    const fila = (nom, R, filas, cls = '') => `<tr class="${cls}"><td>${nom}</td><td class="num">${conLista(R.n, `${tituloLista} · ${nom.replace(/<[^>]+>/g, '')}`, filas)}</td><td class="num">${dur(R.prom)}</td><td class="num">${dur(R.mediana)}</td><td class="num"><b>${pct(R.enMeta)}</b></td>
      ${[...R.dist.values()].map((c) => { const v = R.n ? c / R.n : 0; return `<td class="heat" style="${heat(v)}" data-tip="${c} de ${R.n}">${v ? Math.round(100 * v) + '%' : '·'}</td>`; }).join('')}</tr>`;
    return `<div class="tabla"><table><thead><tr><th>${etiqueta}</th><th class="num">Casos</th><th class="num">Promedio</th><th class="num">Mediana</th><th class="num" data-tip="${metaTxt()} (según el producto de la solicitud)">En meta</th>
      ${[...DAC.RANGOS, Infinity].map((r) => `<th class="num">${rangoTxt(r)}</th>`).join('')}</tr></thead><tbody>
      ${grupos.map((g) => fila(g.nombre, DAC.resumenTiempos(g.valores, metas()), g.filas)).join('')}
      ${grupos.length > 1 ? fila('Total', total, grupos.flatMap((g) => g.filas || []), 'total') : ''}</tbody></table></div>`;
  }
  const agrupar = (lista0, clave, valor) => {
    const m = new Map();
    for (const x of lista0) { const k = clave(x) || '(sin analista)'; if (!m.has(k)) m.set(k, []); m.get(k).push(valor(x)); }
    return [...m].map(([k, v]) => ({ k, valores: v })).sort((a, b) => b.valores.length - a.valores.length);
  };
  const nombreAnalista = (k) => `${esc(titulo(k))}${S.C.esAnalista.has(k) ? ` <span class="muted small">${S.C.productoDe.get(k)}</span>` : ' <span class="muted small">(no es analista)</span>'}`;
  // Tramos agrupados por analista, con su detalle
  const gruposTramos = (tr) => agrupar(tr, (t) => t.analista, (t) => t)
    .map((g) => ({ nombre: nombreAnalista(g.k), valores: g.valores.map(S.C.valorTramo), filas: g.valores.map(filaTramo) }));

  function notaTiempos() {
    const c = S.C.cfg;
    const j = c.jornada;
    return `<p class="muted small">Tiempo en <b>${c.modo_tiempo === 'jornada' ? `horas hábiles (L-V ${j.lv[0]}–${j.lv[1]}, sábado ${j.sab[0]}–${j.sab[1]}, más horarios especiales)` : 'hora reloj'}</b>, sin contar: <b>${(c.estados_excluidos || []).join(', ') || 'ningún estado'}</b>. Las reestructuras no se miden. Cada solicitud se mide hasta el cierre del mes en que ingresó. Meta según el producto de la solicitud: <b>${metaTxt()}</b>. Rangos en minutos (como el Excel: -05 = hasta 5 min). Clic en la cantidad de casos para ver las solicitudes.</p>`;
  }

  // Solicitudes del mes con los filtros de la pantalla
  const solsMes = (d, h) => S.D.solicitudes.filter((s) => s.ingreso_dac.slice(0, 10) >= d && s.ingreso_dac.slice(0, 10) <= h
    && (!S.producto || s.producto === S.producto) && (!S.tipo || s.tipo_credito === S.tipo));
  const filaSol = (s) => ({ solicitud: s.solicitud, producto: s.producto, tipo_credito: s.tipo_credito, tipo: s.reestructura ? 'Reestructura' : '', inicio: s.ingreso_dac, estado_hoy: s.ultimo_estado || s.estado_actual });

  // Por qué no coinciden las cantidades de las dos vistas y del dashboard
  function cuadre(d, h) {
    const C = S.C, sols = solsMes(d, h);
    const reest = sols.filter((s) => s.reestructura);
    const sinCaso = sols.filter((s) => !s.reestructura && !C.global(s));
    const casos = sols.length - reest.length - sinCaso.length;
    const tr = DAC.tramosPeriodo(C, S.D, 'analisis', d, h, filtroDatos());
    const porSol = new Map();
    for (const t of tr) porSol.set(t.solicitud, (porSol.get(t.solicitud) || 0) + 1);
    const varias = tr.filter((t) => porSol.get(t.solicitud) > 1);
    const nVarias = new Set(varias.map((t) => t.solicitud)).size;
    return `<div class="nota"><b>Cuadre de ${mesTxt(S.mes)}:</b> ${n0(sols.length)} solicitudes DAC (Dashboard)
      − ${conLista(reest.length, 'Reestructuras (no se mide tiempo)', reest.map(filaSol))} reestructuras
      − ${conLista(sinCaso.length, 'Sin tramo de análisis cerrado', sinCaso.map(filaSol))} sin tramo de análisis cerrado (en cola o en análisis al corte)
      = <b>${n0(casos)}</b> casos en <i>Tiempo de la solicitud</i>.<br>
      <i>Tramos por analista</i> cuenta tramos, no solicitudes: ${n0(tr.length)} tramos de ${n0(porSol.size)} solicitudes, porque
      ${conLista(nVarias, 'Solicitudes con más de un tramo', varias.map(filaTramo))} solicitudes tuvieron más de un tramo (reasignadas, devueltas a la cola, o pre análisis y luego análisis).
      Los tramos se cuentan en el mes en que empezaron.</div>`;
  }

  function tiempos() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, yo = soloYo();
    let grupos, titulo2, extra = '';
    if (S.vista === 'analista') {
      const tr = DAC.tramosPeriodo(C, S.D, 'analisis', d, h, filtroDatos()).filter((t) => !yo || t.analista === yo);
      grupos = gruposTramos(tr);
      titulo2 = 'Tiempo de cada analista en los tramos que atendió';
      const cruza = tr.filter((t) => t.cruza_dia).length;
      if (cruza && C.cfg.modo_tiempo !== 'jornada') extra = `<div class="nota alerta">${cruza} de ${tr.length} tramos quedan de un día para el otro y en hora reloj cuentan la noche completa. Se puede cambiar a horas hábiles en Administración.</div>`;
    } else {
      const gl = solsMes(d, h).filter((s) => !s.reestructura).map((s) => C.global(s)).filter((g) => g && (!yo || g.analista === yo));
      grupos = agrupar(gl, (g) => g.analista, (g) => g).map((g) => ({ nombre: nombreAnalista(g.k), valores: g.valores, filas: g.valores.map((x) => filaTramo(x.tramo)) }));
      titulo2 = 'Tiempo de la solicitud: el del analista a quien le queda el caso';
    }
    const seg = `<div class="seg">${[['analista', 'Tramos por analista'], ['caso', 'Tiempo de la solicitud (caso)']].map(([k, t]) => `<button data-vista="${k}" class="${S.vista === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    return `${filtros({ extra: `<label>Vista${seg}</label><button class="btn sec" data-act="bajarTiempos">⬇ Descargar Excel</button>` })}
      <div class="card"><h3>${titulo2} · ${mesTxt(S.mes)}</h3>${notaTiempos()}${yo ? '' : cuadre(d, h)}${extra}${tablaTiempos(grupos, 'Analista', titulo2.split(':')[0])}</div>
      ${detalleSolicitud()}`;
  }

  // Excel con los tramos y las solicitudes del mes (con los filtros de la pantalla)
  async function bajarTiempos() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, yo = soloYo();
    const tr = [...DAC.tramosPeriodo(C, S.D, 'analisis', d, h, filtroDatos()), ...DAC.tramosPeriodo(C, S.D, 'reproceso', d, h, filtroDatos())]
      .filter((t) => !yo || t.analista === yo).sort((a, b) => a.solicitud - b.solicitud || a.n - b.n);
    const sols = solsMes(d, h).filter((s) => !yo || (C.tramosPorSol.get(s.solicitud) || []).some((t) => t.analista === yo));
    await excel(`Tiempos DAC ${mesTxt(S.mes)}`, {
      Solicitudes: sols.map((s) => { const g = C.global(s); return { Solicitud: s.solicitud, Producto: s.producto, 'Tipo de crédito': s.tipo_credito, Reestructura: s.reestructura ? 'Sí' : 'No',
        Creada: s.creada, 'Ingreso al DAC': s.ingreso_dac, 'Analista del caso': g ? g.analista : null, 'Tiempo de la solicitud (min)': g ? min2(g.segundos) : null,
        'Meta (min)': metas()[s.producto], 'En meta': g && g.segundos != null ? (g.segundos <= metas()[s.producto] * 60 ? 'Sí' : 'No') : null,
        'Última decisión': s.decision, 'Fecha decisión': s.fecha_decision, 'Creación a decisión (h)': s.segundos_total == null ? null : Math.round(s.segundos_total / 36) / 100,
        'Estado hoy': s.ultimo_estado || s.estado_actual, Promotor: s.promotor, Sucursal: s.sucursal }; }),
      Tramos: tr.map((t) => ({ ...xlsFila(filaTramo(t)), Tramo: t.n, ...Object.fromEntries(Object.entries(t.estados || {}).map(([e, v]) => [`${e} (min)`, min2(v[C.cfg.modo_tiempo === 'jornada' ? 1 : 0])])) })),
    });
  }

  function detalleSolicitud() {
    const id = Number(S.buscar);
    let cuerpo = '<p class="muted small">Escriba un número de solicitud para ver cada tramo y en qué estados se fue el tiempo.</p>';
    if (id) {
      const s = S.C.solPorId.get(id), tr = S.C.tramosPorSol.get(id) || [];
      const yo = soloYo();
      const fr = S.D.flujo_rapido.find((x) => x.solicitud === id);
      const fuera = S.D.fueraDeMes.find((x) => x.solicitud === id);
      if (fr && !yo) cuerpo = `<p>Es de <b>Flujo Rápido</b>: ${esc(fr.resolucion)} el ${fh(fr.fecha_resolucion)} y siguió sin pasar por un analista. Estado hoy: ${esc(fr.ultimo_estado || fr.estado_actual || '—')}.</p>`;
      else if (fuera && !yo) cuerpo = `<p class="muted">Se creó el ${fh(fuera.creada)} y entró al DAC el ${fh(fuera.ingreso_dac)}, en otro mes: no se cuenta como ingreso.</p>`;
      else if (!s || (yo && !tr.some((t) => t.analista === yo))) cuerpo = '<p class="muted">No está en el universo DAC cargado (no pasó por POR ASIGNAR A ANALISTA).</p>';
      else {
        const g = S.C.global(s);
        cuerpo = `<p class="small">${prodTag(s.producto)} · ${esc(s.tipo_credito || '')} · ${s.reestructura ? '<b>Reestructura</b> (no se mide tiempo) · ' : ''}Ingresó al DAC ${fh(s.ingreso_dac)} · Estado hoy: ${esc(s.ultimo_estado || s.estado_actual || '—')}<br>
          Tiempo de la solicitud: <b>${dur(g && g.segundos)}</b> (meta ${metas()[s.producto]} min) · le queda a <b>${esc(titulo(g && g.analista))}</b> · De la creación a la última decisión: ${dur(s.segundos_total)}</p>
          <div class="tabla"><table><thead><tr><th>#</th><th>Tipo</th><th>Analista</th><th>Inicio</th><th>Fin</th><th>Termina en</th><th class="num">Tiempo</th><th>Detalle por estado (reloj · jornada)</th></tr></thead><tbody>
          ${tr.map((t) => `<tr><td>${t.n}</td><td>${t.tipo === 'analisis' ? 'Análisis' : 'Preaprobado condicionado'}</td><td>${esc(titulo(t.analista))}</td><td>${fh(t.inicio)}</td><td>${fh(t.fin)}</td><td>${esc(t.fin_estado)}</td><td class="num"><b>${dur(S.C.segundosTramo(t))}</b></td>
            <td class="small">${Object.entries(t.estados || {}).map(([e, v]) => `${esc(e)}: ${dur(v[0])} · ${dur(v[1])}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
      }
    }
    return `<div class="card" id="detalleSol"><div class="cabeza"><h3>Detalle de una solicitud</h3>
      <form class="form" data-form="buscar" style="margin:0"><input name="q" placeholder="N.º de solicitud" value="${esc(S.buscar)}" inputmode="numeric"><button class="btn sec">Ver</button></form></div>${cuerpo}</div>`;
  }

  // Un caso de reprocesamiento por solicitud: suma del tiempo EN ANALISIS de todos sus tramos de preaprobado
  const filaReproceso = (r) => {
    const s = S.C.solPorId.get(r.solicitud) || {};
    return { solicitud: r.solicitud, producto: s.producto, tipo_credito: s.tipo_credito, tipo: `Preaprobado condicionado (${r.tramos.length} ${r.tramos.length === 1 ? 'tramo' : 'tramos'})`,
      analista: r.analista, inicio: r.inicio, fin: r.fin, fin_estado: r.fin_estado, segundos: r.s, estado_hoy: s.ultimo_estado || s.estado_actual };
  };
  function reproceso() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, yo = soloYo();
    const casos = DAC.reprocesos(C, S.D, d, h, filtroDatos()).filter((r) => !yo || r.analista === yo);
    const grupos = agrupar(casos, (r) => r.analista, (r) => r).map((g) => ({ nombre: nombreAnalista(g.k), valores: g.valores, filas: g.valores.map(filaReproceso) }));
    const ids = new Set(S.D.tramos.filter((t) => t.tipo === 'reproceso' && !t.fin).map((t) => t.solicitud));
    const abiertos = [...ids].filter((id) => C.solPorId.has(id)).map((id) => C.reprocesoDe(id)).filter((r) => r && (!yo || r.analista === yo));
    const porFin = new Map();
    for (const r of casos) porFin.set(r.fin_estado, [...(porFin.get(r.fin_estado) || []), r]);
    return `${filtros()}
      <div class="card"><h3>Reprocesamiento · Preaprobado condicionado · ${mesTxt(S.mes)}</h3>
        <p class="muted small">Un caso por solicitud: desde que queda en PREAPROBADO CONDICIONADO hasta la decisión (aprobado, rechazado o TUD). Solo cuenta el tiempo <b>EN ANALISIS</b>: mientras la solicitud está en preaprobado condicionado esperando al promotor, el tiempo se detiene; los preaprobados anteriores sí suman lo que estuvo en análisis.
          Todo el reprocesamiento queda a nombre de <b>${esc(titulo(S.D.config.analista_reproceso || '—'))}</b> (perfil Analista con reprocesamiento). La solicitud conserva el tiempo y el caso del analista que la dejó preaprobada.
          Tiempo en ${S.C.cfg.modo_tiempo === 'jornada' ? 'horas hábiles' : 'hora reloj'}; meta según el producto (${metaTxt()}). Se cuenta en el mes en que empezó el reprocesamiento.</p>
        ${abiertos.length ? `<div class="nota">${conLista(abiertos.length, 'Siguen en preaprobado condicionado', abiertos.map(filaReproceso))} solicitudes siguen en preaprobado condicionado; se medirán cuando haya una decisión.</div>` : ''}
        ${tablaTiempos(grupos, 'Analista', 'Preaprobado condicionado')}
        <p class="small" style="margin-top:10px"><b>¿Cómo terminan?</b> ${[...porFin].sort((a, b) => b[1].length - a[1].length).map(([e, l]) => `${esc(e)}: ${conLista(l.length, `Preaprobado condicionado que termina en ${esc(e)}`, l.map(filaReproceso))}`).join(' · ')}</p></div>`;
  }

  // ---------- Flujo Rápido y motor ----------
  // No cuenta en los tiempos ni en la productividad del DAC: es un bot. Meta del motor: resolver en 1 minuto.
  const CAMINO = { dac: 'Pasó al DAC', rapido: 'Flujo Rápido', otro: 'Se quedó en el motor' };
  const segs = (v) => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)} s`);
  const filaFlujo = (x) => ({ solicitud: x.solicitud, producto: x.producto, tipo_credito: x.tipo_credito, tipo: 'Flujo Rápido', inicio: x.creada,
    fin: x.fecha_resolucion, fin_estado: x.resolucion, segundos: x.seg_motor, metaSeg: 60, estado_hoy: x.ultimo_estado || x.estado_actual });
  function motor() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C;
    const deP = (x) => !S.producto || x.producto === S.producto;
    const MR = S.D.motor_resumen.filter((r) => r.fecha >= d && r.fecha <= h && deP(r));
    const fr = flujoEn(d, h).filter(deP);
    const lentas = S.D.motor_lentas.filter((x) => x.fecha_resolucion && x.fecha_resolucion.slice(0, 10) >= d && x.fecha_resolucion.slice(0, 10) <= h && deP(x));
    const suma = (l, k) => l.reduce((t, r) => t + Number(r[k] || 0), 0);
    const res = (l) => { const n = suma(l, 'n'); return { n, prom: n ? suma(l, 'seg_total') / n : null, max: l.length ? Math.max(...l.map((r) => Number(r.seg_max))) : null,
      b: ['b10', 'b20', 'b30', 'b60', 'bmas'].map((k) => suma(l, k)), dentro: n ? (n - suma(l, 'bmas')) / n : null }; };
    const T = res(MR);
    const filaM = (nom, l) => { const x = res(l); return `<tr><td>${nom}</td><td class="num">${n0(x.n)}</td>${x.b.map((v) => `<td class="num">${v ? n0(v) : '·'}</td>`).join('')}<td class="num">${segs(x.prom)}</td><td class="num">${segs(x.max)}</td><td class="num"><b>${pct(x.dentro)}</b></td></tr>`; };
    const cab = '<tr><th></th><th class="num">Resoluciones</th><th class="num">≤ 10 s</th><th class="num">10–20 s</th><th class="num">20–30 s</th><th class="num">30–60 s</th><th class="num">Más de 1 min</th><th class="num">Promedio</th><th class="num">Máximo</th><th class="num">≤ 1 min</th></tr>';
    const porDia = new Map();
    for (const r of MR) porDia.set(r.fecha, [...(porDia.get(r.fecha) || []), r]);
    const dias = [...DAC.dias(d, h > C.hoy ? C.hoy : h)].map((f) => { const x = res(porDia.get(f) || []);
      return { x: Number(f.slice(8)), y: x.prom || 0, tip: `${f.slice(8)}/${f.slice(5, 7)} · ${n0(x.n)} resoluciones<br>Promedio ${segs(x.prom)} · máximo ${segs(x.max)}<br>Más de 1 min: ${n0(x.b[4])}` }; });
    const porEstado = new Map();
    for (const x of fr) porEstado.set(x.ultimo_estado, [...(porEstado.get(x.ultimo_estado) || []), x]);
    const sinDatos = !S.D.motor_resumen.length;
    return `${filtros({ tipo: false })}
      ${sinDatos ? '<div class="card nota alerta">Los tiempos del motor se llenan con la próxima actualización, después de ejecutar <b>supabase/migracion_2026_10_23b.sql</b> en Supabase.</div>' : ''}
      <div class="kpis">
        <div class="kpi"><div class="l">Resoluciones del motor</div><div class="v">${n0(T.n)}</div><div class="s">aprobado o rechazado por motor · ${mesTxt(S.mes)}</div></div>
        <div class="kpi ${T.dentro == null || T.dentro >= 0.999 ? 'verde' : 'naranja'}"><div class="l">Dentro de 1 minuto</div><div class="v">${pct(T.dentro)}</div><div class="s">${n0(T.b[4])} tardaron más de 1 min</div></div>
        <div class="kpi cielo"><div class="l">Tiempo promedio</div><div class="v">${segs(T.prom)}</div><div class="s">de ENVIADO a la resolución · máximo ${segs(T.max)}</div></div>
        <div class="kpi blanco"><div class="l">Flujo Rápido</div><div class="v">${n0(fr.length)}</div><div class="s">resolución del motor que siguió sin pasar por un analista</div></div>
      </div>
      <div class="card"><h3>Tiempo promedio del motor por día</h3><p class="muted small" style="margin-top:-4px">Segundos de ENVIADO a APROBADO / RECHAZADO POR MOTOR. Meta: menos de 1 minuto. No cuenta en los tiempos ni en la productividad del DAC.</p>
        ${GRAF.columnas(dias, { fmt: (v) => `${(+v).toFixed(1)}`, color: 'var(--navy)' })}</div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Por camino</h3><div class="tabla"><table><thead>${cab}</thead><tbody>
          ${Object.entries(CAMINO).map(([k, t]) => filaM(t, MR.filter((r) => r.camino === k))).join('')}
          ${['APROBADO POR MOTOR', 'RECHAZADO POR MOTOR'].map((e) => filaM(titulo(e), MR.filter((r) => r.resolucion === e))).join('')}</tbody></table></div></div>
        <div class="card"><h3>Por producto</h3><div class="tabla"><table><thead>${cab}</thead><tbody>
          ${DAC.PRODUCTOS.map((p) => filaM(prodTag(p), MR.filter((r) => r.producto === p))).join('')}</tbody></table></div></div>
      </div>
      <div class="card"><h3>Resoluciones de más de 1 minuto</h3>
        ${lentas.length ? `<div class="tabla"><table><thead><tr><th>Solicitud</th><th>Producto</th><th>Resolución</th><th>Camino</th><th>Fecha</th><th class="num">Segundos</th></tr></thead><tbody>
          ${lentas.sort((a, b) => b.segundos - a.segundos).map((x) => `<tr><td>${x.solicitud}</td><td>${prodTag(x.producto)}</td><td>${esc(x.resolucion)}</td><td>${CAMINO[x.camino] || ''}</td><td>${fh(x.fecha_resolucion)}</td><td class="num"><b>${segs(Number(x.segundos))}</b></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="muted">Ninguna resolución del motor pasó de 1 minuto en el mes.</p>'}</div>
      <div class="card"><h3>Flujo Rápido · ${mesTxt(S.mes)}</h3>
        <p class="muted small">Solicitudes con APROBADO o RECHAZADO POR MOTOR que siguieron a otro estado sin pasar por POR ASIGNAR A ANALISTA (también si la jefatura las pasó a pre análisis). Clic en una cantidad para ver las solicitudes.</p>
        <p>${['APROBADO POR MOTOR', 'RECHAZADO POR MOTOR'].map((e) => { const l = fr.filter((x) => x.resolucion === e); return `${titulo(e)}: <b>${conLista(l.length, `Flujo Rápido · ${titulo(e)}`, l.map(filaFlujo))}</b>`; }).join(' · ')}
          · Total: <b>${conLista(fr.length, 'Flujo Rápido', fr.map(filaFlujo))}</b></p>
        <div class="tabla"><table><thead><tr><th>Estado hoy</th><th class="num">Solicitudes</th><th class="num">%</th></tr></thead><tbody>
          ${[...porEstado].sort((a, b) => b[1].length - a[1].length).map(([e, l]) => `<tr><td>${esc(e)}</td><td class="num">${conLista(l.length, `Flujo Rápido · ${esc(e)}`, l.map(filaFlujo))}</td><td class="num">${pct(l.length / fr.length)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  // ---------- Ciclo de la solicitud (gerente) ----------
  // De la creación hasta FORMALIZADO (de cara al cliente) o hasta que se rechaza, va a TUD, se anula, etc.
  // Cada estado es de un departamento (tabla del DAC); los estados sin departamento son de quien pasó la solicitud a ese estado.
  const AREA = { 'ANALISTA ASIGNADO': 'Analista', APROBADO: 'Supervisor DAC', 'APROBADO ASALARIADO': 'Comercial', 'APROBADO POR ANALISTA': 'Analista',
    'APROBADO POR MOTOR': 'Comercial (seguimiento tras el motor)', AUDITADO: 'Auditor', 'DEVUELTO GERENCIA': 'Comercial', 'EN ANALISIS': 'Analista', 'EN ESTUDIO': 'Comercial',
    ENVIADO: 'Comercial', FORMALIZADO: 'Comercial', PENDIENTES: 'Comercial', 'POR ASIGNAR A ANALISTA': 'Supervisor DAC', 'PRE ANALISIS': 'Comercial',
    'PREAPROBADO CONDICIONADO': 'Analista', RECHAZADO: 'Supervisor DAC', 'RECHAZADO POR ANALISTA': 'Analista', 'RECHAZADO POR ASESOR': 'Comercial',
    'RECHAZADO POR MOTOR': 'Comercial (seguimiento tras el motor)', 'RECHAZADO POR RECEPCION': 'Analista', 'RECHAZADO RESOLUCION': 'Gerente', 'RESOLUCION APROBADA': 'Gerente',
    REVISADO: 'Auditor', 'REVISION APROBADOR': 'Analista', 'VERIFICADOR MOTORIZADO': 'Motorizado' };
  const area = (e) => AREA[e] || (e.startsWith('EXPEDIENTE') ? 'Auditor' : 'Según quién la pasó a ese estado');
  function ciclo() {
    const { P, L } = periodoDash();
    const d = P.desde, h = P.hasta, esMes = S.dgran === 'mes', nomP = esMes ? mesTxt(S.mes) : P.nom;
    const med = S.cmed || (S.C.cfg.modo_tiempo === 'jornada' ? 'jornada' : 'reloj'), k = med === 'jornada' ? 1 : 0;
    const enP = (f) => f && f.slice(0, 10) >= d && f.slice(0, 10) <= h;
    const base = [...S.D.solicitudes.map((s) => ({ c: 'dac', s })), ...S.D.fueraDeMes.map((s) => ({ c: 'dac', s })), ...S.D.flujo_rapido.map((s) => ({ c: 'rapido', s }))]
      .filter((x) => x.s.ciclo && enP(x.s.creada) && (S.camino === 'todas' || x.c === S.camino) && (!S.producto || x.s.producto === S.producto)
        && (S.cfin === 'todas' || (S.cfin === 'final') === !!x.s.ciclo.final));
    const it = base.map((x) => {
      let tot = 0, dac = 0, com = 0;
      for (const [key, v] of Object.entries(x.s.ciclo.est || {})) { const t = v[k]; tot += t; if (key.endsWith('|DAC')) dac += t; else com += t; }
      return { ...x, tot, dac, com };
    });
    const sinDatos = ![...S.D.solicitudes, ...S.D.flujo_rapido].some((s) => s.ciclo);
    const resumen = (l) => { const v = l.map((x) => x.tot).sort((a, b) => a - b), n = v.length, sd = l.reduce((t, x) => t + x.dac, 0), sc = l.reduce((t, x) => t + x.com, 0);
      return { n, med: n ? v[Math.floor((n - 1) / 2)] : null, prom: n ? (sd + sc) / n : null, dac: n ? sd / n : null, com: n ? sc / n : null, pdac: sd + sc ? sd / (sd + sc) : null }; };
    const fila = (x) => ({ solicitud: x.s.solicitud, producto: x.s.producto, tipo_credito: x.s.tipo_credito, tipo: x.c === 'dac' ? 'DAC' : 'Flujo Rápido', inicio: x.s.creada,
      fin: x.s.ciclo.t_fin, fin_estado: x.s.ciclo.final ? x.s.ciclo.fin : `${x.s.ciclo.fin} (en proceso)`, segundos: x.tot, dac: x.dac, com: x.com, metaSeg: null,
      estado_hoy: x.s.ultimo_estado || x.s.estado_actual });
    const R = resumen(it);
    // Por semana (mes) o por mes: reparto del tiempo entre DAC y Comercial
    const diasP = [...DAC.dias(d, h)];
    const claves = esMes ? [...new Set(diasP.map((f) => `W${DAC.semanaMes(f)}`))] : mesesEntre(d, h);
    const grupoDe = (x) => (esMes ? `W${DAC.semanaMes(x.s.creada)}` : x.s.creada.slice(0, 7));
    const tipC = (nom, r) => `<b>${nom}</b><br>${n0(r.n)} solicitudes<br>Promedio: ${dur(r.prom)}<br>DAC: ${dur(r.dac)} · Comercial: ${dur(r.com)}`;
    const graf = claves.map((g) => { const l = it.filter((x) => grupoDe(x) === g), r = resumen(l);
      return { x: esMes ? g : MES3[Number(g.slice(5)) - 1], partes: [r.dac || 0, r.com || 0], tip: tipC(esMes ? g : mesTxt(g), r), clic: esMes ? null : `mes:${g}` }; });
    graf.push({ x: 'Total', total: true, partes: [R.dac || 0, R.com || 0], tip: tipC(`Total ${nomP}`, R) });
    const filaR = (nom, l) => { const r = resumen(l); return `<tr><td>${nom}</td><td class="num">${conLista(r.n, `Ciclo · ${nom.replace(/<[^>]+>/g, '')}`, l.map(fila))}</td><td class="num">${dur(r.med)}</td><td class="num">${dur(r.prom)}</td>
      <td class="num">${dur(r.dac)}</td><td class="num">${dur(r.com)}</td><td class="num"><b>${pct(r.pdac)}</b></td><td class="num">${r.pdac == null ? '—' : pct(1 - r.pdac)}</td></tr>`; };
    const cabR = '<tr><th></th><th class="num">Solicitudes</th><th class="num">Mediana</th><th class="num">Promedio</th><th class="num">Promedio DAC</th><th class="num">Promedio Comercial</th><th class="num">% DAC</th><th class="num">% Comercial</th></tr>';
    // Por estado
    const est = new Map();
    for (const x of it) for (const [key, v] of Object.entries(x.s.ciclo.est || {})) {
      const e = est.get(key) || { t: 0, l: [] };
      e.t += v[k]; e.l.push(x); est.set(key, e);
    }
    const totalT = [...est.values()].reduce((a, e) => a + e.t, 0);
    const seg = (clave, ops) => `<div class="seg">${ops.map(([v, t]) => `<button data-set="${clave}:${v}" class="${S[clave] === v || (clave === 'cmed' && med === v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const segP = `<div class="seg">${[['mes', 'Mensual'], ['trimestre', 'Trimestral'], ['semestre', 'Semestral'], ['anio', 'Anual']].map(([g, t]) => `<button data-dgran="${g}" class="${S.dgran === g ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const selP = `<select data-f="dper">${L.map((x) => `<option value="${x.desde}" ${x.desde === P.desde ? 'selected' : ''}>${S.dgran === 'mes' ? mesTxt(x.desde.slice(0, 7)) : x.nom}</option>`).join('')}</select>`;
    return `
      <div class="filtros"><label>Período${segP}</label><label>&nbsp;${selP}</label>
        <label>Producto<select data-f="producto"><option value="">Todos</option>${DAC.PRODUCTOS.map((p) => `<option ${p === S.producto ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Camino${seg('camino', [['todas', 'Todas'], ['dac', 'DAC'], ['rapido', 'Flujo Rápido']])}</label>
        <label>Solicitudes${seg('cfin', [['final', 'Finalizadas'], ['proceso', 'En proceso'], ['todas', 'Todas']])}</label>
        <label>Medida${seg('cmed', [['jornada', 'Horas hábiles'], ['reloj', 'Hora reloj']])}</label>
        <button class="btn sec" data-act="bajarCiclo">⬇ Descargar Excel</button></div>
      ${sinDatos ? '<div class="card nota alerta">El ciclo de cada solicitud se llena con la próxima actualización, después de ejecutar <b>supabase/migracion_2026_10_23b.sql</b> en Supabase.</div>' : ''}
      <div class="card"><h3>Ciclo de la solicitud · ${nomP}</h3>
        <p class="muted small">De la creación de la solicitud hasta que se <b>formaliza</b> (de cara al cliente; lo posterior, como revisado, expedientes y auditado, no cuenta) o hasta que se rechaza, va a TUD o se anula. Las <i>en proceso</i> se miden hasta la última actualización.
          El tiempo de cada estado es del departamento responsable; los estados sin departamento fijo (TUD, anulado, aprobado informa, creación de nuevo ID, vencido) son de quien pasó la solicitud a ese estado. Solicitudes del DAC y del Flujo Rápido, por fecha de creación. Medido en ${med === 'jornada' ? 'horas hábiles' : 'hora reloj'}.</p>
        <div class="kpis">
          <div class="kpi"><div class="l">Solicitudes</div><div class="v">${conLista(R.n, 'Ciclo de la solicitud', it.map(fila))}</div><div class="s">${S.cfin === 'final' ? 'finalizadas' : S.cfin === 'proceso' ? 'en proceso' : 'finalizadas y en proceso'}</div></div>
          <div class="kpi cielo"><div class="l">Duración mediana</div><div class="v">${dur(R.med)}</div><div class="s">promedio ${dur(R.prom)}</div></div>
          <div class="kpi verde"><div class="l">DAC</div><div class="v">${pct(R.pdac)}</div><div class="s">del tiempo · promedio ${dur(R.dac)} por solicitud</div></div>
          <div class="kpi naranja"><div class="l">Comercial</div><div class="v">${R.pdac == null ? '—' : pct(1 - R.pdac)}</div><div class="s">del tiempo · promedio ${dur(R.com)} por solicitud</div></div>
        </div>
        ${GRAF.apiladas(graf, [{ nombre: 'DAC', color: 'var(--navy)' }, { nombre: 'Comercial', color: 'var(--naranja)' }])}</div>
      <div class="card"><h3>Por producto y camino</h3><div class="tabla"><table><thead>${cabR}</thead><tbody>
        ${DAC.PRODUCTOS.map((p) => filaR(prodTag(p), it.filter((x) => x.s.producto === p))).join('')}
        ${[['dac', 'Pasó por el DAC'], ['rapido', 'Flujo Rápido']].map(([c, t]) => filaR(t, it.filter((x) => x.c === c))).join('')}
        <tr class="total"><td>Total</td><td class="num">${n0(R.n)}</td><td class="num">${dur(R.med)}</td><td class="num">${dur(R.prom)}</td><td class="num">${dur(R.dac)}</td><td class="num">${dur(R.com)}</td><td class="num">${pct(R.pdac)}</td><td class="num">${R.pdac == null ? '—' : pct(1 - R.pdac)}</td></tr></tbody></table></div></div>
      <div class="card"><h3>¿En qué estados se va el tiempo?</h3>
        <div class="tabla"><table><thead><tr><th>Estado</th><th>Departamento</th><th>Quién</th><th class="num">Solicitudes que pasaron</th><th class="num">Tiempo promedio en el estado</th><th class="num">% del tiempo total</th></tr></thead><tbody>
        ${[...est].sort((a, b) => b[1].t - a[1].t).map(([key, e]) => { const [es, dp] = key.split('|'); return `<tr><td>${esc(es)}</td><td>${dp === 'DAC' ? 'DAC' : 'Comercial'}</td><td class="small">${area(es)}</td>
          <td class="num">${conLista(e.l.length, `Pasaron por ${es} (${dp})`, e.l.map(fila))}</td><td class="num">${dur(e.t / e.l.length)}</td><td class="num"><b>${pct(totalT ? e.t / totalT : null)}</b></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Sin datos</td></tr>'}
        </tbody></table></div></div>`;
  }
  async function bajarCiclo() {
    const k = (S.cmed || (S.C.cfg.modo_tiempo === 'jornada' ? 'jornada' : 'reloj')) === 'jornada' ? 1 : 0;
    const { P } = periodoDash();
    const enP = (f) => f && f.slice(0, 10) >= P.desde && f.slice(0, 10) <= P.hasta;
    const filas = [...S.D.solicitudes.map((s) => ['DAC', s]), ...S.D.fueraDeMes.map((s) => ['DAC', s]), ...S.D.flujo_rapido.map((s) => ['Flujo Rápido', s])]
      .filter(([, s]) => s.ciclo && enP(s.creada)).map(([c, s]) => {
        const o = { Solicitud: s.solicitud, Camino: c, Producto: s.producto, 'Tipo de crédito': s.tipo_credito, Creada: s.creada, Fin: s.ciclo.t_fin,
          'Último estado del ciclo': s.ciclo.fin, Finalizada: s.ciclo.final ? 'Sí' : 'No', 'Total (h)': 0, 'DAC (h)': 0, 'Comercial (h)': 0 };
        for (const [key, v] of Object.entries(s.ciclo.est || {})) {
          const hrs = v[k] / 3600;
          o['Total (h)'] += hrs; o[key.endsWith('|DAC') ? 'DAC (h)' : 'Comercial (h)'] += hrs;
          o[`${key.replace('|', ' · ')} (h)`] = Math.round(hrs * 100) / 100;
        }
        for (const c2 of ['Total (h)', 'DAC (h)', 'Comercial (h)']) o[c2] = Math.round(o[c2] * 100) / 100;
        return o;
      });
    await excel(`Ciclo de la solicitud ${P.nom}`, { Solicitudes: filas });
  }

  // ---------- Productividad ----------
  function productividad() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, M = DAC.metricas(C, S.D, d, h, filtroDatos()), yo = soloYo();
    const filas = M.porAnalista.filter((a) => !yo || a.nombre === yo).sort((a, b) => (b.prod || 0) - (a.prod || 0));
    const ausentes = (nom) => (S.D.ausencias || []).filter((a) => a.analista === nom && a.hasta >= d && a.desde <= h).length;

    return `${filtros()}
      <div class="card"><h3>Productividad por analista · ${mesTxt(S.mes)}</h3>
        <p class="muted small">${notaHoy(M)} Cada solicitud cuenta para cada analista que intervino en ella (aunque sea de otro producto). Días disponibles = días hábiles − vacaciones/permisos + eventos especiales asignados.</p>
        <div class="tabla"><table><thead><tr><th>Analista</th><th>Producto</th><th class="num">Solicitudes</th><th class="num">De su producto</th><th class="num">De otros productos</th><th class="num">Con reproceso</th><th class="num">Días disponibles</th><th class="num">Productividad</th></tr></thead><tbody>
        ${filas.map((a) => `<tr><td>${esc(titulo(a.nombre))}</td><td>${prodTag(a.producto)}</td><td class="num">${n0(a.n)}</td><td class="num">${n0(a.propio)}</td><td class="num">${n0(a.otros)}</td><td class="num">${n0(a.reproceso)}</td>
          <td class="num">${n2(a.disp)}${ausentes(a.nombre) ? ' <span class="muted small" data-tip="Tiene vacaciones o permisos en el mes">✱</span>' : ''}</td><td class="num"><b>${n2(a.prod)}</b></td></tr>`).join('')}
        ${yo ? '' : `<tr class="total"><td>Departamento</td><td></td><td class="num">${n0(M.depto.n)}</td><td colspan="3" class="muted small">solicitudes únicas (una solicitud con varios analistas cuenta una vez)</td><td class="num">${n2(M.depto.disp)}</td><td class="num">${n2(M.depto.prod)}</td></tr>`}
        </tbody></table></div>
        ${!yo && M.sinConfigurar.length ? `<div class="nota alerta">Intervinieron usuarios que no son analistas: ${M.sinConfigurar.map((x) => `${esc(titulo(x.nombre))} (${x.n})`).join(', ')}. Sus solicitudes y tiempos sí cuentan para el departamento, pero no tienen productividad propia ni suman al número de analistas.</div>` : ''}
      </div>
      <div class="card"><h3>Comparativo</h3>${GRAF.barras(filas.map((a) => ({ nombre: titulo(a.nombre), y: a.prod, color: COLOR[a.producto] })), { fmt: n2 })}</div>`;
  }

  // ---------- Departamento (global) ----------
  function global() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, M = DAC.metricas(C, S.D, d, h, { tipo: S.tipo });
    const tiempoProd = (p) => DAC.resumenTiempos(casosDe(C, M.sols.filter((s) => !p || s.producto === p)), metas());
    const fila = (nom, x, R, peso, cls = '', meta = 'según producto') => `<tr class="${cls}"><td>${nom}</td><td class="num">${n0(x.n)}</td><td class="num">${pct(peso)}</td><td class="num">${n2(M.depto.diasHabiles)}</td><td class="num">${n2(x.porDia)}</td>
      <td class="num">${x.analistas}</td><td class="num">${n2(x.equiv)}</td><td class="num"><b>${n2(x.prod)}</b></td><td class="num">${dur(R.mediana)}</td><td class="num">${meta}</td><td class="num">${pct(R.enMeta)}</td></tr>`;
    return `${filtros({ producto: false })}
      <div class="card"><h3>Departamento de Análisis · ${mesTxt(S.mes)}</h3>
        <p class="muted small">${notaHoy(M)}</p>
        <div class="nota">Productividad del producto = solicitudes del producto que pasaron por POR ASIGNAR A ANALISTA ÷ días hábiles ÷ analistas del producto
          (contados por su disponibilidad: si alguien tuvo vacaciones, cuenta solo por los días que estuvo).
          Productividad del departamento = promedio de la productividad de cada producto, ponderado por su peso en solicitudes.</div>
        <div class="tabla"><table><thead><tr><th>Producto</th><th class="num">Solicitudes</th><th class="num">Peso</th><th class="num">Días hábiles</th><th class="num">Solicitudes por día</th><th class="num">Analistas</th><th class="num">Analistas disponibles</th><th class="num">Productividad</th><th class="num">Tiempo mediano</th><th class="num">Meta</th><th class="num">En meta</th></tr></thead><tbody>
        ${DAC.PRODUCTOS.map((p) => fila(prodTag(p), M.porProducto[p], tiempoProd(p), M.depto.peso[p], '', `≤ ${metas()[p]} min`)).join('')}
        ${fila('Departamento', M.depto, tiempoProd(null), 1, 'total')}</tbody></table></div>
        <p class="muted small">Incluye ${n0(M.depto.reestructuras)} reestructuras (cuentan para productividad; no para tiempos).</p></div>
      <div class="card"><h3>Distribución del tiempo de la solicitud por producto</h3>${notaTiempos()}
        ${tablaTiempos(DAC.PRODUCTOS.map((p) => { const cs = casosDe(C, M.sols.filter((s) => s.producto === p)); return { nombre: prodTag(p), valores: cs, filas: cs.map((g) => filaTramo(g.tramo)) }; }), 'Producto', 'Tiempo de la solicitud')}</div>`;
  }

  // ---------- Acumulado ----------
  function periodos(gran, anio) {
    const hoy = DAC.iso(new Date());
    const defs = { mes: [12, 1], trimestre: [4, 3], semestre: [2, 6], anio: [1, 12] }[gran];
    const out = [];
    for (let i = 0; i < defs[0]; i++) {
      const m0 = i * defs[1] + 1, m1 = m0 + defs[1] - 1;
      const desde = `${anio}-${String(m0).padStart(2, '0')}-01`, hasta = rangoMes(`${anio}-${String(m1).padStart(2, '0')}`)[1];
      if (hasta < INICIO + '-01' || desde > hoy) continue;
      const nom = { mes: MESES[m0 - 1].slice(0, 3), trimestre: `T${i + 1}`, semestre: `S${i + 1}`, anio: String(anio) }[gran];
      out.push({ nom: `${nom}${gran === 'anio' ? '' : ' ' + anio}`, desde: desde < INICIO + '-01' ? INICIO + '-01' : desde, hasta });
    }
    return out;
  }
  function acumulado() {
    const C = S.C, yo = soloYo();
    const anios = [...new Set([Number(INICIO.slice(0, 4)), new Date().getFullYear()])];
    for (let y = anios[0]; y <= new Date().getFullYear(); y++) if (!anios.includes(y)) anios.push(y);
    const P = periodos(S.gran, S.anio);
    const filas = P.map((p) => {
      const M = DAC.metricas(C, S.D, p.desde, p.hasta, filtroDatos());
      const cs = casosDe(C, M.sols);
      const T = DAC.resumenTiempos(cs, metas());
      const TP = Object.fromEntries(DAC.PRODUCTOS.map((x) => [x, DAC.resumenTiempos(cs.filter((c) => c.p === x), metas())]));
      return { ...p, M, T, TP };
    });
    const seg = `<div class="seg">${[['mes', 'Mensual'], ['trimestre', 'Trimestral'], ['semestre', 'Semestral'], ['anio', 'Anual']].map(([k, t]) => `<button data-gran="${k}" class="${S.gran === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const selAnio = `<label>Año<select data-f="anio">${anios.sort().map((y) => `<option ${y === S.anio ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;
    const cabeza = `<div class="filtros"><label>Agrupar${seg}</label>${selAnio}
      <label>Producto<select data-f="producto"><option value="">Todos</option>${DAC.PRODUCTOS.map((p) => `<option ${p === S.producto ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>`;
    if (!filas.length) return cabeza + '<div class="card vacio">La información está disponible desde enero 2026.</div>';
    const serie = (nom, color, f) => ({ nombre: nom, color, puntos: filas.map((r) => ({ x: r.nom, y: f(r) })) });
    const an = C.analistas.filter((a) => !yo || a.nombre === yo);
    const prodA = filas.map((r) => new Map(r.M.porAnalista.map((a) => [a.nombre, a])));
    // Total del año (o de lo que va del año) para cada analista
    const MT = filas.length > 1 ? DAC.metricas(C, S.D, filas[0].desde, filas[filas.length - 1].hasta, filtroDatos()) : null;
    const totA = MT ? new Map(MT.porAnalista.map((a) => [a.nombre, a])) : null;
    return `${cabeza}
      <div class="card"><h3>Productividad acumulada</h3>
        ${yo ? GRAF.lineas([serie('Mi productividad', 'var(--s-pers)', (r) => r.M.porAnalista.find((a) => a.nombre === yo)?.prod ?? null), serie('Departamento', 'var(--s-pymes)', (r) => r.M.depto.prod)], { fmt: n2 })
          : GRAF.lineas(S.producto ? [serie(S.producto, COLOR[S.producto], (r) => r.M.porProducto[S.producto].prod)]
            : [serie('Departamento', 'var(--navy)', (r) => r.M.depto.prod), ...DAC.PRODUCTOS.map((p) => serie(p, COLOR[p], (r) => r.M.porProducto[p].prod))], { fmt: n2 })}
        <div class="tabla" style="margin-top:10px"><table><thead><tr><th>Período</th><th class="num">Solicitudes</th><th class="num">Días hábiles</th><th class="num">Analistas disp.</th><th class="num">Productividad</th>
          ${DAC.PRODUCTOS.map((p) => `<th class="num">${p}</th><th class="num" data-tip="Solicitudes ${p} dentro de su meta">≤ ${metas()[p]} min</th>`).join('')}<th class="num">Tiempo mediano</th><th class="num">En meta</th></tr></thead><tbody>
          ${filas.map((r) => `<tr><td>${r.nom}</td><td class="num">${n0(r.M.depto.n)}</td><td class="num">${n2(r.M.depto.diasHabiles)}</td><td class="num">${n2(r.M.depto.equiv)}</td><td class="num"><b>${n2(r.M.depto.prod)}</b></td>
            ${DAC.PRODUCTOS.map((p) => `<td class="num">${n2(r.M.porProducto[p].prod)}</td><td class="num" data-tip="${n0(r.TP[p].n)} solicitudes con tiempo medido">${pct(r.TP[p].enMeta)}</td>`).join('')}<td class="num">${dur(r.T.mediana)}</td><td class="num">${pct(r.T.enMeta)}</td></tr>`).join('')}
          </tbody></table></div></div>
      <div class="card"><h3>Productividad por analista</h3><div class="tabla"><table><thead><tr><th>Analista</th>${filas.map((r) => `<th class="num">${r.nom}</th>`).join('')}${MT ? `<th class="num">Total ${S.anio}</th>` : ''}</tr></thead><tbody>
        ${an.map((a) => `<tr><td>${esc(titulo(a.nombre))} <span class="muted small">${a.producto}</span></td>${[...prodA, ...(totA ? [totA] : [])].map((m, i) => { const x = m.get(a.nombre); const b = i === prodA.length; return `<td class="num" data-tip="${x ? `${x.n} solicitudes / ${n2(x.disp)} días` : ''}">${b ? '<b>' : ''}${n2(x && x.prod)}${b ? '</b>' : ''}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  }

  // ---------- Cartera actual ----------
  // Lo que tiene cada analista y lo que está en cola, según la última actualización
  const POR_ASIGNAR = 'POR ASIGNAR A ANALISTA';
  const horasDesde = (f) => (f ? (Date.now() - new Date(f)) / 3600000 : null);
  const espera = (f) => { const x = horasDesde(f); return x == null ? '—' : x < 1 ? `${Math.round(x * 60)} min` : x < 48 ? `${n2(x)} h` : `${n2(x / 24)} días`; };
  function cartera() {
    const C = S.C, yo = soloYo();
    const ult = S.D.config.ultima_actualizacion;
    if (!S.D.solicitudes.some((s) => s.ultimo_estado)) return `<div class="card nota alerta">La cartera actual necesita el estado en que está hoy cada solicitud. Se llena en la próxima actualización, después de ejecutar <b>supabase/migracion_2026_10_23.sql</b> en Supabase.</div>`;
    // Último tramo abierto de cada solicitud: a quién le está quedando
    const abiertos = new Map();
    for (const t of S.D.tramos) {
      if (t.fin || !C.solPorId.has(t.solicitud)) continue;
      const a = abiertos.get(t.solicitud);
      if (!a || t.n > a.n) abiertos.set(t.solicitud, t);
    }
    const fila = (s, t) => ({ solicitud: s.solicitud, producto: s.producto, tipo_credito: s.tipo_credito, tipo: t ? (t.tipo === 'analisis' ? 'Análisis' : 'Preaprobado condicionado') : 'En cola',
      analista: t && t.analista, inicio: t ? t.inicio : s.ingreso_dac, fin_estado: '', estado_hoy: `${s.ultimo_estado} desde ${fh(s.ultimo_cambio)} (${espera(s.ultimo_cambio)})` });
    const cola = S.D.solicitudes.filter((s) => s.ultimo_estado === POR_ASIGNAR).sort((a, b) => String(a.ultimo_cambio).localeCompare(String(b.ultimo_cambio)));
    const porAn = new Map();
    for (const [id, t] of abiertos) {
      const s = C.solPorId.get(id);
      if (s.ultimo_estado === POR_ASIGNAR) continue;
      const k = t.analista || (t.tipo === 'reproceso' ? 'PREAPROBADO CONDICIONADO · ESPERANDO AL PROMOTOR' : '(SIN ANALISTA)');
      if (yo && k !== yo) continue;
      if (!porAn.has(k)) porAn.set(k, []);
      porAn.get(k).push({ s, t });
    }
    const COLS = ['ANALISTA ASIGNADO', 'EN ANALISIS', 'PENDIENTES', 'PREAPROBADO CONDICIONADO'];
    const filasAn = [...porAn].sort((a, b) => b[1].length - a[1].length);
    const celda = (nom, l, est) => { const x = est === null ? l : est === '' ? l.filter((o) => !COLS.includes(o.s.ultimo_estado)) : l.filter((o) => o.s.ultimo_estado === est);
      return `<td class="num">${x.length ? conLista(x.length, `${titulo(nom)}${est ? ` · ${est}` : ''}`, x.map((o) => fila(o.s, o.t))) : '·'}</td>`; };
    const todos = filasAn.flatMap(([, l]) => l);
    return `
      <div class="cabeza"><div><h2>Cartera actual</h2><div class="muted small">Según la última actualización: <b>${fh(ult)}</b>. Para ver el estado de este momento, pulse Actualizar y espere a que termine.</div></div>
        <div><button class="btn" data-act="actualizar">⟳ Actualizar</button><div class="estado-act muted" id="estadoAct"></div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">En cola</div><div class="v">${n0(cola.length)}</div><div class="s">POR ASIGNAR A ANALISTA${cola.length ? ` · la más antigua espera ${espera(cola[0].ultimo_cambio)}` : ''}</div></div>
        <div class="kpi verde"><div class="l">Con analista</div><div class="v">${n0(todos.filter((o) => o.t.analista).length)}</div><div class="s">asignadas, en análisis o en pendientes</div></div>
        <div class="kpi naranja"><div class="l">Preaprobado condicionado</div><div class="v">${n0(todos.filter((o) => o.s.ultimo_estado === 'PREAPROBADO CONDICIONADO').length)}</div><div class="s">esperando al promotor o en reproceso</div></div>
      </div>
      <div class="card"><h3>Solicitudes que tiene cada analista</h3>
        <p class="muted small">Solicitudes del DAC que el analista tiene abiertas (asignada y todavía sin decisión), con el estado en que están hoy. Clic en una cantidad para ver las solicitudes. Las de meses anteriores ya se cerraron al corte de su mes y no aparecen.</p>
        <div class="tabla"><table><thead><tr><th>Analista</th><th class="num">Total</th>${COLS.map((c) => `<th class="num">${titulo(c)}</th>`).join('')}<th class="num">Otros estados</th></tr></thead><tbody>
        ${filasAn.map(([k, l]) => `<tr><td>${S.C.esAnalista.has(k) ? nombreAnalista(k) : esc(titulo(k))}</td>${celda(k, l, null)}${COLS.map((c) => celda(k, l, c)).join('')}${celda(k, l, '')}</tr>`).join('') || '<tr><td colspan="7" class="muted">Ninguna solicitud abierta</td></tr>'}
        ${filasAn.length > 1 ? `<tr class="total"><td>Total</td>${celda('Total', todos, null)}${COLS.map((c) => celda('Total', todos, c)).join('')}${celda('Total', todos, '')}</tr>` : ''}</tbody></table></div></div>
      <div class="card"><h3>En cola · POR ASIGNAR A ANALISTA</h3>
        <div class="tabla"><table><thead><tr><th>Solicitud</th><th>Producto</th><th>Tipo de crédito</th><th>Ingresó al DAC</th><th>En cola desde</th><th class="num">Esperando</th><th>Promotor</th><th>Sucursal</th></tr></thead><tbody>
        ${cola.map((s) => `<tr><td><button class="lnk" data-ver="${s.solicitud}">${s.solicitud}</button></td><td>${prodTag(s.producto)}</td><td>${esc(s.tipo_credito || '')}</td><td>${fh(s.ingreso_dac)}</td><td>${fh(s.ultimo_cambio)}</td>
          <td class="num"><b>${espera(s.ultimo_cambio)}</b></td><td class="small">${esc(titulo(s.promotor || ''))}</td><td class="small">${esc(s.sucursal || '')}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No hay solicitudes en cola</td></tr>'}</tbody></table></div></div>`;
  }

  // ---------- Capacidad instalada ----------
  const COLOCADO = (e) => ['AUDITADO', 'APROBADO INFORMA', 'REVISADO', 'FORMALIZADO'].includes(e) || e.startsWith('EXPEDIENTE');
  const BASES = { mes: ['Mes anterior', 1], trimestre: ['Trimestre anterior (3 meses)', 3], semestre: ['Semestre anterior (6 meses)', 6] };
  function capInicial() {
    const g = S.D.config.capacidad || {};
    const hoy = new Date();
    return { mes: g.mes || DAC.iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)).slice(0, 7), presupuesto: g.presupuesto ?? '',
      pct: g.pct || {}, base: g.base || 'trimestre', util: g.util ?? 100 };
  }
  function calcCapacidad(cap) {
    const C = S.C;
    const [y, m] = cap.mes.split('-').map(Number), nb = BASES[cap.base][1];
    const base = Array.from({ length: nb }, (_, i) => DAC.iso(new Date(y, m - 1 - nb + i, 1)).slice(0, 7));
    const bd = `${base[0]}-01`, bh = rangoMes(base[base.length - 1])[1];
    const M = DAC.metricas(C, S.D, bd, bh);
    const BR = S.D.bitacora_resumen.filter((r) => base.includes(r.periodo));
    const [td, th] = rangoMes(cap.mes);
    const dhT = C.diasHabilesTotales(td, th);
    let horasT = 0, horasB = 0;
    for (const f of DAC.dias(td, th)) horasT += C.horasDia(f);
    for (const f of DAC.dias(bd, bh)) horasB += C.horasDia(f);
    const hDiaB = horasB / (C.diasHabilesTotales(bd, bh) || 1);
    const util = Number(cap.util || 100) / 100;
    const suma = (l, f = (r) => r.n) => l.reduce((t, r) => t + Number(f(r)), 0);
    const montoTot = suma(BR.filter((r) => COLOCADO(r.estado)), (r) => r.monto_aprobado);
    const prods = DAC.PRODUCTOS.map((p) => {
      const rows = BR.filter((r) => r.producto === p), col = rows.filter((r) => COLOCADO(r.estado));
      const nCol = suma(col), montoCol = suma(col, (r) => r.monto_aprobado);
      const sols = M.sols.filter((s) => s.producto === p);
      // Tiempo por solicitud: el del caso más el preaprobado condicionado (no los reprocesos entre analistas)
      const t = sols.filter((s) => !s.reestructura).map((s) => { const g = C.global(s); if (!g || g.segundos == null) return null;
        return g.segundos + (C.tramosPorSol.get(s.solicitud) || []).filter((x) => x.tipo === 'reproceso').reduce((a, x) => a + (C.segundosTramo(x) || 0), 0); }).filter((x) => x != null);
      const tReal = t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
      const x = M.porProducto[p];
      const r = { p, ingresaron: suma(rows), nCol, montoCol, ticket: nCol ? montoCol / nCol : null,
        colDac: suma(col.filter((r0) => r0.camino === 'dac')), colRapido: suma(col.filter((r0) => r0.camino === 'rapido')),
        tud: suma(rows.filter((r0) => r0.estado.startsWith('TUD'))), rech: suma(rows.filter((r0) => r0.estado.startsWith('RECHAZADO') && r0.estado !== 'RECHAZADO POR MOTOR')),
        rechMotor: suma(rows.filter((r0) => r0.estado === 'RECHAZADO POR MOTOR')), dacN: x.n, tReal, prodHist: x.prod,
        usoReal: tReal != null && x.disp ? (x.n * tReal) / (x.disp * hDiaB * 3600) : null,
        pctHist: montoTot ? montoCol / montoTot : null, actuales: x.analistas, meta: metas()[p] };
      r.porColocado = nCol ? r.dacN / nCol : null;
      const pctP = cap.pct[p] === '' || cap.pct[p] == null ? r.pctHist : Number(cap.pct[p]) / 100;
      r.pct = pctP;
      r.montoMeta = cap.presupuesto !== '' && pctP != null ? Number(cap.presupuesto) * pctP : null;
      r.creditos = r.montoMeta != null && r.ticket ? r.montoMeta / r.ticket : null;
      r.solic = r.creditos != null && r.porColocado != null ? r.creditos * r.porColocado : null;
      r.porDia = r.solic != null && dhT ? r.solic / dhT : null;
      r.aProd = r.porDia != null && r.prodHist ? r.porDia / r.prodHist : null;
      r.aReal = r.solic != null && r.tReal != null && horasT ? (r.solic * r.tReal) / (horasT * 3600 * util) : null;
      r.aMeta = r.solic != null && horasT ? (r.solic * r.meta * 60) / (horasT * 3600 * util) : null;
      return r;
    });
    return { base, bd, bh, M, BR, dhT, horasT, prods };
  }
  function capacidad() {
    if (!S.cap) S.cap = capInicial();
    const cap = S.cap, K = calcCapacidad(cap);
    const tot = (k) => K.prods.reduce((t, r) => (r[k] == null ? t : t + r[k]), 0);
    const algun = (k) => K.prods.some((r) => r[k] != null);
    const sumaPct = DAC.PRODUCTOS.reduce((t, p) => t + Number(cap.pct[p] || 0), 0);
    const dif = (r) => { if (r.aProd == null) return '—'; const v = r.aProd - r.actuales; return Math.abs(v) < 0.05 ? 'justo' : v > 0 ? `<span style="color:var(--rojo)">faltan ${n2(v)}</span>` : `<span style="color:var(--verde-osc)">sobran ${n2(-v)}</span>`; };
    const sinBit = !K.BR.length;
    const baseTxt = K.base.map(mesTxt).join(', ');
    const fila = (r, nom, cls = '') => `<tr class="${cls}"><td>${nom}</td><td class="num">${n0(r.ingresaron)}</td><td class="num">${n0(r.nCol)}</td><td class="num">${n0(r.colRapido)}</td><td class="num">${n2(r.ticket)}</td>
      <td class="num">${n0(r.tud)}</td><td class="num">${n0(r.rech)}</td><td class="num">${n0(r.rechMotor)}</td><td class="num">${n0(r.dacN)}</td><td class="num">${n2(r.porColocado)}</td>
      <td class="num">${dur(r.tReal)}</td><td class="num">${n2(r.prodHist)}</td><td class="num">${pct(r.usoReal)}</td></tr>`;
    const T = { ingresaron: tot('ingresaron'), nCol: tot('nCol'), colRapido: tot('colRapido'), tud: tot('tud'), rech: tot('rech'), rechMotor: tot('rechMotor'), dacN: tot('dacN') };
    T.ticket = T.nCol ? tot('montoCol') / T.nCol : null; T.porColocado = T.nCol ? T.dacN / T.nCol : null;
    const fila2 = (r, nom, cls = '') => `<tr class="${cls}"><td>${nom}</td><td class="num">${r.pct == null ? '—' : pct(r.pct)}</td><td class="num">${n2(r.montoMeta)}</td><td class="num">${n0(r.creditos)}</td><td class="num">${n0(r.solic)}</td><td class="num">${n2(r.porDia)}</td>
      <td class="num"><b>${n2(r.aProd)}</b></td><td class="num">${n2(r.aReal)}</td><td class="num">${n2(r.aMeta)}</td><td class="num">${r.actuales ?? '—'}</td><td class="num">${r.dif ?? dif(r)}</td></tr>`;
    const T2 = { pct: algun('pct') ? tot('pct') : null, montoMeta: algun('montoMeta') ? tot('montoMeta') : null, creditos: algun('creditos') ? tot('creditos') : null, solic: algun('solic') ? tot('solic') : null,
      porDia: algun('porDia') ? tot('porDia') : null, aProd: algun('aProd') ? tot('aProd') : null, aReal: algun('aReal') ? tot('aReal') : null, aMeta: algun('aMeta') ? tot('aMeta') : null, actuales: tot('actuales') };
    T2.dif = dif(T2);
    return `
      <div class="card"><h3>Capacidad instalada del departamento</h3>
        <p class="muted small">Con el presupuesto de colocación del mes y la historia del período base, calcula cuántas solicitudes van a llegar al DAC y cuántos analistas se necesitan por producto.</p>
        <form class="form" data-form="capacidad">
          <label>Mes a planificar<input type="month" name="mes" value="${cap.mes}" required></label>
          <label>Presupuesto de colocación del mes<input type="number" name="presupuesto" value="${cap.presupuesto}" min="0" step="any" placeholder="Monto" style="width:170px"></label>
          ${DAC.PRODUCTOS.map((p) => { const r = K.prods.find((x) => x.p === p); return `<label>% ${p}<input type="number" name="pct_${p}" value="${cap.pct[p] ?? ''}" min="0" max="100" step="any" style="width:80px" placeholder="${r.pctHist == null ? '' : (100 * r.pctHist).toFixed(1)}"></label>`; }).join('')}
          <label>Calcular con<select name="base">${Object.entries(BASES).map(([k, [t]]) => `<option value="${k}" ${cap.base === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label data-tip="Parte de la jornada que un analista dedica a analizar. Solo afecta el cálculo por tiempo.">% de la jornada analizando<input type="number" name="util" value="${cap.util}" min="1" max="100" style="width:80px"></label>
          <button class="btn">Calcular y guardar</button></form>
        ${sumaPct && Math.abs(sumaPct - 100) > 0.01 ? `<div class="nota alerta">Los porcentajes por producto suman ${n2(sumaPct)}%, no 100%.</div>` : ''}
        <p class="muted small">Si deja vacío el % de un producto se usa su peso histórico en el monto colocado del período base (el número en gris). Período base: <b>${baseTxt}</b>. Mes a planificar: ${n2(K.dhT)} días hábiles, ${n2(K.horasT)} horas de jornada.</p>
        ${sinBit ? `<div class="nota alerta">No hay datos de la bitácora para ${baseTxt}. Se llenan con la actualización, después de ejecutar la migración del 23-oct en Supabase y la carga del histórico.</div>` : ''}</div>
      <div class="card"><h3>Lo que pasó en el período base · ${baseTxt}</h3>
        <div class="tabla"><table><thead><tr><th>Producto</th><th class="num" data-tip="Todos los créditos creados (bitácora)">Ingresaron</th><th class="num" data-tip="Auditado, Aprobado Informa, Expediente…, Revisado, Formalizado">Colocados</th>
          <th class="num" data-tip="Colocados sin pasar por un analista">Por Flujo Rápido</th><th class="num" data-tip="Monto aprobado promedio de los colocados">Ticket promedio</th><th class="num">TUD</th><th class="num" data-tip="Rechazado por analista, recepción, resolución, asesor…">Rechazados</th><th class="num">Rechazados por motor</th>
          <th class="num" data-tip="Solicitudes que pasaron por POR ASIGNAR A ANALISTA">Solicitudes DAC</th><th class="num" data-tip="Solicitudes DAC por cada crédito colocado">DAC por colocado</th>
          <th class="num" data-tip="Promedio del tiempo del caso más el preaprobado condicionado (sin los reprocesos entre analistas)">Tiempo por solicitud</th><th class="num">Productividad</th>
          <th class="num" data-tip="Horas de análisis medidas ÷ horas de jornada disponibles de los analistas del producto">Uso de la jornada</th></tr></thead><tbody>
          ${K.prods.map((r) => fila(r, prodTag(r.p))).join('')}${fila({ ...T, tReal: null, prodHist: K.M.depto.prod, usoReal: null }, 'Departamento', 'total')}</tbody></table></div></div>
      <div class="card"><h3>Analistas necesarios · ${mesTxt(cap.mes)}</h3>
        <div class="tabla"><table><thead><tr><th>Producto</th><th class="num">% del presupuesto</th><th class="num">Monto a colocar</th><th class="num">Créditos a colocar</th><th class="num">Solicitudes DAC</th><th class="num">Por día hábil</th>
          <th class="num" data-tip="Solicitudes por día ÷ productividad histórica del producto">Analistas (productividad)</th><th class="num" data-tip="Horas de análisis con el tiempo real ÷ horas de jornada de un analista">Analistas (tiempo real)</th>
          <th class="num" data-tip="Horas de análisis si cada solicitud tomara su meta ÷ horas de jornada de un analista">Analistas (tiempo meta)</th><th class="num">Analistas actuales</th><th class="num">Diferencia</th></tr></thead><tbody>
          ${K.prods.map((r) => fila2(r, prodTag(r.p))).join('')}${fila2(T2, 'Departamento', 'total')}</tbody></table></div>
        <div class="nota"><b>Cómo se calcula</b> (por producto):<br>
          Créditos a colocar = presupuesto × % del producto ÷ ticket promedio.<br>
          Solicitudes DAC = créditos a colocar × solicitudes DAC por cada crédito colocado en el período base (incluye las que terminan en TUD o rechazadas, y descuenta las colocadas por Flujo Rápido).<br>
          <b>Analistas (productividad)</b> = solicitudes por día hábil ÷ productividad histórica del producto: es la capacidad instalada con el ritmo real de trabajo. La diferencia se mide contra esta columna.<br>
          Analistas (tiempo real / meta) = solicitudes × tiempo por solicitud ÷ (horas de jornada del mes × % de la jornada analizando). La columna <i>Uso de la jornada</i> muestra qué parte de la jornada se fue en análisis medido en el período base.</div></div>`;
  }

  // ---------- Vacaciones y calendario ----------
  function calendario() {
    const C = S.C, [d, h] = rangoMes(S.calMes);
    const an = C.analistas;
    const aus = (S.D.ausencias || []).slice().sort((a, b) => b.desde.localeCompare(a.desde));
    const ev = (S.D.eventos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const fer = (S.D.feriados || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const hor = (S.D.horarios || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const primero = DAC.fecha(d), offset = (primero.getDay() + 6) % 7;
    let celdas = DSEM.map((x) => `<div class="dn">${x}</div>`).join('') + '<div></div>'.repeat(offset);
    for (const f of DAC.dias(d, h)) {
      const v = C.valorDia(f), fr = fer.find((x) => x.fecha === f);
      const ausDia = aus.filter((a) => f >= a.desde && f <= a.hasta);
      const evDia = ev.filter((e) => e.fecha === f);
      const he = C.especiales.get(f);
      celdas += `<div class="d ${v === 0 ? 'cero' : ''} ${fr ? 'fer' : ''} ${f === C.hoy ? 'hoy' : ''}"><span class="n">${Number(f.slice(8))}</span><span class="h">${v}</span>
        ${he ? `<span class="t ev" title="Horario especial">🕗 ${he[0]}–${he[1]}</span>` : ''}
        ${fr ? `<span class="t" style="background:#FDE7B0" title="${esc(fr.descripcion)}">${esc(fr.descripcion)}</span>` : ''}
        ${ausDia.map((a) => `<span class="t" title="${esc(a.tipo)}: ${esc(titulo(a.analista))}">${esc(titulo(a.analista).split(' ')[0])} · ${esc(a.tipo)}</span>`).join('')}
        ${evDia.map((e) => `<span class="t ev" title="${esc(e.nombre)}: ${e.analistas.map(titulo).join(', ')}">★ ${esc(e.nombre)}</span>`).join('')}</div>`;
    }
    const diasAus = (a) => { let t = 0; for (const f of DAC.dias(a.desde, a.hasta)) t += Math.min(C.valorDia(f), a.medio_dia ? 0.5 : 1); return t; };
    const opAn = an.map((a) => `<option value="${esc(a.nombre)}">${esc(titulo(a.nombre))}</option>`).join('');
    const [y, m] = S.calMes.split('-').map(Number);
    const mesRel = (k) => DAC.iso(new Date(y, m - 1 + k, 1)).slice(0, 7);
    return `
      <div class="grid g2">
        <div class="card"><div class="cabeza"><h3>Calendario hábil · ${mesTxt(S.calMes)}</h3>
          <div><button class="btn sec mini" data-cal="${mesRel(-1)}">◀</button> <button class="btn sec mini" data-cal="${mesRel(1)}">▶</button></div></div>
          <div class="cal">${celdas}</div>
          <p class="muted small">Lunes a viernes = 1, sábado = 0.5, domingo = 0. Feriado nacional = 0; si cae domingo se repone el lunes.
          Días hábiles del mes: <b>${n2(C.diasHabilesTotales(d, h))}</b>.</p>
          <h3 style="margin-top:14px">Horarios especiales</h3>
          <p class="muted small">Para medir los tiempos en horas hábiles: normalmente L-V ${C.cfg.jornada.lv[0]}–${C.cfg.jornada.lv[1]} y sábado ${C.cfg.jornada.sab[0]}–${C.cfg.jornada.sab[1]}. Registre aquí los días con otro horario (por ejemplo, el DAC cierra a las 8:00 pm). Aplica desde la siguiente actualización.</p>
          <form class="form" data-form="horario"><label>Fecha<input type="date" name="fecha" required></label>
            <label>Desde<input type="time" name="inicio" value="${C.cfg.jornada.lv[0]}" required></label><label>Hasta<input type="time" name="fin" value="20:00" required></label>
            <label>Motivo<input name="descripcion"></label><button class="btn">Agregar</button></form>
          <div class="tabla"><table><thead><tr><th>Fecha</th><th>Horario</th><th>Motivo</th><th></th></tr></thead><tbody>
            ${hor.map((x) => `<tr><td>${x.fecha}</td><td>${x.inicio.slice(0, 5)}–${x.fin.slice(0, 5)}</td><td>${esc(x.descripcion || '')}</td>
              <td><button class="btn peligro mini" data-borrar="dac_horarios" data-id="${x.fecha}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin horarios especiales</td></tr>'}</tbody></table></div></div>
        <div>
          <div class="card"><h3>Vacaciones y permisos</h3>
            <p class="muted small">Restan días disponibles al analista y al departamento.</p>
            <form class="form" data-form="ausencia">
              <label>Analista<select name="analista" required>${opAn}</select></label>
              <label>Desde<input type="date" name="desde" required></label><label>Hasta<input type="date" name="hasta" required></label>
              <label>Tipo<select name="tipo"><option>Vacaciones</option><option>Permiso</option><option>Incapacidad</option><option>Capacitación</option></select></label>
              <label style="flex-direction:row;align-items:center;gap:4px;font-weight:400"><input type="checkbox" name="medio_dia"> Solo medio día</label>
              <label>Nota<input name="nota"></label><button class="btn">Registrar</button></form>
            <div class="tabla"><table><thead><tr><th>Analista</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th class="num">Días hábiles</th><th></th></tr></thead><tbody>
              ${aus.map((a) => `<tr><td>${esc(titulo(a.analista))}</td><td>${esc(a.tipo)}${a.medio_dia ? ' (½ día)' : ''}</td><td>${a.desde}</td><td>${a.hasta}</td><td class="num">${n2(diasAus(a))}</td>
                <td><button class="btn peligro mini" data-borrar="dac_ausencias" data-id="${a.id}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin registros</td></tr>'}</tbody></table></div></div>
          <div class="card"><h3>Eventos especiales</h3>
            <p class="muted small">Días que para los analistas asignados sí son hábiles (por ejemplo, campaña de fiestas patronales sábado completo y domingo). Suman solo a la productividad de esos analistas, no al calendario general.</p>
            <form class="form" data-form="evento">
              <label>Evento<input name="nombre" required placeholder="Campaña fiestas patronales"></label>
              <label>Fecha<input type="date" name="fecha" required></label>
              <label>Vale<select name="valor"><option value="1">Día completo</option><option value="0.5">Medio día</option></select></label>
              <div class="multi">${an.map((a) => `<label><input type="checkbox" name="analistas" value="${esc(a.nombre)}">${esc(titulo(a.nombre))}</label>`).join('')}</div>
              <button class="btn">Registrar</button></form>
            <div class="tabla"><table><thead><tr><th>Evento</th><th>Fecha</th><th class="num">Vale</th><th>Analistas</th><th></th></tr></thead><tbody>
              ${ev.map((e) => `<tr><td>${esc(e.nombre)}</td><td>${e.fecha}</td><td class="num">${e.valor}</td><td class="small">${e.analistas.map((x) => esc(titulo(x))).join(', ')}</td>
                <td><button class="btn peligro mini" data-borrar="dac_eventos" data-id="${e.id}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin registros</td></tr>'}</tbody></table></div></div>
        </div>
      </div>
      <div class="card"><div class="cabeza"><h3>Feriados</h3><button class="btn sec" data-act="feriados">Cargar feriados propuestos de ${y}</button></div>
        <form class="form" data-form="feriado"><label>Fecha<input type="date" name="fecha" required></label>
          <label>Queda hábil<select name="valor"><option value="0">Nada (feriado)</option><option value="0.5">Medio día</option></select></label>
          <label>Descripción<input name="descripcion" required></label><button class="btn">Agregar</button></form>
        <div class="tabla"><table><thead><tr><th>Fecha</th><th>Día</th><th>Descripción</th><th class="num">Queda hábil</th><th></th></tr></thead><tbody>
          ${fer.filter((f) => f.fecha.startsWith(String(y))).map((f) => `<tr><td>${f.fecha}</td><td>${DSEM[(DAC.fecha(f.fecha).getDay() + 6) % 7]}</td><td>${esc(f.descripcion)}</td><td class="num">${f.valor}</td>
            <td><button class="btn peligro mini" data-borrar="dac_feriados" data-id="${f.fecha}">Quitar</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted">No hay feriados registrados para ${y}</td></tr>`}</tbody></table></div></div>`;
  }

  // ---------- Administración ----------
  let usuariosCache = null;
  function administracion() {
    const C = S.C, cfg = C.cfg;
    const estados = [...new Set(S.D.tramos.flatMap((t) => Object.keys(t.estados || {})))].sort();
    const vistos = [...new Set(S.D.tramos.map((t) => t.analista).filter(Boolean))].filter((n) => !(S.D.analistas || []).some((a) => a.nombre === n));
    if (!usuariosCache) API.usuarios().then((u) => { usuariosCache = u; if (S.tab === 'admin') vista(); }).catch(aviso);
    const us = usuariosCache || [];
    const opProd = (v) => DAC.PRODUCTOS.map((p) => `<option ${p === v ? 'selected' : ''}>${p}</option>`).join('');
    const radio = (clave, k, txt) => `<label style="flex-direction:row;align-items:start;gap:6px;font-weight:400;color:var(--texto)"><input type="radio" name="${clave}" value="${k}" ${cfg[clave] === k ? 'checked' : ''}><span>${txt}</span></label>`;
    return `
      <div class="card"><h3>Analistas y producto asignado</h3>
        <p class="muted small">El nombre debe ser igual al que aparece en el sistema. El producto define con quién se divide la productividad del producto; el analista igual puede atender otros productos.</p>
        <div class="tabla"><table><thead><tr><th>Analista</th><th>Producto</th><th>Activo</th><th>Desde</th><th>Hasta</th><th></th></tr></thead><tbody>
        ${(S.D.analistas || []).map((a) => `<tr data-analista="${esc(a.nombre)}"><td>${esc(titulo(a.nombre))}</td><td><select name="producto">${opProd(a.producto)}</select></td>
          <td><input type="checkbox" name="activo" ${a.activo !== false ? 'checked' : ''}></td><td><input type="date" name="desde" value="${a.desde || ''}"></td><td><input type="date" name="hasta" value="${a.hasta || ''}"></td>
          <td><button class="btn mini" data-act="guardarAnalista">Guardar</button> <button class="btn peligro mini" data-borrar="dac_analistas" data-id="${esc(a.nombre)}">Quitar</button></td></tr>`).join('')}
        </tbody></table></div>
        <form class="form" data-form="analista"><label>Agregar analista<select name="nombre">${vistos.map((n) => `<option value="${esc(n)}">${esc(titulo(n))}</option>`).join('')}<option value="">Otro (escribir)…</option></select></label>
          <label>Otro nombre<input name="otro" placeholder="Como aparece en el sistema"></label><label>Producto<select name="producto">${opProd('PERS')}</select></label><button class="btn">Agregar</button></form></div>

      <div class="card"><h3>Parámetros de cálculo</h3>
        <div class="grid g2">
          <div><b>¿Cómo cuenta el día de hoy?</b> <span class="muted small">(los datos están en línea e incluyen las solicitudes de hoy)</span>
            <div class="form" style="flex-direction:column;align-items:start">
              ${radio('modo_hoy', 'proporcional', '<b>Proporcional (recomendado)</b>: hoy vale la parte de la jornada que ya pasó. Con jornada de 8:00 a 18:00, a las 12:00 de un martes cuenta 0.4; al cierre, 1.')}
              ${radio('modo_hoy', 'excluir', 'No contar hoy (como el archivo anterior, que era al día anterior). Infla la productividad durante el día.')}
              ${radio('modo_hoy', 'completo', 'Contar hoy completo. Castiga la productividad durante el día.')}</div>
            <b>Tiempo de los tramos</b><div class="form" style="flex-direction:column;align-items:start">
              ${radio('modo_tiempo', 'reloj', 'Hora reloj (tal como pasa el tiempo, incluye noches si el tramo queda de un día a otro)')}
              ${radio('modo_tiempo', 'jornada', '<b>Solo horas hábiles</b> (descuenta noches, domingos y feriados; usa los horarios especiales del calendario)')}</div></div>
          <div><b>Estados que no cuentan en el tiempo del analista</b><div class="multi" style="margin:6px 0 12px">
            ${estados.map((e) => `<label><input type="checkbox" name="estados_excluidos" value="${esc(e)}" ${(cfg.estados_excluidos || []).includes(e) ? 'checked' : ''}>${esc(e)}</label>`).join('')}</div>
            <div class="form"><label>Jornada L-V<span><input type="time" name="lv0" value="${cfg.jornada.lv[0]}"> a <input type="time" name="lv1" value="${cfg.jornada.lv[1]}"></span></label>
              <label>Sábado<span><input type="time" name="sab0" value="${cfg.jornada.sab[0]}"> a <input type="time" name="sab1" value="${cfg.jornada.sab[1]}"></span></label>
              ${DAC.PRODUCTOS.map((p) => `<label>Meta ${p} (min)<input type="number" name="meta_${p}" value="${cfg.metas[p]}" min="1" style="width:80px"></label>`).join('')}
              <label>Actualizar solo cada (min)<input type="number" name="cada_minutos" value="${S.D.config.cada_minutos ?? 60}" min="0" style="width:90px"></label></div></div>
        </div><button class="btn" data-act="guardarConfig">Guardar parámetros</button>
        <p class="muted small">La jornada también la usa el proceso de actualización para medir en horas de jornada; un cambio aplica desde la siguiente actualización.</p></div>

      <div class="card"><h3>Usuarios</h3>
        <p class="muted small">Se ingresa escribiendo el nombre de usuario. Contraseña inicial: 12345678.</p>
        <div class="tabla"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Analista (si es analista)</th><th>Activo</th><th></th></tr></thead><tbody>
        ${us.map((u) => `<tr data-usuario="${esc(u.id)}"><td>${esc(u.nombre)}</td><td class="muted">${esc(u.usuario)}</td>
          <td><select name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          <td><select name="analista"><option value=""></option>${(S.D.analistas || []).map((a) => `<option value="${esc(a.nombre)}" ${a.nombre === u.analista ? 'selected' : ''}>${esc(titulo(a.nombre))}</option>`).join('')}</select></td>
          <td><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}></td>
          <td><button class="btn mini" data-act="guardarUsuario">Guardar</button> <button class="btn sec mini" data-act="restablecer">Restablecer clave</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Cargando…</td></tr>'}
        </tbody></table></div>
        <form class="form" data-form="usuario"><label>Nombre (será su usuario)<input name="nombre" required></label>
          <label>Rol<select name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Analista<select name="analista"><option value=""></option>${(S.D.analistas || []).map((a) => `<option value="${esc(a.nombre)}">${esc(titulo(a.nombre))}</option>`).join('')}</select></label>
          <button class="btn">Crear usuario</button></form></div>

      <div class="card"><h3>Últimas actualizaciones</h3><div class="tabla"><table><thead><tr><th>Pedida</th><th>Por</th><th>Estado</th><th>Terminó</th><th>Mensaje</th></tr></thead><tbody>
        ${(S.D.actualizaciones || []).slice(-15).reverse().map((a) => `<tr><td>${fh(a.solicitado_en)}</td><td>${esc(a.solicitado_nombre || '')}</td><td>${a.estado}</td><td>${fh(a.terminado_en)}</td><td class="small">${esc(a.mensaje || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin registros</td></tr>'}
      </tbody></table></div></div>`;
  }

  const VISTAS = { dashboard, tiempos, reproceso, cartera, productividad, acumulado, global, motor, ciclo, capacidad, calendario, admin: administracion };

  // ---------- Eventos ----------
  async function guardar(tabla, fila) { await API.guardar(tabla, fila); await recargar(); }
  async function recargar() {
    S.D = preparar(await API.cargar()); recalcular(); vista();
  }

  app.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    S[f] = f === 'anio' ? Number(e.target.value) : e.target.value;
    if (f === 'dper' && S.dgran === 'mes') S.mes = e.target.value.slice(0, 7);
    vista();
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && MODAL) cerrarLista(); });
  app.addEventListener('click', async (e) => {
    const cerrar = e.target.closest('[data-cerrar]');
    if (cerrar && (cerrar === e.target || cerrar.tagName === 'BUTTON')) { cerrarLista(); return; }
    const g = e.target.closest('[data-clic]');
    if (g) {
      const v = g.dataset.clic;
      if (v.startsWith('fil|')) { // día, hora, celda o semana: filtra todo el dashboard (otro clic en lo mismo lo quita)
        const [, d1, d2, hora, analista] = v.split('|');
        const nuevo = { per: `${S.dgran}:${S.dper}`, d1: d1 || null, d2: d2 || null, hora: hora === '' ? null : Number(hora), analista: analista || null };
        const F = S.dfiltro;
        const igual = F && F.per === nuevo.per && F.d1 === nuevo.d1 && F.d2 === nuevo.d2 && F.hora === nuevo.hora && F.analista === nuevo.analista;
        // otro clic en lo mismo quita ese filtro (se conserva el del analista si había uno)
        S.dfiltro = igual ? (F.analista ? { per: F.per, d1: null, d2: null, hora: null, analista: F.analista } : null) : nuevo;
        if (S.dfiltro && !S.dfiltro.d1 && S.dfiltro.hora == null && !S.dfiltro.analista) S.dfiltro = null;
      } else if (v.startsWith('mes:')) { S.dgran = 'mes'; S.mes = v.slice(4); } // un mes de un gráfico: el dashboard pasa a ese mes
      vista();
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.tab) { S.tab = b.dataset.tab; pintar(); return; }
      if (b.dataset.dgran) { S.dgran = b.dataset.dgran; S.dper = null; vista(); return; }
      if (b.dataset.set) { const [k, v] = b.dataset.set.split(':'); S[k] = v; vista(); return; }
      if (b.dataset.casos) { const l = LISTAS[Number(b.dataset.casos)]; abrirLista(l.titulo, l.filas); return; }
      if (b.dataset.ver) {
        S.buscar = b.dataset.ver; S.tab = 'tiempos'; cerrarLista(); pintar();
        const el = $('#detalleSol'); if (el) el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (b.dataset.vista) { S.vista = b.dataset.vista; vista(); return; }
      if (b.dataset.gran) { S.gran = b.dataset.gran; vista(); return; }
      if (b.dataset.cal) { S.calMes = b.dataset.cal; vista(); return; }
      if (b.dataset.borrar) {
        if (!confirm('¿Quitar este registro?')) return;
        const campo = { dac_analistas: 'nombre', dac_feriados: 'fecha', dac_horarios: 'fecha' }[b.dataset.borrar] || 'id';
        const v = campo === 'id' && API.modo === 'nube' ? Number(b.dataset.id) : (campo === 'id' ? Number(b.dataset.id) : b.dataset.id);
        await API.borrar(b.dataset.borrar, campo, v); await recargar(); return;
      }
      const act = b.dataset.act;
      if (act === 'salir') { await API.salir(); S.perfil = null; login(); }
      else if (act === 'clave') cambiarClave();
      else if (act === 'quitarFiltro') { S.dfiltro = null; vista(); }
      else if (act === 'actualizar') { b.disabled = true; await pedirActualizacion(); b.disabled = false; }
      else if (act === 'bajarModal') await excel(MODAL.titulo.replace(/[\\/:*?"<>|]/g, ' '), { Detalle: MODAL.filas.map(xlsFila) });
      else if (act === 'bajarCiclo') { b.disabled = true; try { await bajarCiclo(); } finally { b.disabled = false; } }
      else if (act === 'bajarTiempos') { b.disabled = true; try { await bajarTiempos(); } finally { b.disabled = false; } }
      else if (act === 'feriados') {
        const y = S.calMes.slice(0, 4);
        const prop = DAC.feriadosPropuestos(Number(y)).filter((f) => !(S.D.feriados || []).some((x) => x.fecha === f.fecha));
        if (!prop.length) return alert('Ya están registrados.');
        if (confirm(`Se agregarán ${prop.length} feriados de ${y}:\n\n${prop.map((f) => `${f.fecha}  ${f.descripcion}`).join('\n')}\n\nRevíselos y quite los que no apliquen.`)) await guardar('dac_feriados', prop);
      } else if (act === 'guardarAnalista') {
        const tr = b.closest('tr');
        await guardar('dac_analistas', { nombre: tr.dataset.analista, producto: $('[name=producto]', tr).value, activo: $('[name=activo]', tr).checked,
          desde: $('[name=desde]', tr).value || null, hasta: $('[name=hasta]', tr).value || null });
      } else if (act === 'guardarConfig') {
        const m = $('#main');
        const val = (n) => $(`[name=${n}]`, m).value;
        const filas = [
          { clave: 'modo_hoy', valor: $('[name=modo_hoy]:checked', m).value },
          { clave: 'modo_tiempo', valor: $('[name=modo_tiempo]:checked', m).value },
          { clave: 'estados_excluidos', valor: $$('[name=estados_excluidos]:checked', m).map((x) => x.value) },
          { clave: 'jornada', valor: { lv: [val('lv0'), val('lv1')], sab: [val('sab0'), val('sab1')] } },
          { clave: 'metas', valor: Object.fromEntries(DAC.PRODUCTOS.map((p) => [p, Number(val(`meta_${p}`))])) },
          { clave: 'cada_minutos', valor: Number(val('cada_minutos')) },
        ];
        await guardar('dac_config', filas);
        alert('Parámetros guardados.');
      } else if (act === 'guardarUsuario') {
        const tr = b.closest('tr');
        await API.editarUsuario(tr.dataset.usuario, $('[name=rol]', tr).value, $('[name=analista]', tr).value, $('[name=activo]', tr).checked);
        await analistaReproceso($('[name=rol]', tr).value, $('[name=analista]', tr).value);
        usuariosCache = null; vista();
      } else if (act === 'restablecer') {
        if (confirm('¿Restablecer la contraseña a 12345678?')) { await API.restablecer(b.closest('tr').dataset.usuario); alert('Contraseña restablecida a 12345678.'); }
      }
    } catch (err) { aviso(err); }
  });

  app.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form), o = Object.fromEntries(fd);
    try {
      switch (form.dataset.form) {
        case 'buscar': S.buscar = o.q.trim(); vista(); break;
        case 'capacidad': {
          S.cap = { mes: o.mes, presupuesto: o.presupuesto, base: o.base, util: Number(o.util) || 100,
            pct: Object.fromEntries(DAC.PRODUCTOS.map((p) => [p, o[`pct_${p}`]])) };
          vista();
          await API.guardar('dac_config', { clave: 'capacidad', valor: S.cap });
          S.D.config.capacidad = S.cap;
          break;
        }
        case 'ausencia':
          if (o.hasta < o.desde) throw new Error('La fecha final es anterior a la inicial');
          await guardar('dac_ausencias', { analista: o.analista, desde: o.desde, hasta: o.hasta, tipo: o.tipo, medio_dia: !!o.medio_dia, nota: o.nota || null });
          break;
        case 'evento': {
          const an = fd.getAll('analistas');
          if (!an.length) throw new Error('Seleccione al menos un analista');
          await guardar('dac_eventos', { nombre: o.nombre, fecha: o.fecha, valor: Number(o.valor), analistas: an });
          break;
        }
        case 'horario':
          if (o.fin <= o.inicio) throw new Error('La hora final debe ser posterior a la inicial');
          await guardar('dac_horarios', { fecha: o.fecha, inicio: o.inicio, fin: o.fin, descripcion: o.descripcion || null });
          break;
        case 'feriado': await guardar('dac_feriados', { fecha: o.fecha, valor: Number(o.valor), descripcion: o.descripcion }); break;
        case 'analista': {
          const nombre = (o.nombre || o.otro || '').trim().toUpperCase();
          if (!nombre) throw new Error('Indique el nombre del analista');
          await guardar('dac_analistas', { nombre, producto: o.producto, activo: true });
          break;
        }
        case 'usuario':
          await API.crearUsuario(o.nombre.trim(), o.rol, o.analista);
          await analistaReproceso(o.rol, o.analista);
          usuariosCache = null; vista(); alert(`Usuario creado. Ingresa con "${o.nombre.trim()}" y la contraseña 12345678.`);
          break;
      }
    } catch (err) { aviso(err); }
  });

  // El perfil "Analista con reprocesamiento" define a nombre de quién queda el preaprobado condicionado
  async function analistaReproceso(rol, analista) {
    if (rol !== 'reproceso' || !analista || analista === S.D.config.analista_reproceso) return;
    await API.guardar('dac_config', { clave: 'analista_reproceso', valor: analista });
    await recargar();
  }

  function cambiarClave() {
    const actual = prompt('Contraseña actual:');
    if (!actual) return;
    const nueva = prompt('Nueva contraseña (mínimo 8 caracteres):');
    if (!nueva) return;
    if (nueva.length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
    API.cambiarClave(S.perfil, actual, nueva).then(() => alert('Contraseña cambiada.')).catch(aviso);
  }

  // ---------- Arranque ----------
  (async () => {
    try {
      S.perfil = await API.sesion();
      if (S.perfil) await iniciar(); else login();
    } catch (e) { console.error(e); login(); }
  })();
})();
