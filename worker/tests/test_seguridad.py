"""Pruebas de los controles de seguridad del worker."""

from pathlib import Path

import pytest
from PIL import Image

from promover_worker import fuentes
from promover_worker.config import Config


def _cfg(tmp_path: Path, **cambios) -> Config:
    base = dict(
        supabase_url="https://x.supabase.co", supabase_secret_key="s", meta_token="token-falso",
        meta_api_version="v23.0", tesseract_cmd="tesseract", tessdata_dir=tmp_path,
        tmp_dir=tmp_path / "tmp", entrada_dir=tmp_path / "entrada", intervalo_segundos=1,
        permitir_fuente_local=False, max_bytes=1024, max_intentos=3, max_paginas_pdf=15,
        panel_url="", worker_secret="",
    )
    base.update(cambios)
    return Config(**base)


@pytest.mark.parametrize("url,valida", [
    ("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", True),
    ("https://scontent.whatsapp.net/v/t61/abc", True),
    ("http://lookaside.fbsbx.com/archivo", False),          # sin TLS
    ("https://fbsbx.com.atacante.com/archivo", False),      # dominio que solo empieza igual
    ("https://atacante.com/?x=lookaside.fbsbx.com", False),
    ("https://evilfbsbx.com/archivo", False),
    ("", False),
])
def test_solo_se_descarga_desde_dominios_de_meta(url, valida):
    assert fuentes.url_de_meta_valida(url) is valida


@pytest.mark.parametrize("media_id", ["../../etc/passwd", "123/../456", "abc", "1234", "1" * 31, ""])
def test_ids_de_medio_invalidos_no_llegan_a_la_api(tmp_path, media_id):
    with pytest.raises(fuentes.MedioNoDisponible):
        fuentes.descargar(media_id, 1, _cfg(tmp_path))


def test_fuente_local_desactivada_por_defecto(tmp_path):
    with pytest.raises(fuentes.MedioNoDisponible):
        fuentes.descargar("local:orden.png", 1, _cfg(tmp_path))


def test_fuente_local_no_permite_salir_de_la_carpeta(tmp_path):
    (tmp_path / "entrada").mkdir()
    (tmp_path / "secreto.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    cfg = _cfg(tmp_path, permitir_fuente_local=True)
    with pytest.raises(fuentes.MedioNoDisponible):
        fuentes.descargar("local:../secreto.png", 1, cfg)


def test_tipo_por_contenido_y_no_por_extension(tmp_path):
    falso = tmp_path / "foto.png"
    falso.write_bytes(b"MZ\x90\x00 ejecutable disfrazado")
    with pytest.raises(fuentes.FormatoNoSoportado):
        fuentes.detectar_tipo(falso)


def test_imagen_bomba_se_rechaza(tmp_path):
    from promover_worker import ocr  # activa los límites de imagen

    ruta = tmp_path / "bomba.png"
    Image.new("1", (8000, 8000)).save(ruta)  # 64 Mpx: más que el límite
    with pytest.raises((Image.DecompressionBombError, Image.DecompressionBombWarning)):
        ocr.leer_archivo(ruta, "png", _cfg(tmp_path))


def test_purgar_borra_temporales(tmp_path):
    cfg = _cfg(tmp_path)
    cfg.tmp_dir.mkdir()
    (cfg.tmp_dir / "7.bin").write_bytes(b"x")
    (cfg.tmp_dir / "8.bin").write_bytes(b"x")
    assert fuentes.purgar(cfg, conservar={8}) == 1
    assert [p.name for p in cfg.tmp_dir.iterdir()] == ["8.bin"]
