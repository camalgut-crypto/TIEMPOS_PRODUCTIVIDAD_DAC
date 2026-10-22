// Gráficos SVG livianos: columnas, líneas y barras horizontales, con tooltip al pasar el mouse.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tip = () => document.getElementById('tip');

  // Cualquier elemento con data-tip muestra su texto (HTML permitido) al pasar el mouse
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    const t = tip();
    if (!t) return;
    if (!el) { t.style.display = 'none'; return; }
    t.innerHTML = el.getAttribute('data-tip');
    t.style.display = 'block';
    const x = Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 8);
    t.style.left = x + 'px';
    t.style.top = (e.clientY - t.offsetHeight - 10 < 0 ? e.clientY + 16 : e.clientY - t.offsetHeight - 10) + 'px';
  });

  function escala(max) {
    if (!(max > 0)) return { max: 1, ticks: [0, 1] };
    const paso0 = max / 4, p = Math.pow(10, Math.floor(Math.log10(paso0)));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= paso0);
    const top = Math.ceil(max / paso) * paso;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += paso) ticks.push(+v.toFixed(6));
    return { max: top, ticks };
  }
  const corto = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : +v.toFixed(2) + '');

  // Columnas de una serie. datos: [{x, y, tip}]
  function columnas(datos, { alto = 220, color = 'var(--s-pers)', fmt = corto, marcarMax = true } = {}) {
    const W = 760, H = alto, m = { l: 34, r: 8, t: 18, b: 26 };
    const { max, ticks } = escala(Math.max(...datos.map((d) => d.y), 0));
    const bw = (W - m.l - m.r) / Math.max(datos.length, 1);
    const ancho = Math.min(24, bw * 0.7);
    const y = (v) => H - m.b - (v / max) * (H - m.t - m.b);
    const iMax = marcarMax ? datos.reduce((b, d, i) => (d.y > datos[b].y ? i : b), 0) : -1;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (const t of ticks) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    datos.forEach((d, i) => {
      const cx = m.l + bw * i + bw / 2, top = y(d.y), h = H - m.b - top;
      const r = Math.min(4, h);
      if (h > 0) s += `<path d="M${cx - ancho / 2},${H - m.b} V${top + r} q0,-${r} ${r},-${r} H${cx + ancho / 2 - r} q${r},0 ${r},${r} V${H - m.b} Z" fill="${color}"/>`;
      s += `<rect x="${cx - bw / 2}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" fill="transparent" data-tip="${esc(d.tip || `${d.x}: ${fmt(d.y)}`)}"/>`;
      if (datos.length <= 16 || i % Math.ceil(datos.length / 16) === 0) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.x)}</text>`;
      if (i === iMax && d.y > 0) s += `<text class="lbl" x="${cx}" y="${top - 5}" text-anchor="middle">${fmt(d.y)}</text>`;
    });
    return `<div class="chart">${s}<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="#B9BFCA"/></svg></div>`;
  }

  // Líneas. series: [{nombre, color, puntos: [{x, y}]}] (todas con las mismas x)
  function lineas(series, { alto = 240, fmt = corto } = {}) {
    const W = 760, H = alto, m = { l: 40, r: 70, t: 14, b: 26 };
    const xs = series[0] ? series[0].puntos.map((p) => p.x) : [];
    const vals = series.flatMap((s) => s.puntos.map((p) => p.y)).filter((v) => v != null);
    const { max, ticks } = escala(Math.max(...vals, 0));
    const px = (i) => m.l + (xs.length > 1 ? (i * (W - m.l - m.r)) / (xs.length - 1) : (W - m.l - m.r) / 2);
    const py = (v) => H - m.b - (v / max) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (const t of ticks) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${py(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    xs.forEach((x, i) => { s += `<text x="${px(i)}" y="${H - 8}" text-anchor="middle">${esc(x)}</text>`; });
    for (const se of series) {
      const pts = se.puntos.map((p, i) => (p.y == null ? null : [px(i), py(p.y)]));
      let d = '', abierto = false;
      pts.forEach((p) => { if (!p) { abierto = false; return; } d += (abierto ? 'L' : 'M') + p[0] + ',' + p[1]; abierto = true; });
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((p) => { if (p) s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${se.color}" stroke="#fff" stroke-width="2"/>`; });
      const ult = [...pts].reverse().find(Boolean);
      if (ult && series.length <= 4) s += `<text class="lbl" x="${ult[0] + 8}" y="${ult[1] + 4}">${esc(se.nombre)}</text>`;
    }
    // Zonas de hover por cada x con todos los valores
    xs.forEach((x, i) => {
      const w = xs.length > 1 ? (W - m.l - m.r) / (xs.length - 1) : W - m.l - m.r;
      const t = `<b>${esc(x)}</b><br>` + series.map((se) => `${esc(se.nombre)}: ${se.puntos[i].y == null ? '—' : fmt(se.puntos[i].y)}`).join('<br>');
      s += `<rect x="${px(i) - w / 2}" y="${m.t}" width="${w}" height="${H - m.t - m.b}" fill="transparent" data-tip="${esc(t)}"/>`;
    });
    const ley = series.length > 1 ? `<div class="leyenda">${series.map((se) => `<span><i style="background:${se.color}"></i>${esc(se.nombre)}</span>`).join('')}</div>` : '';
    return `${ley}<div class="chart">${s}</svg></div>`;
  }

  // Barras horizontales. datos: [{nombre, y, color, tip}]
  function barras(datos, { fmt = corto, max } = {}) {
    const top = max || Math.max(...datos.map((d) => d.y || 0), 0) || 1;
    return `<div class="hb">${datos.map((d) => `
      <div class="nom" title="${esc(d.nombre)}">${esc(d.nombre)}</div>
      <div class="bar" data-tip="${esc(d.tip || `${d.nombre}: ${fmt(d.y)}`)}"><b style="width:${Math.max(0, (100 * (d.y || 0)) / top)}%;background:${d.color || 'var(--s-pers)'}"></b></div>
      <div class="val">${d.y == null ? '—' : fmt(d.y)}</div>`).join('')}</div>`;
  }

  window.GRAF = { columnas, lineas, barras, esc };
})();
