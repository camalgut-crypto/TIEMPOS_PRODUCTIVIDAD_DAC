"""Actualiza Tiempos DAC: ejecuta las dos consultas, calcula los tramos y los sube a Supabase.

Uso:
  actualizar.py --una-vez      ejecuta una actualización
  actualizar.py --escuchar     queda atendiendo el botón "Actualizar" de la app (y actualiza solo cada N minutos)
  actualizar.py --configurar   guarda la contraseña del usuario de sistema en el Administrador de credenciales
  actualizar.py --historico    carga una sola vez los meses anteriores (consultas "anual"), sin tocar usuarios
  actualizar.py --local        genera public/local/datos.json para revisar la app sin Supabase
"""
import argparse
import getpass
import json
import logging
import sys
import time as reloj
from datetime import date, datetime
from pathlib import Path

import keyring
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tiempos_dac.conexion import RAIZ, consultar, leer_config  # noqa: E402
from tiempos_dac.motor import Jornada, calcular, flujo_rapido, resumen_bitacora, tiempos_motor, usuarios_dac  # noqa: E402

LOG = RAIZ / "worker" / "logs" / "actualizar.log"
# Jefatura del DAC (personal del DAC para el ciclo por departamento; se puede cambiar en dac_config.jefatura)
JEFATURA = ["HILCIA PAOLA MORALES MENDEZ", "KATHERINE GISSELL MORA GARCIA"]


def _json(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT:
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat(timespec="seconds")
    if hasattr(v, "item"):
        return v.item()
    return v


def _registros(df: pd.DataFrame) -> list[dict]:
    return [{k: _json(v) for k, v in r.items()} for r in df.to_dict("records")]


def procesar(cfg: dict, jornada: Jornada, personal_dac: set[str], historico: bool = False) -> dict:
    sql = {k: (RAIZ / v).read_text(encoding="utf-8-sig")
           for k, v in cfg["consultas_historico" if historico else "consultas"].items()}
    t0 = reloj.time()
    bit = consultar(cfg["servidor"], sql["bitacora"])
    his = consultar(cfg["servidor"], sql["historico"])
    logging.info("Consultas: bitácora %s filas, histórico %s filas (%.0f s)", len(bit), len(his), reloj.time() - t0)
    if historico:
        # La consulta anual viene ordenada de la más reciente a la más antigua; se invierte para que los cambios
        # con la misma hora queden en el mismo orden que en la consulta mensual.
        his = his.iloc[::-1].reset_index(drop=True)
    # Solo los meses que traen las dos consultas: la bitácora anual llega hasta hoy y el histórico anual solo hasta el
    # mes anterior. Si no, el mes en curso se borraría de las tablas del Flujo Rápido y del motor sin volver a cargarse.
    meses = set(pd.to_datetime(his["FECHA CREACION"]).dt.strftime("%Y-%m"))
    bit = bit[pd.to_datetime(bit["Fecha_creacion"]).dt.strftime("%Y-%m").isin(meses)]
    # Personal del DAC: analistas registrados, jefatura y quien registra estados del DAC (analistas anteriores, auditores)
    personal = personal_dac | usuarios_dac(his)
    sol, tr = calcular(his, bit, jornada, personal=personal)
    sol["periodo"] = sol["ingreso_dac"].dt.strftime("%Y-%m")
    sol = sol[["solicitud", "periodo", "creada", "ingreso_dac", "tipo_credito", "producto", "reestructura",
               "monto_colocado", "monto_aprobado", "estado_actual", "promotor", "sucursal", "decision", "fecha_decision",
               "segundos_total", "fecha_cuenta", "ultimo_estado", "ultimo_cambio", "ultimo_usuario", "ciclo"]]
    rap = flujo_rapido(his, bit, jornada, personal=personal)
    res = resumen_bitacora(bit, set(sol["solicitud"]), set(rap["solicitud"]))
    mot, lentas = tiempos_motor(his, bit, set(sol["solicitud"]), set(rap["solicitud"]))
    tr["n"] = tr.groupby("solicitud").cumcount() + 1
    tr = tr[["solicitud", "n", "tipo", "analista", "inicio", "fin", "fin_estado", "estados", "cruza_dia"]]
    logging.info("Universo DAC: %s solicitudes, %s tramos; Flujo Rápido: %s; bitácora: %s créditos; motor: %s (%s de más de 1 min)",
                 len(sol), len(tr), len(rap), int(res["n"].sum()), int(mot["n"].sum()), len(lentas))
    return {"solicitudes": _registros(sol), "tramos": _registros(tr), "flujo": _registros(rap),
            "resumen": _registros(res), "motor": _registros(mot), "lentas": _registros(lentas),
            "periodos": sorted(set(res["periodo"]) | set(mot["periodo"]))}


def personal_nube(sb) -> set[str]:
    conf = {c["clave"]: c["valor"] for c in sb.leer("dac_config")}
    return {a["nombre"] for a in sb.leer("dac_analistas")} | set(conf.get("jefatura", JEFATURA))


def cargar_extra(sb, R: dict):
    """Flujo Rápido, resumen de la bitácora y tiempos del motor; si las tablas aún no existen, se avisa y sigue.
    Un mes por llamada: el Flujo Rápido trae todas las resoluciones del motor (unas 7 mil por mes)."""
    de = lambda k, p: [r for r in R[k] if r["periodo"] == p]
    try:
        for p in R["periodos"]:
            sb.rpc("dac_cargar_extra", {"p_periodos": [p], "p_flujo": de("flujo", p), "p_resumen": de("resumen", p),
                                        "p_motor": de("motor", p), "p_lentas": de("lentas", p)})
    except Exception as e:
        logging.warning("No se cargó Flujo Rápido / bitácora / motor (¿falta ejecutar la migración en supabase/?): %s", e)


def jornada_nube(sb) -> Jornada:
    conf = {c["clave"]: c["valor"] for c in sb.leer("dac_config")}
    j = conf.get("jornada", {})
    feriados = {date.fromisoformat(f["fecha"]) for f in sb.leer("dac_feriados") if float(f["valor"]) == 0}
    especiales = {date.fromisoformat(x["fecha"]): (x["inicio"][:5], x["fin"][:5]) for x in sb.leer("dac_horarios")}
    return Jornada(j.get("lv", ("08:00", "18:00")), j.get("sab", ("08:00", "14:00")), feriados, especiales)


def actualizar_nube(cfg: dict, sb, pedido: int | None = None):
    ahora = lambda: datetime.now().astimezone().isoformat()
    if pedido:
        sb.actualizar("dac_actualizaciones", f"id=eq.{pedido}", {"estado": "procesando", "iniciado_en": ahora()})
    try:
        R = procesar(cfg, jornada_nube(sb), personal_nube(sb))
        n = sb.rpc("dac_cargar", {"p_solicitudes": R["solicitudes"], "p_tramos": R["tramos"]})
        cargar_extra(sb, R)
        msg = f"{len(R['solicitudes'])} solicitudes y {n} tramos cargados; Flujo Rápido {len(R['flujo'])}"
        logging.info(msg)
        if pedido:
            sb.actualizar("dac_actualizaciones", f"id=eq.{pedido}", {"estado": "ok", "terminado_en": ahora(), "mensaje": msg})
    except Exception as e:
        logging.exception("Error en la actualización")
        if pedido:
            sb.actualizar("dac_actualizaciones", f"id=eq.{pedido}",
                          {"estado": "error", "terminado_en": ahora(), "mensaje": str(e)[:500]})
        raise


def cargar_historico(cfg: dict, sb, lote: int = 1000):
    """Carga única de los meses anteriores (consultas *anual.sql), en lotes para no exceder el tamaño de la llamada."""
    R = procesar(cfg, jornada_nube(sb), personal_nube(sb), historico=True)
    sols, trs = R["solicitudes"], R["tramos"]
    por_sol: dict[int, list[dict]] = {}
    for t in trs:
        por_sol.setdefault(t["solicitud"], []).append(t)
    total = 0
    for i in range(0, len(sols), lote):
        parte = sols[i:i + lote]
        total += sb.rpc("dac_cargar", {"p_solicitudes": parte,
                                       "p_tramos": [t for s in parte for t in por_sol.get(s["solicitud"], [])]})
        logging.info("Histórico: %s de %s solicitudes cargadas", min(i + lote, len(sols)), len(sols))
    cargar_extra(sb, R)
    logging.info("Histórico cargado: %s solicitudes y %s tramos", len(sols), total)


def escuchar(cfg: dict):
    from tiempos_dac.nube import Supabase
    ultima = 0.0
    while True:
        try:
            sb = Supabase(cfg["supabase"])  # nuevo token en cada vuelta: no caduca aunque quede días encendido
            pend = sb.leer("dac_actualizaciones", "&estado=eq.pendiente&order=id")
            conf = {c["clave"]: c["valor"] for c in sb.leer("dac_config")}
            cada = float(conf.get("cada_minutos", 60)) * 60
            if pend:
                for p in pend[1:]:  # varios clics seguidos se atienden con una sola actualización
                    sb.actualizar("dac_actualizaciones", f"id=eq.{p['id']}",
                                  {"estado": "ok", "mensaje": "Atendida junto con la solicitud anterior"})
                actualizar_nube(cfg, sb, pend[0]["id"])
                ultima = reloj.time()
            elif cada > 0 and reloj.time() - ultima >= cada:
                actualizar_nube(cfg, sb)
                ultima = reloj.time()
        except Exception:
            logging.exception("Vuelta con error; se reintenta")
        reloj.sleep(30)


def local(cfg: dict):
    R = procesar(cfg, Jornada(), set(JEFATURA))
    destino = RAIZ / "public" / "local" / "datos.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"solicitudes": R["solicitudes"], "tramos": R["tramos"], "flujo_rapido": R["flujo"],
                                   "bitacora_resumen": R["resumen"], "motor_resumen": R["motor"], "motor_lentas": R["lentas"],
                                   "ultima_actualizacion": datetime.now().astimezone().isoformat()},
                                  ensure_ascii=False), encoding="utf-8")
    logging.info("Escrito %s", destino)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    for op in ("una-vez", "escuchar", "configurar", "local", "historico"):
        g.add_argument(f"--{op}", action="store_true")
    a = ap.parse_args()
    LOG.parent.mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(LOG, encoding="utf-8"), logging.StreamHandler()])
    cfg = leer_config()
    if a.configurar:
        s = cfg["supabase"]
        keyring.set_password(s["servicio_credenciales"], s["usuario"], getpass.getpass("Contraseña del usuario de sistema: "))
        print("Guardada.")
    elif a.local:
        local(cfg)
    elif a.historico:
        from tiempos_dac.nube import Supabase
        cargar_historico(cfg, Supabase(cfg["supabase"]))
    elif a.una_vez:
        from tiempos_dac.nube import Supabase
        actualizar_nube(cfg, Supabase(cfg["supabase"]))
    else:
        escuchar(cfg)


if __name__ == "__main__":
    main()
