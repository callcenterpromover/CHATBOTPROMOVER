"""Descarga del documento a la carpeta temporal del equipo.

El archivo viene directo de Meta (Graph API). Solo hay conexiones salientes.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .config import Config


class FormatoNoSoportado(Exception):
    pass


class MedioNoDisponible(Exception):
    """El archivo ya no se puede descargar (caducó en Meta o no existe)."""


def detectar_tipo(ruta: Path) -> str:
    """Tipo por contenido real del archivo, no por extensión ni por lo que diga el remitente."""
    with ruta.open("rb") as f:
        cabecera = f.read(8)
    if cabecera.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if cabecera.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if cabecera.startswith(b"%PDF"):
        return "pdf"
    raise FormatoNoSoportado


# Meta entrega los medios desde estos dominios. Una URL fuera de ellos se rechaza: el token de
# WhatsApp nunca debe enviarse a otro servidor.
_DOMINIOS_META = (".fbsbx.com", ".facebook.com", ".whatsapp.net", ".fbcdn.net")


def url_de_meta_valida(url: str) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    return u.scheme == "https" and any(host == d[1:] or host.endswith(d) for d in _DOMINIOS_META)


KAPSO_API = "https://api.kapso.ai/meta/whatsapp/v24.0"


def url_de_kapso_valida(url: str) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    return u.scheme == "https" and (u.hostname or "").lower() == "api.kapso.ai"


def _guardar_respuesta(respuesta: httpx.Response, destino: Path, cfg: Config) -> None:
    if respuesta.status_code in (401, 403, 404):
        raise MedioNoDisponible
    respuesta.raise_for_status()
    total = 0
    with destino.open("wb") as f:
        for bloque in respuesta.iter_bytes():
            total += len(bloque)
            if total > cfg.max_bytes:
                raise FormatoNoSoportado
            f.write(bloque)


def _descargar_kapso(media_id: str, destino: Path, cfg: Config) -> Path:
    """Medios que llegan por Kapso: se pide un enlace temporal (4 min) a su proxy de Meta y se descarga.
    La clave solo se envía a api.kapso.ai."""
    if not re.fullmatch(r"\d{5,30}", media_id) or not cfg.kapso_api_key or not cfg.kapso_phone_number_id:
        raise MedioNoDisponible
    with httpx.Client(timeout=60, follow_redirects=False) as http:
        info = http.get(
            f"{KAPSO_API}/{media_id}",
            params={"phone_number_id": cfg.kapso_phone_number_id},
            headers={"X-API-Key": cfg.kapso_api_key},
        )
        if info.status_code in (400, 404):
            raise MedioNoDisponible
        info.raise_for_status()
        datos = info.json()
        if int(datos.get("file_size") or 0) > cfg.max_bytes:
            raise FormatoNoSoportado
        url = str(datos.get("download_url") or "")
        if not url_de_kapso_valida(url):
            raise MedioNoDisponible
        # El enlace ya trae su propio token: no se envía la clave a la descarga.
        with http.stream("GET", url) as respuesta:
            _guardar_respuesta(respuesta, destino, cfg)
    return destino


def descargar(media_id: str, trabajo_id: int, cfg: Config) -> Path:
    cfg.tmp_dir.mkdir(parents=True, exist_ok=True)
    destino = cfg.tmp_dir / f"{trabajo_id}.bin"

    if media_id.startswith("local:"):
        # Solo para pruebas con documentos ficticios (Fase 1).
        if not cfg.permitir_fuente_local:
            raise MedioNoDisponible
        origen = cfg.entrada_dir / Path(media_id.removeprefix("local:")).name  # sin rutas relativas
        if not origen.is_file() or origen.stat().st_size > cfg.max_bytes:
            raise MedioNoDisponible
        shutil.copyfile(origen, destino)
        return destino

    if media_id.startswith("kapso:"):
        return _descargar_kapso(media_id.removeprefix("kapso:"), destino, cfg)

    # Los IDs de medios de Meta son numéricos: cualquier otra cosa no se envía a la API.
    if not re.fullmatch(r"\d{5,30}", media_id) or not cfg.meta_token:
        raise MedioNoDisponible

    cabeceras = {"Authorization": f"Bearer {cfg.meta_token}"}
    with httpx.Client(timeout=60, headers=cabeceras, follow_redirects=False) as http:
        meta = http.get(f"https://graph.facebook.com/{cfg.meta_api_version}/{media_id}")
        if meta.status_code in (400, 404):
            raise MedioNoDisponible
        meta.raise_for_status()
        info = meta.json()
        if int(info.get("file_size", 0)) > cfg.max_bytes:
            raise FormatoNoSoportado
        url = str(info.get("url", ""))
        if not url_de_meta_valida(url):
            raise MedioNoDisponible
        with http.stream("GET", url) as respuesta:
            if respuesta.status_code in (401, 403, 404):
                raise MedioNoDisponible
            respuesta.raise_for_status()
            total = 0
            with destino.open("wb") as f:
                for bloque in respuesta.iter_bytes():
                    total += len(bloque)
                    if total > cfg.max_bytes:
                        raise FormatoNoSoportado
                    f.write(bloque)
    return destino


def borrar(ruta: Path | None) -> None:
    if ruta is not None:
        ruta.unlink(missing_ok=True)


def purgar(cfg: Config, conservar: set[int] | None = None) -> int:
    """Borra temporales que no pertenezcan a un trabajo en curso. Devuelve cuántos borró."""
    borrados = 0
    if cfg.tmp_dir.exists():
        for archivo in cfg.tmp_dir.iterdir():
            if archivo.is_file() and not (conservar and archivo.stem.isdigit() and int(archivo.stem) in conservar):
                archivo.unlink(missing_ok=True)
                borrados += 1
    return borrados
