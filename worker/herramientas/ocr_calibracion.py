"""Corre el OCR del worker sobre calibracion/imagenes y guarda el resultado en un caché local.

    python herramientas/ocr_calibracion.py [--procesos 4] [--rehacer]

El caché (calibracion/_ocr_cache.jsonl) contiene el texto leído: es dato de salud y por eso
vive solo dentro de calibracion/ (ignorado por git, se borra con la carpeta). Sirve para
ajustar la extracción por rondas sin repetir el OCR, que es lo lento. Si se cambia el
preprocesamiento del OCR hay que usar --rehacer.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from promover_worker import fuentes, ocr  # noqa: E402
from promover_worker.config import cargar  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2] / "calibracion"
IMAGENES = RAIZ / "imagenes"
CACHE = RAIZ / "_ocr_cache.jsonl"
EXTENSIONES = {".jpg", ".jpeg", ".png", ".pdf"}


def procesar(ruta_txt: str) -> dict:
    ruta = Path(ruta_txt)
    cfg = cargar()
    inicio = time.monotonic()
    rel = ruta.relative_to(IMAGENES).as_posix()
    try:
        paginas = ocr.leer_archivo(ruta, fuentes.detectar_tipo(ruta), cfg)
    except Exception as e:  # noqa: BLE001 - se registra el tipo de error, no el contenido
        return {"archivo": rel, "error": type(e).__name__, "segundos": round(time.monotonic() - inicio, 1)}
    return {
        "archivo": rel,
        "segundos": round(time.monotonic() - inicio, 1),
        "paginas": [
            {"texto": p.texto, "confianza": round(p.confianza, 1), "palabras": p.palabras,
             "nitidez": round(p.nitidez, 1), "legibilidad": p.legibilidad}
            for p in paginas
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--procesos", type=int, default=4)
    ap.add_argument("--rehacer", action="store_true")
    args = ap.parse_args()

    hechos: set[str] = set()
    if CACHE.exists() and not args.rehacer:
        hechos = {json.loads(l)["archivo"] for l in CACHE.read_text(encoding="utf-8").splitlines() if l.strip()}
    elif args.rehacer and CACHE.exists():
        CACHE.unlink()

    pendientes = sorted(
        str(p) for p in IMAGENES.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONES and p.relative_to(IMAGENES).as_posix() not in hechos
    )
    print(f"Pendientes: {len(pendientes)} (ya en caché: {len(hechos)})", flush=True)
    inicio = time.monotonic()
    with ProcessPoolExecutor(max_workers=args.procesos) as pool, CACHE.open("a", encoding="utf-8") as f:
        futuros = [pool.submit(procesar, p) for p in pendientes]
        for i, fut in enumerate(as_completed(futuros), 1):
            r = fut.result()
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            f.flush()
            if i % 10 == 0 or i == len(futuros):
                print(f"{i}/{len(futuros)} · {time.monotonic() - inicio:.0f}s", flush=True)


if __name__ == "__main__":
    main()
