"""Lee los archivos de worker/entrada sin tocar la base y muestra métricas y campos.
Solo para documentos FICTICIOS: imprime en pantalla lo que extrae.

    python herramientas/probar_ocr.py [archivo ...]
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from promover_worker import fuentes, ocr  # noqa: E402
from promover_worker.config import cargar  # noqa: E402
from promover_worker.extraccion import extraer  # noqa: E402


def main() -> None:
    cfg = cargar()
    nombres = sys.argv[1:] or sorted(a.name for a in cfg.entrada_dir.iterdir())
    for nombre in nombres:
        ruta = cfg.entrada_dir / nombre
        inicio = time.monotonic()
        try:
            paginas = ocr.leer_archivo(ruta, fuentes.detectar_tipo(ruta), cfg)
        except (fuentes.FormatoNoSoportado, ValueError, OSError) as e:
            print(f"{nombre}: NO PROCESABLE ({type(e).__name__})")
            continue
        seg = time.monotonic() - inicio
        for i, p in enumerate(paginas, 1):
            ex = extraer(p.texto)
            campos = ", ".join(f"{c.campo}={c.valor}[{c.confianza}]" for c in ex.campos)
            print(f"{nombre} p{i}: {p.legibilidad} conf={p.confianza:.0f} palabras={p.palabras} "
                  f"nitidez={p.nitidez:.0f} tipo={ex.tipo_documento} pag={ex.pagina_actual}/{ex.pagina_total} "
                  f"esp={ex.especialidad_en_historia} dir={ex.direccionamiento_con_valor} ({seg:.1f}s)\n   {campos}")


if __name__ == "__main__":
    main()
