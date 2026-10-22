"""Motor de tiempos del DAC: arma los tramos de cada analista a partir del histórico de estados.

Reglas (definidas por el usuario, aplicadas literalmente):
- Universo DAC: toda solicitud que pasó por POR ASIGNAR A ANALISTA.
- Tramo de análisis: inicia en ANALISTA ASIGNADO (el analista es quien registra ese estado) y termina en
  APROBADO / RECHAZADO POR ANALISTA, cualquier TUD, PRE ANALISIS o PREAPROBADO CONDICIONADO.
- El tiempo que la solicitud pasa en PENDIENTES no se le cuenta al analista.
- Tramo de reprocesamiento: inicia en PREAPROBADO CONDICIONADO y termina con la decisión del analista
  que retoma la solicitud (a ese analista se le asigna el reprocesamiento).
- Tiempo de la solicitud (global): el del último tramo de análisis; el caso queda a ese analista.
- Corte de mes: la solicitud pertenece al mes en que ingresó al DAC y se mide solo hasta el cierre de ese mes;
  lo que quede abierto se cierra en el corte (ej. entra 31 a las 13:50, va a análisis 13:55 → 5 min).
- Producto: PYMES, MOTO; todo lo demás es PERS. Reestructura: Monto Colocado 0 o 1 (no se miden tiempos,
  pero sí cuentan para productividad).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pandas as pd

POR_ASIGNAR = "POR ASIGNAR A ANALISTA"
ASIGNADO = "ANALISTA ASIGNADO"
EN_ANALISIS = "EN ANALISIS"
PENDIENTES = "PENDIENTES"
PRE_ANALISIS = "PRE ANALISIS"
PREAPROBADO = "PREAPROBADO CONDICIONADO"
DECISION = {"APROBADO POR ANALISTA", "RECHAZADO POR ANALISTA"}
CORTE = "CORTE DE MES"


def es_tud(estado: str) -> bool:
    return estado.startswith("TUD")


def es_fin_analisis(estado: str) -> bool:
    return estado in DECISION or es_tud(estado) or estado in (PRE_ANALISIS, PREAPROBADO)


def producto(tipo_credito: str) -> str:
    t = (tipo_credito or "").strip().upper()
    return t if t in ("PYMES", "MOTO") else "PERS"


class Jornada:
    """Horario hábil (L-V, sábado, horarios especiales por fecha) y feriados, para medir el tiempo en jornada."""

    def __init__(self, lv=("08:00", "18:00"), sab=("08:00", "14:00"), feriados: set[date] = frozenset(),
                 especiales: dict[date, tuple[str, str]] | None = None):
        a = lambda hhmm: time.fromisoformat(hhmm)
        self.lv, self.sab, self.feriados = (a(lv[0]), a(lv[1])), (a(sab[0]), a(sab[1])), set(feriados)
        self.especiales = {d: (a(v[0]), a(v[1])) for d, v in (especiales or {}).items()}

    def ventana(self, d: date):
        if d in self.especiales:  # p. ej. un día que el DAC cierra a las 8:00 pm, o un domingo de campaña
            return self.especiales[d]
        if d in self.feriados or d.weekday() == 6:
            return None
        return self.sab if d.weekday() == 5 else self.lv

    def segundos(self, a: datetime, b: datetime) -> float:
        total, d = 0.0, a.date()
        while d <= b.date():
            v = self.ventana(d)
            if v:
                ini, fin = max(a, datetime.combine(d, v[0])), min(b, datetime.combine(d, v[1]))
                total += max(0.0, (fin - ini).total_seconds())
            d += timedelta(days=1)
        return total


def _por_estado(filas: list[dict], i0: int, i1: int, jornada: Jornada) -> dict:
    """Tiempo entre la fila i0 y la i1 agrupado por el estado en que estuvo: {estado: [reloj, jornada]}."""
    out: dict[str, list[float]] = {}
    for k in range(i0, i1):
        a, b = filas[k]["t"], filas[k + 1]["t"]
        acc = out.setdefault(filas[k]["estado"], [0.0, 0.0])
        acc[0] += (b - a).total_seconds()
        acc[1] += jornada.segundos(a, b)
    return {e: [round(v[0], 1), round(v[1], 1)] for e, v in out.items()}


def _tramo(sol, tipo, analista, filas, i0, i1, fin_estado, jornada):
    estados = _por_estado(filas, i0, i1, jornada) if i1 is not None else None
    ini, fin = filas[i0]["t"], (filas[i1]["t"] if i1 is not None else None)
    seg = sum(v[0] for e, v in estados.items() if e != PENDIENTES) if estados is not None else None
    return {
        "solicitud": sol, "tipo": tipo, "analista": analista,
        "inicio": ini, "fin": fin, "fin_estado": fin_estado,
        "segundos": seg, "estados": estados,
        "cruza_dia": bool(fin is not None and fin.date() != ini.date()),
    }


def _quien(filas: list[dict], ana: tuple[str, int], i1: int | None) -> str:
    """Analista del tramo: quien lo trabaja (primer EN ANALISIS o la decisión), no quien asignó.
    De enero a abril 2026 la jefatura registraba ANALISTA ASIGNADO y el analista hacía el análisis."""
    fin = len(filas) if i1 is None else i1 + 1
    for g in filas[ana[1] + 1:fin]:
        if g["estado"] == EN_ANALISIS or g["estado"] in DECISION:
            return g["usuario"]
    return ana[0]


def tramos_solicitud(sol: int, filas: list[dict], jornada: Jornada) -> list[dict]:
    tramos = []
    ana = None    # (analista, índice de inicio) del tramo de análisis abierto
    rep = None    # índice de inicio del reprocesamiento abierto
    for i, f in enumerate(filas):
        est, usr = f["estado"], f["usuario"]
        if est == CORTE:
            if rep is not None:
                quien = next((g["usuario"] for g in filas[rep + 1:i] if g["estado"] == EN_ANALISIS), None)
                tramos.append(_tramo(sol, "reproceso", quien, filas, rep, i, CORTE, jornada))
            if ana is not None:
                tramos.append(_tramo(sol, "analisis", _quien(filas, ana, i), filas, ana[1], i, CORTE, jornada))
            return tramos
        if rep is not None and i > rep:
            if est in DECISION or es_tud(est) or est in (PRE_ANALISIS, PREAPROBADO, ASIGNADO, POR_ASIGNAR):
                # El reprocesamiento es de quien retoma: el que decide, o el primero que lo pone EN ANALISIS.
                quien = usr if est in DECISION or est == PREAPROBADO else next(
                    (g["usuario"] for g in filas[rep + 1:i + 1] if g["estado"] == EN_ANALISIS), usr)
                fin = est if est not in (ASIGNADO, POR_ASIGNAR) else f"INTERRUMPIDO ({est})"
                tramos.append(_tramo(sol, "reproceso", quien, filas, rep, i, fin, jornada))
                rep = None
        if ana is not None:
            if est == ASIGNADO:
                tramos.append(_tramo(sol, "analisis", _quien(filas, ana, i), filas, ana[1], i, "REASIGNADA", jornada))
                ana = None
            elif est == POR_ASIGNAR:
                tramos.append(_tramo(sol, "analisis", _quien(filas, ana, i), filas, ana[1], i, "DEVUELTA A COLA", jornada))
                ana = None
            elif es_fin_analisis(est):
                tramos.append(_tramo(sol, "analisis", _quien(filas, ana, i), filas, ana[1], i, est, jornada))
                ana = None
        if est == ASIGNADO:
            ana = (usr, i)
        if est == PREAPROBADO and rep is None:
            rep = i
    if ana is not None:
        tramos.append(_tramo(sol, "analisis", _quien(filas, ana, None), filas, ana[1], None, "EN CURSO", jornada))
    if rep is not None:
        quien = next((g["usuario"] for g in filas[rep + 1:] if g["estado"] == EN_ANALISIS), None)
        tramos.append(_tramo(sol, "reproceso", quien, filas, rep, None, "EN CURSO", jornada))
    return tramos


def calcular(historico: pd.DataFrame, bitacora: pd.DataFrame,
             jornada: Jornada | None = None, ahora: datetime | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devuelve (solicitudes, tramos) del universo DAC."""
    jornada = jornada or Jornada()
    ahora = ahora or datetime.now()
    h = historico.rename(columns={"SOLICITUD": "sol", "ESTADO": "estado", "FECHA MODIFICACION": "t",
                                  "USUARIO MODIFICA": "usuario", "FECHA CREACION": "creada"})
    h["estado"] = h["estado"].str.strip().str.upper()
    h["usuario"] = h["usuario"].fillna("").str.strip().str.upper()
    h = h.reset_index(drop=True)
    h["orden"] = h.index
    h = h.sort_values(["sol", "t", "orden"], kind="stable")
    dac = set(h.loc[h["estado"] == POR_ASIGNAR, "sol"])
    h = h[h["sol"].isin(dac)]

    b = bitacora.copy()
    b["Num_Solicitud"] = b["Num_Solicitud"].astype("int64")
    info = b.groupby("Num_Solicitud").agg(
        tipo_credito=("Tipo_Credito", "first"), monto_colocado=("Monto_Colocado", "first"),
        estado_actual=("Estado", "first"), promotor=("Promotor", "first"), sucursal=("Suc_Origen", "first"))

    tramos, sols = [], []
    for sol, g in h.groupby("sol", sort=False):
        filas = g[["estado", "usuario", "t"]].to_dict("records")
        ingreso = next(f["t"] for f in filas if f["estado"] == POR_ASIGNAR)
        corte = datetime(ingreso.year + ingreso.month // 12, ingreso.month % 12 + 1, 1)
        if corte <= ahora:  # mes cerrado: lo posterior al corte no cuenta
            filas = [f for f in filas if f["t"] < corte] + [{"estado": CORTE, "usuario": "", "t": pd.Timestamp(corte)}]
        tr = tramos_solicitud(int(sol), filas, jornada)
        tramos.extend(tr)
        cerrados = [x for x in tr if x["tipo"] == "analisis" and x["fin"] is not None]
        ultimo = cerrados[-1] if cerrados else None
        decisiones = [f for f in filas if f["estado"] in DECISION or es_tud(f["estado"])]  # punto final: última decisión
        i_ = info.loc[sol] if sol in info.index else None
        mc = float(i_["monto_colocado"]) if i_ is not None and pd.notna(i_["monto_colocado"]) else None
        tc = (i_["tipo_credito"] if i_ is not None else None) or ""
        sols.append({
            "solicitud": int(sol),
            "creada": g["creada"].iloc[0],
            "ingreso_dac": ingreso,
            "tipo_credito": tc.strip().upper() or None,
            "producto": producto(tc),
            "reestructura": mc in (0.0, 1.0),
            "monto_colocado": mc,
            "estado_actual": i_["estado_actual"] if i_ is not None else None,
            "promotor": i_["promotor"] if i_ is not None else None,
            "sucursal": i_["sucursal"] if i_ is not None else None,
            "analista_final": ultimo["analista"] if ultimo else None,
            "segundos_global": ultimo["segundos"] if ultimo else None,
            "fin_global": ultimo["fin_estado"] if ultimo else None,
            "segundos_reproceso": sum(x["segundos"] or 0 for x in tr if x["tipo"] == "reproceso") or None,
            "decision": decisiones[-1]["estado"] if decisiones else None,
            "fecha_decision": decisiones[-1]["t"] if decisiones else None,
            "segundos_total": ((decisiones[-1]["t"] - g["t"].iloc[0]).total_seconds() if decisiones else None),
            "n_analistas": len({x["analista"] for x in tr if x["analista"]}),
        })
    return pd.DataFrame(sols), pd.DataFrame(tramos)
