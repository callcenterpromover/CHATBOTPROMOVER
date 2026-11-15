"""Configuración: variables de entorno o archivo worker/.env (que nunca se sube a git)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _leer_env(ruta: Path) -> dict[str, str]:
    valores: dict[str, str] = {}
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8-sig").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                clave, valor = linea.split("=", 1)
                valores[clave.strip()] = valor.strip().strip('"').strip("'")
    return valores


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_secret_key: str
    meta_token: str
    meta_api_version: str
    tesseract_cmd: str
    tessdata_dir: Path
    tmp_dir: Path
    entrada_dir: Path
    intervalo_segundos: int
    permitir_fuente_local: bool
    max_bytes: int
    max_intentos: int
    max_paginas_pdf: int
    panel_url: str
    worker_secret: str


def cargar() -> Config:
    env = {**_leer_env(RAIZ / ".env"), **os.environ}

    def valor(clave: str, defecto: str = "") -> str:
        return env.get(clave, defecto)

    return Config(
        supabase_url=valor("SUPABASE_URL").rstrip("/"),
        supabase_secret_key=valor("SUPABASE_SECRET_KEY"),
        meta_token=valor("META_WHATSAPP_TOKEN"),
        meta_api_version=valor("META_API_VERSION", "v23.0"),
        tesseract_cmd=valor("TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        tessdata_dir=RAIZ / "tessdata",
        tmp_dir=RAIZ / "tmp",
        entrada_dir=RAIZ / "entrada",
        intervalo_segundos=int(valor("INTERVALO_SEGUNDOS", "10")),
        permitir_fuente_local=valor("PERMITIR_FUENTE_LOCAL", "0") == "1",
        max_bytes=int(valor("MAX_BYTES", str(15 * 1024 * 1024))),
        max_intentos=int(valor("MAX_INTENTOS", "3")),
        max_paginas_pdf=int(valor("MAX_PAGINAS_PDF", "15")),
        panel_url=valor("PANEL_URL").rstrip("/"),
        worker_secret=valor("WORKER_SECRET"),
    )
