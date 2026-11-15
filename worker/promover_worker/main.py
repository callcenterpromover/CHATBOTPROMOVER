"""Ciclo principal del worker.

    python -m promover_worker.main            # corre de forma continua
    python -m promover_worker.main --una-vez  # procesa lo pendiente y termina

Los logs solo llevan IDs internos, códigos y tiempos: nunca nombres, documentos ni texto leído.
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from PIL import Image

from . import fuentes, ocr
from .cola import Cola
from .config import Config, cargar
from .extraccion import Extraccion, extraer
from .reglas import evaluar

log = logging.getLogger("worker")
ORDEN_LEGIBILIDAD = ["LEGIBLE", "POSIBLEMENTE_ILEGIBLE", "ILEGIBLE"]


def _hoy():
    return datetime.now(ZoneInfo("America/Bogota")).date()


def _resultado_de_reenvio(trabajo: dict, codigo: str) -> dict:
    return {
        "estado": "REENVIO_REQUERIDO", "tipo_documento": trabajo["tipo_documento"], "legibilidad": None,
        "pagina_actual": None, "pagina_total": None, "error_codigo": codigo, "campos": [],
        "alertas": [{
            "codigo": "DOCUMENTO_NO_PROCESABLE",
            "detalle": "Un archivo recibido no se pudo abrir (formato no admitido, dañado, protegido o ya no "
                       "disponible). Pedir al paciente que lo envíe de nuevo como foto o PDF.",
        }],
        "solicitud": {"estado": "DOCUMENTOS_POR_REENVIAR"},
    }


def procesar(trabajo: dict, cola: Cola, cfg: Config) -> str:
    """Procesa un trabajo y devuelve el estado final (para el log)."""
    solicitud = cola.solicitud(trabajo["solicitud_id"])
    if solicitud is None:
        return "DESCARTADO"  # la solicitud se cerró: no hay nada que guardar

    ruta = None
    try:
        try:
            ruta = fuentes.descargar(trabajo["media_id"], trabajo["id"], cfg)
            tipo_archivo = fuentes.detectar_tipo(ruta)
            paginas = ocr.leer_archivo(ruta, tipo_archivo, cfg)
        except fuentes.MedioNoDisponible:
            resultado = _resultado_de_reenvio(trabajo, "medio_no_disponible")
            return resultado["estado"] if cola.guardar(trabajo["id"], resultado) else "DESCARTADO"
        except (fuentes.FormatoNoSoportado, ValueError, OSError, Image.DecompressionBombError,
                Image.DecompressionBombWarning, RuntimeError):
            # RuntimeError: Tesseract superó el tiempo máximo (pytesseract lo informa así).
            # OSError/ValueError: imagen o PDF dañado, protegido o fuera de límites.
            resultado = _resultado_de_reenvio(trabajo, "archivo_no_procesable")
            return resultado["estado"] if cola.guardar(trabajo["id"], resultado) else "DESCARTADO"
    finally:
        fuentes.borrar(ruta)  # el original se elimina apenas termina la lectura

    extracciones = [extraer(p.texto) for p in paginas]
    legibilidad = max((p.legibilidad for p in paginas), key=ORDEN_LEGIBILIDAD.index)
    alertas_extra: list[dict] = []

    # RB-061: una orden ocupa una página. Varias páginas que parecen órdenes no se fusionan.
    ordenes = [e for e in extracciones if e.tipo_documento == "ORDEN"]
    if len(paginas) > 1 and len(ordenes) > 1:
        ex = ordenes[0]
        alertas_extra.append({
            "codigo": "PDF_CON_VARIAS_ORDENES",
            "detalle": f"El archivo contiene {len(paginas)} páginas y {len(ordenes)} podrían ser órdenes "
                       "independientes. Solo se leyó la primera; confirmar la separación y crear las solicitudes "
                       "que correspondan.",
        })
    elif len(paginas) > 1:
        ex = extraer("\n".join(p.texto for p in paginas))
        totales = [e.pagina_total for e in extracciones if e.pagina_total]
        ex.pagina_total = max(totales) if totales else None
        ex.pagina_actual = len(paginas) if totales else None
    else:
        ex = extracciones[0] if extracciones else Extraccion()

    previas = cola.paginas_historia(solicitud["id"]) + max(len(paginas) - 1, 0)
    resultado = evaluar(
        solicitud, ex, legibilidad, hoy=_hoy(), tipo_declarado=trabajo["tipo_documento"],
        paginas_historia_previas=previas,
        alertas_abiertas_previas=cola.alertas_abiertas(solicitud["id"]) + len(alertas_extra),
    )
    resultado["alertas"].extend(alertas_extra)
    del paginas, extracciones, ex  # el texto leído no se conserva

    return resultado["estado"] if cola.guardar(trabajo["id"], resultado) else "DESCARTADO"


def avisar_panel(trabajo_id: int, cfg: Config) -> None:
    """Pide al panel que escriba al paciente si hay que pedirle algo (reenvío, páginas faltantes).
    Si el panel no responde, la solicitud igual queda con sus alertas: no es un fallo del trabajo."""
    if not cfg.panel_url or not cfg.worker_secret:
        return
    try:
        r = httpx.post(
            f"{cfg.panel_url}/api/interno/documento-procesado",
            json={"trabajo_id": trabajo_id},
            headers={"Authorization": f"Bearer {cfg.worker_secret}"},
            timeout=15,
        )
        log.info("trabajo=%s aviso=%s", trabajo_id, r.json().get("resultado") if r.is_success else r.status_code)
    except (httpx.HTTPError, ValueError) as e:
        log.warning("trabajo=%s aviso_fallido tipo=%s", trabajo_id, type(e).__name__)


def ciclo(cola: Cola, cfg: Config, una_vez: bool) -> int:
    procesados = 0
    while True:
        try:
            fuentes.purgar(cfg, conservar=set())
            trabajo = cola.reclamar()
        except httpx.HTTPError as e:
            log.warning("sin_conexion tipo=%s", type(e).__name__)
            if una_vez:
                return procesados
            time.sleep(cfg.intervalo_segundos * 3)
            continue

        if trabajo is None:
            if una_vez:
                return procesados
            time.sleep(cfg.intervalo_segundos)
            continue

        inicio = time.monotonic()
        try:
            estado = procesar(trabajo, cola, cfg)
        except Exception as e:  # fallo técnico: reintentar sin registrar contenido
            try:
                estado = cola.fallo_tecnico(trabajo, type(e).__name__[:40])
            except httpx.HTTPError:
                estado = "SIN_CONEXION"
            log.error("trabajo=%s fallo=%s estado=%s", trabajo["id"], type(e).__name__, estado)
        else:
            log.info("trabajo=%s estado=%s ms=%d", trabajo["id"], estado, (time.monotonic() - inicio) * 1000)
            if estado != "DESCARTADO":
                avisar_panel(trabajo["id"], cfg)
        procesados += 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Worker de OCR de PROMOVER")
    parser.add_argument("--una-vez", action="store_true", help="procesa lo pendiente y termina")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # sus logs incluyen URLs con identificadores

    cfg = cargar()
    cola = Cola(cfg)
    fuentes.purgar(cfg)
    cola.recuperar_interrumpidos()
    log.info("worker_iniciado fuente_local=%s", cfg.permitir_fuente_local)
    n = ciclo(cola, cfg, args.una_vez)
    log.info("worker_terminado procesados=%d", n)


if __name__ == "__main__":
    main()
