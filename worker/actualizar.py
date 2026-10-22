"""Actualiza Tiempos DAC: ejecuta las dos consultas, calcula los tramos y los sube a Supabase.

Uso:
  actualizar.py --una-vez      ejecuta una actualización
  actualizar.py --escuchar     queda atendiendo el botón "Actualizar" de la app (y actualiza solo cada N minutos)
  actualizar.py --configurar   guarda la contraseña del usuario de sistema en el Administrador de credenciales
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
from tiempos_dac.motor import Jornada, calcular  # noqa: E402

LOG = RAIZ / "worker" / "logs" / "actualizar.log"
DIAS_CIERRE = 5  # los primeros días del mes se vuelve a leer el mes anterior para cerrarlo al corte


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


def procesar(cfg: dict, jornada: Jornada) -> tuple[list[dict], list[dict]]:
    sql = {k: (RAIZ / v).read_text(encoding="utf-8-sig") for k, v in cfg["consultas"].items()}
    if date.today().day <= DIAS_CIERRE:
        # Las consultas traen lo creado desde el día 1 del mes; en memoria (sin tocar los archivos) se amplían
        # al mes anterior para que sus solicitudes queden cerradas al corte de fin de mes.
        sql = {k: v.replace("MONTH, 0", "MONTH, -1") for k, v in sql.items()}
        logging.info("Primeros días del mes: se incluye el mes anterior para cerrarlo")
    t0 = reloj.time()
    bit = consultar(cfg["servidor"], sql["bitacora"])
    his = consultar(cfg["servidor"], sql["historico"])
    logging.info("Consultas: bitácora %s filas, histórico %s filas (%.0f s)", len(bit), len(his), reloj.time() - t0)
    sol, tr = calcular(his, bit, jornada)
    sol["periodo"] = sol["ingreso_dac"].dt.strftime("%Y-%m")
    sol = sol[["solicitud", "periodo", "creada", "ingreso_dac", "tipo_credito", "producto", "reestructura",
               "monto_colocado", "estado_actual", "promotor", "sucursal", "decision", "fecha_decision",
               "segundos_total"]]
    tr["n"] = tr.groupby("solicitud").cumcount() + 1
    tr = tr[["solicitud", "n", "tipo", "analista", "inicio", "fin", "fin_estado", "estados", "cruza_dia"]]
    logging.info("Universo DAC: %s solicitudes, %s tramos", len(sol), len(tr))
    return _registros(sol), _registros(tr)


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
        sols, trs = procesar(cfg, jornada_nube(sb))
        n = sb.rpc("dac_cargar", {"p_solicitudes": sols, "p_tramos": trs})
        msg = f"{len(sols)} solicitudes y {n} tramos cargados"
        logging.info(msg)
        if pedido:
            sb.actualizar("dac_actualizaciones", f"id=eq.{pedido}", {"estado": "ok", "terminado_en": ahora(), "mensaje": msg})
    except Exception as e:
        logging.exception("Error en la actualización")
        if pedido:
            sb.actualizar("dac_actualizaciones", f"id=eq.{pedido}",
                          {"estado": "error", "terminado_en": ahora(), "mensaje": str(e)[:500]})
        raise


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
    sols, trs = procesar(cfg, Jornada())
    destino = RAIZ / "public" / "local" / "datos.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"solicitudes": sols, "tramos": trs,
                                   "ultima_actualizacion": datetime.now().astimezone().isoformat()},
                                  ensure_ascii=False), encoding="utf-8")
    logging.info("Escrito %s", destino)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    for op in ("una-vez", "escuchar", "configurar", "local"):
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
    elif a.una_vez:
        from tiempos_dac.nube import Supabase
        actualizar_nube(cfg, Supabase(cfg["supabase"]))
    else:
        escuchar(cfg)


if __name__ == "__main__":
    main()
