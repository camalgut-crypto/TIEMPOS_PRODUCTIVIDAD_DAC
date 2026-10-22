// Tiempos DAC — Departamento de Análisis de Crédito, Instacredit Nicaragua
(function () {
  const { esc } = GRAF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DSEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const COLOR = { PERS: 'var(--s-pers)', PYMES: 'var(--s-pymes)', MOTO: 'var(--s-moto)' };
  const ROLES = { admin: 'Administrador', jefe: 'Jefe DAC', analista: 'Analista', gerente: 'Gerente DAC' };
  const INICIO = '2026-10'; // se guarda información desde octubre 2026
  const TABS = [
    ['dashboard', 'Dashboard', ['admin', 'jefe', 'gerente', 'analista']],
    ['tiempos', 'Tiempos por analista', ['admin', 'jefe', 'analista']],
    ['reproceso', 'Preaprobado condicionado', ['admin', 'jefe', 'analista']],
    ['productividad', 'Productividad por analista', ['admin', 'jefe', 'analista']],
    ['acumulado', 'Acumulado', ['admin', 'jefe', 'analista']],
    ['global', 'Departamento (global)', ['admin', 'jefe']],
    ['calendario', 'Vacaciones y calendario', ['admin', 'jefe']],
    ['admin', 'Administración', ['admin', 'jefe']],
  ];

  const S = { perfil: null, D: null, C: null, tab: 'dashboard', mes: null, producto: '', tipo: '', vista: 'analista',
    gran: 'mes', anio: null, calMes: null, buscar: '', pedido: null };

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
  const soloYo = () => (S.perfil.rol === 'analista' ? S.perfil.analista : null);
  const aviso = (e) => alert(e.message || e);

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
    S.D = await API.cargar();
    S.D.solicitudes = S.D.solicitudes || [];
    S.D.tramos = S.D.tramos || [];
    S.D.config = Object.fromEntries((S.D.config || []).map((c) => [c.clave, c.valor]));
    S.C = DAC.contexto({ ...S.D, config: S.D.config });
    const hoy = DAC.iso(new Date()).slice(0, 7);
    S.mes = S.mes || hoy;
    S.anio = S.anio || Number(hoy.slice(0, 4));
    S.calMes = S.calMes || hoy;
    if (!puede(S.tab)) S.tab = 'dashboard';
    pintar();
  }
  const recalcular = () => { S.C = DAC.contexto({ ...S.D, config: S.D.config }); };

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
      <main id="main"></main>`;
    vista();
  }
  function vista() {
    const m = $('#main');
    try { m.innerHTML = VISTAS[S.tab](); } catch (e) { console.error(e); m.innerHTML = `<div class="card nota alerta">Error al calcular: ${esc(e.message)}</div>`; }
    if (S.tab === 'dashboard') vigilarPedido();
  }

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

  function notaHoy(M) {
    const C = S.C, [d, h] = rangoMes(S.mes);
    if (!(C.hoy >= d && C.hoy <= h)) return `Días hábiles del mes: <b>${n2(M.depto.diasMes)}</b>.`;
    const modo = { excluir: 'no se cuenta', completo: 'se cuenta completo', proporcional: `cuenta ${n2(C.valorTranscurrido(C.hoy))} de ${n2(C.valorDia(C.hoy))} (proporcional a la jornada transcurrida)` }[C.cfg.modo_hoy];
    return `Días hábiles transcurridos: <b>${n2(M.depto.diasHabiles)}</b> de ${n2(M.depto.diasMes)} del mes · hoy ${modo}.`;
  }

  // ---------- Dashboard ----------
  function dashboard() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, M = DAC.metricas(C, S.D, d, h);
    const meta = Number(C.cfg.meta_minutos);
    const glob = M.sols.filter((s) => !s.reestructura).map((s) => C.global(s)).filter(Boolean).map((g) => g.segundos);
    const T = DAC.resumenTiempos(glob, meta);
    const R = DAC.resumenTiempos(DAC.tramosPeriodo(C, S.D, 'reproceso', d, h).map(C.segundosTramo), meta);
    const porDia = new Map();
    for (const s of M.sols) { const k = s.ingreso_dac.slice(0, 10); porDia.set(k, (porDia.get(k) || 0) + 1); }
    const diasMes = [...DAC.dias(d, h > C.hoy ? C.hoy : h)].map((f) => ({ x: Number(f.slice(8)), y: porDia.get(f) || 0,
      tip: `${f.slice(8)}/${f.slice(5, 7)} · ${n0(porDia.get(f) || 0)} solicitudes · ${C.valorDia(f) ? `día hábil ${C.valorDia(f)}` : 'no hábil'}` }));
    const yo = soloYo();
    const pa = M.porAnalista.filter((a) => !yo || a.nombre === yo).sort((a, b) => (b.prod || 0) - (a.prod || 0));
    const ult = S.D.config.ultima_actualizacion;
    return `
      <div class="cabeza">
        <div><h2>Departamento de Análisis · ${mesTxt(S.mes)}</h2>
          <div class="muted small">${notaHoy(M)} Última actualización: <b>${fh(ult)}</b></div></div>
        <div>${filtros({ producto: false, tipo: false, extra: '<button class="btn" data-act="actualizar">⟳ Actualizar</button>' })}
          <div class="estado-act muted" id="estadoAct" style="margin-top:-8px"></div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Solicitudes DAC</div><div class="v">${n0(M.depto.n)}</div><div class="s">${n0(M.depto.reestructuras)} reestructuras · ${n2(M.depto.porDia)} por día hábil</div></div>
        <div class="kpi verde"><div class="l">Productividad del departamento</div><div class="v">${n2(M.depto.prod)}</div><div class="s">solicitudes / día hábil / analista · ${n2(M.depto.equiv)} analistas</div></div>
        <div class="kpi cielo"><div class="l">Tiempo de la solicitud</div><div class="v">${dur(T.mediana)}</div><div class="s">mediana · promedio ${dur(T.prom)}</div></div>
        <div class="kpi lima"><div class="l">Dentro de ${meta} min</div><div class="v">${pct(T.enMeta)}</div><div class="s">${n0(T.n)} solicitudes con tiempo medido</div></div>
        <div class="kpi naranja"><div class="l">Preaprobado condicionado</div><div class="v">${n0(R.n)}</div><div class="s">reprocesos · mediana ${dur(R.mediana)}</div></div>
      </div>
      <div class="grid g3" style="margin-bottom:14px">${DAC.PRODUCTOS.map((p) => { const x = M.porProducto[p]; return `
        <div class="card"><h3>${prodTag(p)}</h3>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="tit" style="font-size:28px;font-weight:800;color:var(--navy)">${n2(x.prod)}</span><span class="muted small">productividad</span></div>
          <div class="muted small">${n0(x.n)} solicitudes · ${n2(x.porDia)} por día · ${x.analistas} analistas (${n2(x.equiv)} disponibles)</div></div>`; }).join('')}</div>
      <div class="grid g2">
        <div class="card"><h3>Solicitudes que ingresaron al DAC por día</h3>${GRAF.columnas(diasMes, { fmt: n0 })}</div>
        <div class="card"><h3>Productividad por analista</h3><p class="muted small" style="margin-top:-4px">Solicitudes en que intervino / días disponibles</p>
          ${GRAF.barras(pa.map((a) => ({ nombre: titulo(a.nombre), y: a.prod, color: COLOR[a.producto],
            tip: `${esc(titulo(a.nombre))} (${a.producto})<br>${a.n} solicitudes / ${n2(a.disp)} días = ${n2(a.prod)}` })), { fmt: n2 })}
          <div class="leyenda" style="margin-top:8px">${DAC.PRODUCTOS.map((p) => `<span><i style="background:${COLOR[p]};height:10px;width:10px"></i>${p}</span>`).join('')}</div></div>
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
  function tablaTiempos(grupos, meta, etiqueta = 'Analista') {
    const total = DAC.resumenTiempos(grupos.flatMap((g) => g.valores), meta);
    const fila = (nom, R, cls = '') => `<tr class="${cls}"><td>${nom}</td><td class="num">${n0(R.n)}</td><td class="num">${dur(R.prom)}</td><td class="num">${dur(R.mediana)}</td><td class="num"><b>${pct(R.enMeta)}</b></td>
      ${[...R.dist.values()].map((c) => { const v = R.n ? c / R.n : 0; return `<td class="heat" style="${heat(v)}" data-tip="${c} de ${R.n}">${v ? Math.round(100 * v) + '%' : '·'}</td>`; }).join('')}</tr>`;
    return `<div class="tabla"><table><thead><tr><th>${etiqueta}</th><th class="num">Casos</th><th class="num">Promedio</th><th class="num">Mediana</th><th class="num">≤ ${meta} min</th>
      ${[...DAC.RANGOS, Infinity].map((r) => `<th class="num">${rangoTxt(r)}</th>`).join('')}</tr></thead><tbody>
      ${grupos.map((g) => fila(g.nombre, DAC.resumenTiempos(g.valores, meta))).join('')}
      ${grupos.length > 1 ? fila('Total', total, 'total') : ''}</tbody></table></div>`;
  }
  const agrupar = (lista, clave, valor) => {
    const m = new Map();
    for (const x of lista) { const k = clave(x) || '(sin analista)'; if (!m.has(k)) m.set(k, []); m.get(k).push(valor(x)); }
    return [...m].map(([k, v]) => ({ k, valores: v })).sort((a, b) => b.valores.length - a.valores.length);
  };
  const nombreAnalista = (k) => `${esc(titulo(k))}${S.C.esAnalista.has(k) ? ` <span class="muted small">${S.C.productoDe.get(k)}</span>` : ' <span class="muted small">(no es analista)</span>'}`;

  function notaTiempos() {
    const c = S.C.cfg;
    const j = c.jornada;
    return `<p class="muted small">Tiempo en <b>${c.modo_tiempo === 'jornada' ? `horas hábiles (L-V ${j.lv[0]}–${j.lv[1]}, sábado ${j.sab[0]}–${j.sab[1]}, más horarios especiales)` : 'hora reloj'}</b>, sin contar: <b>${(c.estados_excluidos || []).join(', ') || 'ningún estado'}</b>. Las reestructuras no se miden. Cada solicitud se mide hasta el cierre del mes en que ingresó. Rangos en minutos (como el Excel: -05 = hasta 5 min).</p>`;
  }

  function tiempos() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, meta = Number(C.cfg.meta_minutos), yo = soloYo();
    let grupos, titulo2, extra = '';
    if (S.vista === 'analista') {
      const tr = DAC.tramosPeriodo(C, S.D, 'analisis', d, h, filtroDatos()).filter((t) => !yo || t.analista === yo);
      grupos = agrupar(tr, (t) => t.analista, C.segundosTramo).map((g) => ({ nombre: nombreAnalista(g.k), valores: g.valores }));
      titulo2 = 'Tiempo de cada analista en los tramos que atendió';
      const cruza = tr.filter((t) => t.cruza_dia).length;
      if (cruza && C.cfg.modo_tiempo !== 'jornada') extra = `<div class="nota alerta">${cruza} de ${tr.length} tramos quedan de un día para el otro y en hora reloj cuentan la noche completa. Se puede cambiar a horas hábiles en Administración.</div>`;
    } else {
      const sols = S.D.solicitudes.filter((s) => s.ingreso_dac.slice(0, 10) >= d && s.ingreso_dac.slice(0, 10) <= h && !s.reestructura
        && (!S.producto || s.producto === S.producto) && (!S.tipo || s.tipo_credito === S.tipo));
      const gl = sols.map((s) => C.global(s)).filter((g) => g && (!yo || g.analista === yo));
      grupos = agrupar(gl, (g) => g.analista, (g) => g.segundos).map((g) => ({ nombre: nombreAnalista(g.k), valores: g.valores }));
      titulo2 = 'Tiempo de la solicitud: el del último analista, a quien le queda el caso';
    }
    const seg = `<div class="seg">${[['analista', 'Tramos por analista'], ['caso', 'Tiempo de la solicitud (caso)']].map(([k, t]) => `<button data-vista="${k}" class="${S.vista === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    return `${filtros({ extra: `<label>Vista${seg}</label>` })}
      <div class="card"><h3>${titulo2} · ${mesTxt(S.mes)}</h3>${notaTiempos()}${extra}${tablaTiempos(grupos, meta)}</div>
      ${detalleSolicitud()}`;
  }

  function detalleSolicitud() {
    const id = Number(S.buscar);
    let cuerpo = '<p class="muted small">Escriba un número de solicitud para ver cada tramo y en qué estados se fue el tiempo.</p>';
    if (id) {
      const s = S.C.solPorId.get(id), tr = S.C.tramosPorSol.get(id) || [];
      const yo = soloYo();
      if (!s || (yo && !tr.some((t) => t.analista === yo))) cuerpo = '<p class="muted">No está en el universo DAC cargado (no pasó por POR ASIGNAR A ANALISTA).</p>';
      else {
        const g = S.C.global(s);
        cuerpo = `<p class="small">${prodTag(s.producto)} · ${esc(s.tipo_credito || '')} · ${s.reestructura ? '<b>Reestructura</b> (no se mide tiempo) · ' : ''}Ingresó al DAC ${fh(s.ingreso_dac)} · Estado actual: ${esc(s.estado_actual || '—')}<br>
          Tiempo de la solicitud: <b>${dur(g && g.segundos)}</b> · le queda a <b>${esc(titulo(g && g.analista))}</b> · De la creación a la última decisión: ${dur(s.segundos_total)}</p>
          <div class="tabla"><table><thead><tr><th>#</th><th>Tipo</th><th>Analista</th><th>Inicio</th><th>Fin</th><th>Termina en</th><th class="num">Tiempo</th><th>Detalle por estado (reloj · jornada)</th></tr></thead><tbody>
          ${tr.map((t) => `<tr><td>${t.n}</td><td>${t.tipo === 'analisis' ? 'Análisis' : 'Preaprobado condicionado'}</td><td>${esc(titulo(t.analista))}</td><td>${fh(t.inicio)}</td><td>${fh(t.fin)}</td><td>${esc(t.fin_estado)}</td><td class="num"><b>${dur(S.C.segundosTramo(t))}</b></td>
            <td class="small">${Object.entries(t.estados || {}).map(([e, v]) => `${esc(e)}: ${dur(v[0])} · ${dur(v[1])}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
      }
    }
    return `<div class="card"><div class="cabeza"><h3>Detalle de una solicitud</h3>
      <form class="form" data-form="buscar" style="margin:0"><input name="q" placeholder="N.º de solicitud" value="${esc(S.buscar)}" inputmode="numeric"><button class="btn sec">Ver</button></form></div>${cuerpo}</div>`;
  }

  function reproceso() {
    const [d, h] = rangoMes(S.mes);
    const C = S.C, meta = Number(C.cfg.meta_minutos), yo = soloYo();
    const tr = DAC.tramosPeriodo(C, S.D, 'reproceso', d, h, filtroDatos()).filter((t) => !yo || t.analista === yo);
    const grupos = agrupar(tr, (t) => t.analista, C.segundosTramo).map((g) => ({ nombre: nombreAnalista(g.k), valores: g.valores }));
    const abiertos = S.D.tramos.filter((t) => t.tipo === 'reproceso' && !t.fin).length;
    return `${filtros()}
      <div class="card"><h3>Reprocesamiento · Preaprobado condicionado · ${mesTxt(S.mes)}</h3>
        <p class="muted small">Desde que la solicitud queda en PREAPROBADO CONDICIONADO hasta que el analista que la retoma la aprueba o rechaza. El reprocesamiento se le asigna a ese analista; la solicitud conserva el tiempo y el caso del analista que la dejó preaprobada.</p>
        ${notaTiempos()}${abiertos ? `<div class="nota">${abiertos} solicitudes siguen en preaprobado condicionado (esperando al promotor); se medirán cuando se resuelvan.</div>` : ''}
        ${tablaTiempos(grupos, meta)}</div>`;
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
    const C = S.C, M = DAC.metricas(C, S.D, d, h, { tipo: S.tipo }), meta = Number(C.cfg.meta_minutos);
    const tiempoProd = (p) => DAC.resumenTiempos(M.sols.filter((s) => !s.reestructura && (!p || s.producto === p)).map((s) => C.global(s)).filter(Boolean).map((g) => g.segundos), meta);
    const fila = (nom, x, R, cls = '') => `<tr class="${cls}"><td>${nom}</td><td class="num">${n0(x.n)}</td><td class="num">${n2(M.depto.diasHabiles)}</td><td class="num">${n2(x.porDia)}</td>
      <td class="num">${x.analistas}</td><td class="num">${n2(x.equiv)}</td><td class="num"><b>${n2(x.prod)}</b></td><td class="num">${dur(R.mediana)}</td><td class="num">${pct(R.enMeta)}</td></tr>`;
    return `${filtros({ producto: false })}
      <div class="card"><h3>Departamento de Análisis · ${mesTxt(S.mes)}</h3>
        <p class="muted small">${notaHoy(M)}</p>
        <div class="nota">Productividad = solicitudes que pasaron por POR ASIGNAR A ANALISTA ÷ días hábiles ÷ analistas.
          Los analistas se cuentan por su disponibilidad: si alguien tuvo vacaciones, cuenta solo por los días que estuvo.
          Por producto se usan solo las solicitudes de ese producto y los analistas asignados a él.</div>
        <div class="tabla"><table><thead><tr><th>Producto</th><th class="num">Solicitudes</th><th class="num">Días hábiles</th><th class="num">Solicitudes por día</th><th class="num">Analistas</th><th class="num">Analistas disponibles</th><th class="num">Productividad</th><th class="num">Tiempo mediano</th><th class="num">≤ ${meta} min</th></tr></thead><tbody>
        ${DAC.PRODUCTOS.map((p) => fila(prodTag(p), M.porProducto[p], tiempoProd(p))).join('')}
        ${fila('Departamento', M.depto, tiempoProd(null), 'total')}</tbody></table></div>
        <p class="muted small">Incluye ${n0(M.depto.reestructuras)} reestructuras (cuentan para productividad; no para tiempos).</p></div>
      <div class="card"><h3>Distribución del tiempo de la solicitud por producto</h3>${notaTiempos()}
        ${tablaTiempos(DAC.PRODUCTOS.map((p) => ({ nombre: prodTag(p), valores: M.sols.filter((s) => !s.reestructura && s.producto === p).map((s) => C.global(s)).filter(Boolean).map((g) => g.segundos) })), meta, 'Producto')}</div>`;
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
    const C = S.C, meta = Number(C.cfg.meta_minutos), yo = soloYo();
    const anios = [...new Set([Number(INICIO.slice(0, 4)), new Date().getFullYear()])];
    for (let y = anios[0]; y <= new Date().getFullYear(); y++) if (!anios.includes(y)) anios.push(y);
    const P = periodos(S.gran, S.anio);
    const filas = P.map((p) => {
      const M = DAC.metricas(C, S.D, p.desde, p.hasta, filtroDatos());
      const T = DAC.resumenTiempos(M.sols.filter((s) => !s.reestructura).map((s) => C.global(s)).filter(Boolean).map((g) => g.segundos), meta);
      return { ...p, M, T };
    });
    const seg = `<div class="seg">${[['mes', 'Mensual'], ['trimestre', 'Trimestral'], ['semestre', 'Semestral'], ['anio', 'Anual']].map(([k, t]) => `<button data-gran="${k}" class="${S.gran === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const selAnio = `<label>Año<select data-f="anio">${anios.sort().map((y) => `<option ${y === S.anio ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;
    const cabeza = `<div class="filtros"><label>Agrupar${seg}</label>${selAnio}
      <label>Producto<select data-f="producto"><option value="">Todos</option>${DAC.PRODUCTOS.map((p) => `<option ${p === S.producto ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>`;
    if (!filas.length) return cabeza + '<div class="card vacio">La información se acumula desde octubre 2026.</div>';
    const serie = (nom, color, f) => ({ nombre: nom, color, puntos: filas.map((r) => ({ x: r.nom, y: f(r) })) });
    const an = C.analistas.filter((a) => !yo || a.nombre === yo);
    const prodA = filas.map((r) => new Map(r.M.porAnalista.map((a) => [a.nombre, a])));
    return `${cabeza}
      <div class="card"><h3>Productividad acumulada</h3>
        ${yo ? GRAF.lineas([serie('Mi productividad', 'var(--s-pers)', (r) => r.M.porAnalista.find((a) => a.nombre === yo)?.prod ?? null), serie('Departamento', 'var(--s-pymes)', (r) => r.M.depto.prod)], { fmt: n2 })
          : GRAF.lineas(S.producto ? [serie(S.producto, COLOR[S.producto], (r) => r.M.porProducto[S.producto].prod)]
            : [serie('Departamento', 'var(--navy)', (r) => r.M.depto.prod), ...DAC.PRODUCTOS.map((p) => serie(p, COLOR[p], (r) => r.M.porProducto[p].prod))], { fmt: n2 })}
        <div class="tabla" style="margin-top:10px"><table><thead><tr><th>Período</th><th class="num">Solicitudes</th><th class="num">Días hábiles</th><th class="num">Analistas disp.</th><th class="num">Productividad</th>
          ${DAC.PRODUCTOS.map((p) => `<th class="num">${p}</th>`).join('')}<th class="num">Tiempo mediano</th><th class="num">≤ ${meta} min</th></tr></thead><tbody>
          ${filas.map((r) => `<tr><td>${r.nom}</td><td class="num">${n0(r.M.depto.n)}</td><td class="num">${n2(r.M.depto.diasHabiles)}</td><td class="num">${n2(r.M.depto.equiv)}</td><td class="num"><b>${n2(r.M.depto.prod)}</b></td>
            ${DAC.PRODUCTOS.map((p) => `<td class="num">${n2(r.M.porProducto[p].prod)}</td>`).join('')}<td class="num">${dur(r.T.mediana)}</td><td class="num">${pct(r.T.enMeta)}</td></tr>`).join('')}
          </tbody></table></div></div>
      <div class="card"><h3>Productividad por analista</h3><div class="tabla"><table><thead><tr><th>Analista</th>${filas.map((r) => `<th class="num">${r.nom}</th>`).join('')}</tr></thead><tbody>
        ${an.map((a) => `<tr><td>${esc(titulo(a.nombre))} <span class="muted small">${a.producto}</span></td>${prodA.map((m) => { const x = m.get(a.nombre); return `<td class="num" data-tip="${x ? `${x.n} solicitudes / ${n2(x.disp)} días` : ''}">${n2(x && x.prod)}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
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
              <label>Meta (min)<input type="number" name="meta_minutos" value="${cfg.meta_minutos}" min="1" style="width:80px"></label>
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

  const VISTAS = { dashboard, tiempos, reproceso, productividad, acumulado, global, calendario, admin: administracion };

  // ---------- Eventos ----------
  async function guardar(tabla, fila) { await API.guardar(tabla, fila); await recargar(); }
  async function recargar() {
    const D = await API.cargar();
    D.config = Object.fromEntries((D.config || []).map((c) => [c.clave, c.valor]));
    S.D = D; recalcular(); vista();
  }

  app.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    S[f] = f === 'anio' ? Number(e.target.value) : e.target.value;
    vista();
  });

  app.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.tab) { S.tab = b.dataset.tab; pintar(); return; }
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
      else if (act === 'actualizar') { b.disabled = true; await pedirActualizacion(); b.disabled = false; }
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
          { clave: 'meta_minutos', valor: Number(val('meta_minutos')) },
          { clave: 'cada_minutos', valor: Number(val('cada_minutos')) },
        ];
        await guardar('dac_config', filas);
        alert('Parámetros guardados.');
      } else if (act === 'guardarUsuario') {
        const tr = b.closest('tr');
        await API.editarUsuario(tr.dataset.usuario, $('[name=rol]', tr).value, $('[name=analista]', tr).value, $('[name=activo]', tr).checked);
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
          usuariosCache = null; vista(); alert(`Usuario creado. Ingresa con "${o.nombre.trim()}" y la contraseña 12345678.`);
          break;
      }
    } catch (err) { aviso(err); }
  });

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
