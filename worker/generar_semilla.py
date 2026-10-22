"""Genera data/semilla.sql: usuarios iniciales, analistas y el usuario de sistema para el proceso de carga.

Se pega una sola vez en Supabase > SQL Editor después de supabase/schema.sql. No se sube a Git.
La contraseña del usuario de sistema se genera al azar y se guarda en el Administrador de credenciales.
"""
import json
import secrets
import sys
import unicodedata
from pathlib import Path

import keyring

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tiempos_dac.conexion import RAIZ, leer_config  # noqa: E402

CLAVE = "12345678"
FIJOS = [("Carlos Manuel Alvarez Gutierrez", "admin"), ("Hilcia Paola", "jefe"),
         ("Katherine Guiselle", "jefe"), ("Karen Arana", "gerente")]


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()
    return ".".join(p for p in "".join(c if c.isalnum() else " " for c in s).split())


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def main():
    # Analistas de partida: los de la vista previa (quienes atendieron tramos), con el producto que más atendieron
    d = json.loads((RAIZ / "public" / "local" / "datos.json").read_text(encoding="utf-8"))
    prod = {s["solicitud"]: s["producto"] for s in d["solicitudes"]}
    cuenta: dict[str, dict] = {}
    for t in d["tramos"]:
        a = t["analista"]
        if a and not a.startswith(("KATHERINE", "HILCIA")):
            c = cuenta.setdefault(a, {})
            c[prod[t["solicitud"]]] = c.get(prod[t["solicitud"]], 0) + 1
    analistas = sorted((a, max(c, key=c.get)) for a, c in cuenta.items())

    cfg = leer_config()["supabase"]
    clave_sis = secrets.token_urlsafe(24)
    keyring.set_password(cfg["servicio_credenciales"], cfg["usuario"], clave_sis)

    L = ["-- Carga inicial de Tiempos DAC (pegar en Supabase > SQL Editor después de schema.sql)"]
    for nombre, rol in FIJOS:
        L.append(f"select public.dac_crear_usuario({q(slug(nombre))}, {q(nombre)}, '{rol}', '{CLAVE}');")
    for a, p in analistas:
        nombre = a.title()
        L.append(f"select public.dac_crear_usuario({q(slug(nombre))}, {q(nombre)}, 'analista', '{CLAVE}', {q(a)});")
        L.append(f"insert into public.dac_analistas (nombre, producto) values ({q(a)}, '{p}') on conflict do nothing;")
    L.append(f"select public.dac_crear_usuario('{cfg['usuario']}', 'Proceso de actualización', 'sistema', {q(clave_sis)});")
    destino = RAIZ / "data" / "semilla.sql"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"Escrito {destino} ({len(analistas)} analistas). Contraseña de sistema guardada en el Administrador de credenciales.")


if __name__ == "__main__":
    main()
