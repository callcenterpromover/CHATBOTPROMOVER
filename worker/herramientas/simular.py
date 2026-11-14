"""Simula lo que hará el webhook de WhatsApp: crea una solicitud FICTICIA y encola documentos
de worker/entrada para que el worker los procese (Fase 1, sin WhatsApp).

    python herramientas/simular.py --nombre "Laura Prueba Veinte (ficticio)" --documento 1000000020 \
        --eps SALUD_TOTAL --servicio "Terapia física integral" --edad 44 orden_clara.png historia_p1de3.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from promover_worker.config import cargar  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--nombre", required=True)
    p.add_argument("--documento", required=True)
    p.add_argument("--eps", default="SALUD_TOTAL", choices=["SALUD_TOTAL", "SOS", "OTRA"])
    p.add_argument("--servicio", default="")
    p.add_argument("--edad", type=int)
    p.add_argument("archivos", nargs="+", help="nombres de archivos dentro de worker/entrada")
    a = p.parse_args()

    cfg = cargar()
    for nombre in a.archivos:
        if not (cfg.entrada_dir / nombre).is_file():
            raise SystemExit(f"No existe worker/entrada/{nombre}")

    http = httpx.Client(
        base_url=f"{cfg.supabase_url}/rest/v1",
        headers={"apikey": cfg.supabase_secret_key, "Prefer": "return=representation"},
        timeout=30,
    )
    r = http.post("/solicitudes", json={
        "nombre": a.nombre, "documento": a.documento, "eps": a.eps, "servicio_texto": a.servicio or None,
        "edad": a.edad, "telefono": "573000000000", "estado": "ESPERANDO_ORDEN",
    })
    r.raise_for_status()
    solicitud = r.json()[0]
    r = http.post("/trabajos_ocr", json=[
        {"solicitud_id": solicitud["id"], "media_id": f"local:{nombre}"} for nombre in a.archivos
    ])
    r.raise_for_status()
    print(f"Solicitud S-{solicitud['numero']:04d} creada con {len(a.archivos)} documento(s) en cola.")


if __name__ == "__main__":
    main()
