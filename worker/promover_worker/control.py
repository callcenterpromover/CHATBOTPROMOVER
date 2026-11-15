"""Encender, apagar y consultar el worker en este equipo (lo usa la ventana de control).

El apagado es ordenado: se deja una marca (`run/detener`) que el worker revisa entre documento y
documento, así no se corta una lectura a la mitad. Si no se detiene a tiempo, se termina el proceso.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import psutil

from .config import RAIZ

RUTA_DETENER = RAIZ / "run" / "detener"
MARCA_PROCESO = "promover_worker.main"


def _pythonw() -> Path:
    candidato = Path(sys.executable).with_name("pythonw.exe")
    return candidato if candidato.exists() else Path(sys.executable)


def procesos_worker() -> list[psutil.Process]:
    """Procesos del worker que están corriendo (de cualquier sesión del usuario)."""
    encontrados = []
    for p in psutil.process_iter(["name", "cmdline"]):
        try:
            linea = " ".join(p.info["cmdline"] or [])
        except (psutil.Error, TypeError):
            continue
        if MARCA_PROCESO in linea and "--una-vez" not in linea:
            encontrados.append(p)
    return encontrados


def encendido() -> bool:
    return bool(procesos_worker())


def detencion_solicitada() -> bool:
    return RUTA_DETENER.exists()


def limpiar_marca() -> None:
    RUTA_DETENER.unlink(missing_ok=True)


def encender() -> bool:
    """Arranca el worker en segundo plano, independiente de la ventana. Devuelve False si ya corría."""
    limpiar_marca()
    if encendido():
        return False
    banderas = 0
    if sys.platform == "win32":
        # Sin consola y desligado de quien lo lanzó: cerrar la ventana de control no lo detiene.
        banderas = (
            subprocess.DETACHED_PROCESS
            | subprocess.CREATE_NEW_PROCESS_GROUP
            | subprocess.CREATE_NO_WINDOW
            | subprocess.CREATE_BREAKAWAY_FROM_JOB
        )
    argumentos = [str(_pythonw()), "-m", MARCA_PROCESO]
    try:
        subprocess.Popen(argumentos, cwd=RAIZ, creationflags=banderas, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        # Algunos entornos no permiten salir del "job" actual; sin esa bandera también funciona.
        subprocess.Popen(argumentos, cwd=RAIZ, creationflags=banderas & ~subprocess.CREATE_BREAKAWAY_FROM_JOB,
                         close_fds=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
    return True


def apagar(espera_segundos: float = 45) -> str:
    """Pide al worker que se detenga y espera. Devuelve 'detenido', 'forzado' o 'no_corria'."""
    if not encendido():
        limpiar_marca()
        return "no_corria"
    RUTA_DETENER.parent.mkdir(parents=True, exist_ok=True)
    RUTA_DETENER.touch()
    limite = time.monotonic() + espera_segundos
    while time.monotonic() < limite:
        if not encendido():
            limpiar_marca()
            return "detenido"
        time.sleep(0.5)
    # No respondió (por ejemplo, un documento muy pesado): se termina el proceso. Al volver a
    # encender, el trabajo interrumpido regresa a la cola y el temporal se purga.
    for p in procesos_worker():
        try:
            p.terminate()
        except psutil.Error:
            pass
    psutil.wait_procs(procesos_worker(), timeout=5)
    limpiar_marca()
    return "forzado"


def esperar(segundos: float) -> bool:
    """Espera en pasos cortos. Devuelve True si se pidió apagar mientras tanto."""
    limite = time.monotonic() + segundos
    while time.monotonic() < limite:
        if detencion_solicitada():
            return True
        time.sleep(min(1.0, max(0.0, limite - time.monotonic())))
    return detencion_solicitada()
