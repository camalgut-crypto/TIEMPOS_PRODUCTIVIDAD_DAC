"""Motor de tiempos del DAC: arma los tramos de cada analista a partir del histórico de estados.

Reglas (definidas por el usuario, aplicadas literalmente):
- Universo DAC: toda solicitud que pasó por POR ASIGNAR A ANALISTA.
- Tramo de análisis: inicia en ANALISTA ASIGNADO (el analista es quien registra ese estado) y termina en
  APROBADO / RECHAZADO POR ANALISTA, cualquier TUD, PRE ANALISIS o PREAPROBADO CONDICIONADO.
- El tiempo que la solicitud pasa en PENDIENTES no se le cuenta al analista.
- Tramo de reprocesamiento: inicia en PREAPROBADO CONDICIONADO y termina con la decisión del analista
  que retoma la solicitud (a ese analista se le asigna el reprocesamiento).
- Tiempo de la solicitud (global): el del último tramo de análisis; el caso queda a ese analista.
- Mes de tiempos y productividad (26-oct): sin corte de mes; la solicitud se cuenta completa en el mes de su última
  decisión. Sin decisión, en el último mes en que tuvo un estado del DAC (si hoy está en uno, en el mes en curso).
  Los ingresos siguen contándose por la fecha de ingreso al DAC.
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
MOTOR = {"APROBADO POR MOTOR", "RECHAZADO POR MOTOR"}
# Decisiones que cierran el ciclo del analista (RECHAZADO POR RECEPCION / RESOLUCION: indicado por el usuario 22-oct)
DECISION = {"APROBADO POR ANALISTA", "RECHAZADO POR ANALISTA", "RECHAZADO POR RECEPCION", "RECHAZADO RESOLUCION"}


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
    cola = False  # está en POR ASIGNAR sin que nadie la haya tomado
    for i, f in enumerate(filas):
        est, usr = f["estado"], f["usuario"]
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
            ana, cola = (usr, i), False
        elif est == POR_ASIGNAR:
            cola = True
        elif est == EN_ANALISIS and cola and ana is None and rep is None:
            # El analista la toma de la cola sin registrar ANALISTA ASIGNADO (ej. 1179971): el tramo inicia en EN ANALISIS
            ana, cola = (usr, i), False
        if est == PREAPROBADO and rep is None:
            rep = i
    if ana is not None:
        tramos.append(_tramo(sol, "analisis", _quien(filas, ana, None), filas, ana[1], None, "EN CURSO", jornada))
    if rep is not None:
        quien = next((g["usuario"] for g in filas[rep + 1:] if g["estado"] == EN_ANALISIS), None)
        tramos.append(_tramo(sol, "reproceso", quien, filas, rep, None, "EN CURSO", jornada))
    return tramos


def _historico(historico: pd.DataFrame) -> pd.DataFrame:
    h = historico.rename(columns={"SOLICITUD": "sol", "ESTADO": "estado", "FECHA MODIFICACION": "t",
                                  "USUARIO MODIFICA": "usuario", "FECHA CREACION": "creada"})
    h["estado"] = h["estado"].str.strip().str.upper()
    h["usuario"] = h["usuario"].fillna("").str.strip().str.upper()
    h = h.reset_index(drop=True)
    h["orden"] = h.index
    return h.sort_values(["sol", "t", "orden"], kind="stable")


def _info(bitacora: pd.DataFrame) -> pd.DataFrame:
    b = bitacora.copy()
    b["Num_Solicitud"] = b["Num_Solicitud"].astype("int64")
    return b.groupby("Num_Solicitud").agg(
        tipo_credito=("Tipo_Credito", "first"), monto_colocado=("Monto_Colocado", "first"),
        monto_aprobado=("Monto_Aprobado", "first"), estado_actual=("Estado", "first"),
        promotor=("Promotor", "first"), sucursal=("Suc_Origen", "first"))


def _num(v):
    return float(v) if v is not None and pd.notna(v) else None


# ---------- Ciclo de la solicitud por departamento (vista del gerente) ----------
# Departamento responsable del tiempo que la solicitud pasa en cada estado (tabla del DAC, 23-oct).
# Los estados que no están aquí (ANULADO, APROBADO INFORMA, CREACIÓN DE NUEVO ID, TUD, VENCIDO y cualquier otro)
# son del departamento de quien pasó la solicitud a ese estado. Después de la resolución del motor (aprobado o
# rechazado por motor) el seguimiento es de Comercial (indicado por el usuario 23-oct).
DEPTO_ESTADO = {
    **dict.fromkeys(["ANALISTA ASIGNADO", "APROBADO", "APROBADO POR ANALISTA", "AUDITADO",
                     "EN ANALISIS", "POR ASIGNAR A ANALISTA", "PREAPROBADO CONDICIONADO", "RECHAZADO",
                     "RECHAZADO POR ANALISTA", "RECHAZADO POR RECEPCION", "RECHAZADO RESOLUCION",
                     "RESOLUCION APROBADA", "REVISADO", "REVISION APROBADOR", "VERIFICADOR MOTORIZADO"], "DAC"),
    **dict.fromkeys(["APROBADO ASALARIADO", "DEVUELTO GERENCIA", "EN ESTUDIO", "ENVIADO", "FORMALIZADO", "PENDIENTES",
                     "PRE ANALISIS", "RECHAZADO POR ASESOR", "APROBADO POR MOTOR", "RECHAZADO POR MOTOR"], "COMERCIAL"),
}
# Quien registra alguno de estos estados es personal del DAC (analistas, jefatura, auditores)
ESTADOS_DE_PERSONAL_DAC = {"ANALISTA ASIGNADO", "EN ANALISIS", "APROBADO POR ANALISTA", "RECHAZADO POR ANALISTA",
                           "PREAPROBADO CONDICIONADO", "AUDITADO", "REVISADO", "EXPEDIENTE COMPLETO", "EXPEDIENTE INCOMPLETO"}


def es_final(estado: str) -> bool:
    """La solicitud terminó su ciclo de cara al cliente: formalizada (lo posterior, como revisado, expedientes y
    auditado, ya no cuenta; indicado por el usuario 23-oct), rechazada, TUD, anulada, vencida o creada con nuevo ID."""
    return (estado in ("FORMALIZADO", "AUDITADO", "ANULADO", "VENCIDO") or estado.startswith("RECHAZADO")
            or es_tud(estado) or estado.startswith("CREACI"))


def usuarios_dac(historico: pd.DataFrame) -> set[str]:
    h = _historico(historico)
    return set(h.loc[h["estado"].isin(ESTADOS_DE_PERSONAL_DAC), "usuario"]) - {""}


def depto(estado: str, usuario: str, personal: set[str]) -> str:
    if estado.startswith("EXPEDIENTE"):
        return "DAC"
    return DEPTO_ESTADO.get(estado) or ("DAC" if usuario in personal else "COMERCIAL")


def ciclo(filas: list[dict], personal: set[str], jornada: Jornada, ahora: datetime) -> dict:
    """De la creación al fin del ciclo (o hasta ahora si sigue en proceso): tiempo por estado y departamento.
    est = {"ESTADO|DEPTO": [segundos reloj, segundos jornada]}."""
    i = next((k for k, f in enumerate(filas) if f["estado"] == "FORMALIZADO"), None)
    if i is not None:  # de cara al cliente el ciclo termina al formalizar
        filas = filas[:i + 1]
    final = es_final(filas[-1]["estado"])
    tiempos = [f["t"] for f in filas] + ([] if final else [pd.Timestamp(ahora)])
    est: dict[str, list[float]] = {}
    for k in range(len(tiempos) - 1):
        a, b = tiempos[k], tiempos[k + 1]
        if b <= a:
            continue
        f = filas[k]
        acc = est.setdefault(f"{f['estado']}|{depto(f['estado'], f['usuario'], personal)}", [0.0, 0.0])
        acc[0] += (b - a).total_seconds()
        acc[1] += jornada.segundos(a, b)
    return {"fin": filas[-1]["estado"], "final": final, "t_fin": tiempos[-1].isoformat(timespec="seconds"),
            "est": {k: [round(v[0]), round(v[1])] for k, v in est.items()}}


def _ultimo_dac(filas: list[dict], personal: set[str], ahora: datetime):
    """Solicitud sin decisión: última fecha en que estuvo en un estado del DAC (hoy, si sigue en uno).
    Ej.: queda en PENDIENTES el 30-sep y el 2-oct pasa a EN ANALISIS → cuenta en octubre (indicado por el usuario 26-oct)."""
    k = max(i for i, f in enumerate(filas) if depto(f["estado"], f["usuario"], personal) == "DAC")
    return filas[k + 1]["t"] if k + 1 < len(filas) else pd.Timestamp(ahora)


def calcular(historico: pd.DataFrame, bitacora: pd.DataFrame,
             jornada: Jornada | None = None, ahora: datetime | None = None,
             personal: set[str] | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devuelve (solicitudes, tramos) del universo DAC."""
    jornada = jornada or Jornada()
    ahora = ahora or datetime.now()
    personal = personal if personal is not None else usuarios_dac(historico)
    h = _historico(historico)
    dac = set(h.loc[h["estado"] == POR_ASIGNAR, "sol"])
    h = h[h["sol"].isin(dac)]
    info = _info(bitacora)

    tramos, sols = [], []
    for sol, g in h.groupby("sol", sort=False):
        filas = g[["estado", "usuario", "t"]].to_dict("records")
        ultimo_cambio = filas[-1]  # estado en que está hoy (para la cartera actual)
        ciclo_sol = ciclo(filas, personal, jornada, ahora)
        ingreso = next(f["t"] for f in filas if f["estado"] == POR_ASIGNAR)
        tr = tramos_solicitud(int(sol), filas, jornada)
        tramos.extend(tr)
        cerrados = [x for x in tr if x["tipo"] == "analisis" and x["fin"] is not None]
        ultimo = cerrados[-1] if cerrados else None
        decisiones = [f for f in filas if f["estado"] in DECISION or es_tud(f["estado"])]  # punto final: última decisión
        i_ = info.loc[sol] if sol in info.index else None
        mc = _num(i_["monto_colocado"]) if i_ is not None else None
        tc = (i_["tipo_credito"] if i_ is not None else None) or ""
        sols.append({
            "solicitud": int(sol),
            "creada": g["creada"].iloc[0],
            "ingreso_dac": ingreso,
            "tipo_credito": tc.strip().upper() or None,
            "producto": producto(tc),
            "reestructura": mc in (0.0, 1.0),
            "monto_colocado": mc,
            "monto_aprobado": _num(i_["monto_aprobado"]) if i_ is not None else None,
            "estado_actual": i_["estado_actual"] if i_ is not None else None,
            "ultimo_estado": ultimo_cambio["estado"],
            "ultimo_cambio": ultimo_cambio["t"],
            "ultimo_usuario": ultimo_cambio["usuario"] or None,
            "promotor": i_["promotor"] if i_ is not None else None,
            "sucursal": i_["sucursal"] if i_ is not None else None,
            "analista_final": ultimo["analista"] if ultimo else None,
            "segundos_global": ultimo["segundos"] if ultimo else None,
            "fin_global": ultimo["fin_estado"] if ultimo else None,
            "segundos_reproceso": sum(x["segundos"] or 0 for x in tr if x["tipo"] == "reproceso") or None,
            "decision": decisiones[-1]["estado"] if decisiones else None,
            "fecha_decision": decisiones[-1]["t"] if decisiones else None,
            "segundos_total": ((decisiones[-1]["t"] - g["t"].iloc[0]).total_seconds() if decisiones else None),
            "fecha_cuenta": decisiones[-1]["t"] if decisiones else _ultimo_dac(filas, personal, ahora),
            "n_analistas": len({x["analista"] for x in tr if x["analista"]}),
            "ciclo": ciclo_sol,
        })
    return pd.DataFrame(sols), pd.DataFrame(tramos)


def _resolucion_motor(g: pd.DataFrame):
    """(índice de la resolución del motor, segundos desde ENVIADO) o (None, None)."""
    est = g["estado"].tolist()
    i = next((k for k, e in enumerate(est) if e in MOTOR), None)
    if i is None:
        return None, None
    j = next((k for k, e in enumerate(est[:i]) if e == "ENVIADO"), 0)
    return i, (g["t"].iloc[i] - g["t"].iloc[j]).total_seconds()


def flujo_rapido(historico: pd.DataFrame, bitacora: pd.DataFrame, jornada: Jornada | None = None,
                 ahora: datetime | None = None, personal: set[str] | None = None) -> pd.DataFrame:
    """Flujo Rápido (motor de decisiones): solicitudes con resolución del motor (aprobado o rechazado por motor)
    que después siguieron a otro estado (formalizado, TUD, anulado, pre análisis, etc.) sin pasar por
    POR ASIGNAR A ANALISTA. Es del motor aunque la jefatura haya intervenido (indicado por el usuario 23-oct);
    no cuenta en los tiempos ni en la productividad del DAC."""
    jornada = jornada or Jornada()
    ahora = ahora or datetime.now()
    personal = personal if personal is not None else usuarios_dac(historico)
    h = _historico(historico)
    info = _info(bitacora)
    out = []
    for sol, g in h.groupby("sol", sort=False):
        est = g["estado"].tolist()
        if POR_ASIGNAR in est:
            continue
        i, seg = _resolucion_motor(g)
        if i is None or not any(e not in MOTOR for e in est[i + 1:]):
            continue
        i_ = info.loc[sol] if sol in info.index else None
        tc = (i_["tipo_credito"] if i_ is not None else None) or ""
        creada = g["creada"].iloc[0]
        out.append({
            "solicitud": int(sol), "periodo": creada.strftime("%Y-%m"), "creada": creada,
            "resolucion": est[i], "fecha_resolucion": g["t"].iloc[i],
            "tipo_credito": tc.strip().upper() or None, "producto": producto(tc),
            "monto_aprobado": _num(i_["monto_aprobado"]) if i_ is not None else None,
            "estado_actual": i_["estado_actual"] if i_ is not None else None,
            "ultimo_estado": est[-1], "seg_motor": round(seg, 1),
            "ciclo": ciclo(g[["estado", "usuario", "t"]].to_dict("records"), personal, jornada, ahora),
        })
    return pd.DataFrame(out, columns=["solicitud", "periodo", "creada", "resolucion", "fecha_resolucion", "tipo_credito",
                                      "producto", "monto_aprobado", "estado_actual", "ultimo_estado", "seg_motor", "ciclo"])


LIMITE_MOTOR = 60  # el motor no debe tardar más de 1 minuto en resolver


def tiempos_motor(historico: pd.DataFrame, bitacora: pd.DataFrame, dac: set[int], rapido: set[int]):
    """Tiempo del motor (de ENVIADO a APROBADO / RECHAZADO POR MOTOR) de todas las solicitudes que resolvió.
    Devuelve (resumen por día, producto, resolución y camino; solicitudes que pasaron de 1 minuto)."""
    h = _historico(historico)
    info = _info(bitacora)
    filas = []
    for sol, g in h.groupby("sol", sort=False):
        i, seg = _resolucion_motor(g)
        if i is None:
            continue
        tc = info.loc[sol, "tipo_credito"] if sol in info.index else ""
        filas.append({"solicitud": int(sol), "periodo": g["creada"].iloc[0].strftime("%Y-%m"),
                      "fecha": g["t"].iloc[i].date().isoformat(), "fecha_resolucion": g["t"].iloc[i],
                      "creada": g["creada"].iloc[0], "producto": producto(tc or ""), "resolucion": g["estado"].iloc[i],
                      "camino": "dac" if sol in dac else "rapido" if sol in rapido else "otro", "segundos": seg})
    m = pd.DataFrame(filas, columns=["solicitud", "periodo", "fecha", "fecha_resolucion", "creada", "producto",
                                     "resolucion", "camino", "segundos"])
    s = m["segundos"]
    m = m.assign(b10=s <= 10, b20=(s > 10) & (s <= 20), b30=(s > 20) & (s <= 30),
                 b60=(s > 30) & (s <= LIMITE_MOTOR), bmas=s > LIMITE_MOTOR)
    res = m.groupby(["periodo", "fecha", "producto", "resolucion", "camino"], as_index=False).agg(
        n=("solicitud", "size"), seg_total=("segundos", "sum"), seg_max=("segundos", "max"),
        b10=("b10", "sum"), b20=("b20", "sum"), b30=("b30", "sum"), b60=("b60", "sum"), bmas=("bmas", "sum"))
    res[["seg_total", "seg_max"]] = res[["seg_total", "seg_max"]].round(1)
    lentas = m[m["bmas"]][["solicitud", "periodo", "creada", "fecha_resolucion", "producto", "resolucion", "camino", "segundos"]]
    return res, lentas.round({"segundos": 1})


def resumen_bitacora(bitacora: pd.DataFrame, dac: set[int], rapido: set[int]) -> pd.DataFrame:
    """Todos los créditos que ingresaron en el mes (bitácora), por mes de creación, producto, estado actual y
    camino (dac / rapido / otro): cantidad y monto aprobado. Es la base del módulo de capacidad instalada."""
    b = bitacora.copy()
    b["Num_Solicitud"] = b["Num_Solicitud"].astype("int64")
    b = b.drop_duplicates("Num_Solicitud")
    b["periodo"] = pd.to_datetime(b["Fecha_creacion"]).dt.strftime("%Y-%m")
    b["producto"] = b["Tipo_Credito"].map(producto)
    b["estado"] = b["Estado"].fillna("").str.strip().str.upper()
    b["camino"] = ["dac" if s in dac else "rapido" if s in rapido else "otro" for s in b["Num_Solicitud"]]
    b["monto_aprobado"] = pd.to_numeric(b["Monto_Aprobado"], errors="coerce").fillna(0)
    r = b.groupby(["periodo", "producto", "estado", "camino"], as_index=False).agg(
        n=("Num_Solicitud", "size"), monto_aprobado=("monto_aprobado", "sum"))
    r["monto_aprobado"] = r["monto_aprobado"].round(2)
    return r
