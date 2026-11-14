"""OCR local con Tesseract, una página a la vez (equipo de 8 GB sin GPU).

Devuelve el texto solo en memoria: nunca se escribe en disco ni en logs.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import pytesseract
from PIL import Image, ImageFilter, ImageOps, ImageStat

from .config import Config

Image.MAX_IMAGE_PIXELS = 60_000_000  # evita imágenes gigantes que agoten la memoria


@dataclass
class Pagina:
    texto: str
    confianza: float  # media 0-100 de las palabras reconocidas
    palabras: int
    nitidez: float

    @property
    def legibilidad(self) -> str:
        # Umbrales iniciales, calibrados solo con documentos ficticios: deben ajustarse con
        # fotos reales anonimizadas antes del piloto (documento 06 §9).
        if self.palabras < 8 or self.confianza < 55:
            return "ILEGIBLE"
        if self.confianza < 72 or self.nitidez < 12:
            return "POSIBLEMENTE_ILEGIBLE"
        return "LEGIBLE"


def _preparar(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("L")
    ancho, alto = img.size
    lado = max(ancho, alto)
    if lado < 1600:  # fotos pequeñas: ampliar mejora la lectura
        f = 1600 / lado
        img = img.resize((round(ancho * f), round(alto * f)), Image.LANCZOS)
    elif lado > 3200:  # fotos enormes: reducir ahorra memoria y tiempo
        f = 3200 / lado
        img = img.resize((round(ancho * f), round(alto * f)), Image.LANCZOS)
    # Sin recorte de extremos: en páginas casi blancas un recorte borra el texto.
    return ImageOps.autocontrast(img)


def _nitidez(img: Image.Image) -> float:
    muestra = img.copy()
    muestra.thumbnail((1000, 1000))
    return ImageStat.Stat(muestra.filter(ImageFilter.FIND_EDGES)).stddev[0]


def _leer(img: Image.Image, cfg: Config) -> tuple[str, float, int]:
    datos = pytesseract.image_to_data(
        img, lang="spa", config="--psm 6",
        output_type=pytesseract.Output.DICT,
    )
    lineas: dict[tuple, list[str]] = {}
    confianzas: list[float] = []
    for i, palabra in enumerate(datos["text"]):
        conf = float(datos["conf"][i])
        if conf < 0 or not palabra.strip():
            continue
        clave = (datos["block_num"][i], datos["par_num"][i], datos["line_num"][i])
        lineas.setdefault(clave, []).append(palabra)
        confianzas.append(conf)
    texto = "\n".join(" ".join(p) for _, p in sorted(lineas.items()))
    media = sum(confianzas) / len(confianzas) if confianzas else 0.0
    return texto, media, len(confianzas)


def _angulo_osd(img: Image.Image, cfg: Config) -> int | None:
    try:
        osd = pytesseract.image_to_osd(
            img, config="--psm 0", output_type=pytesseract.Output.DICT
        )
        return int(osd.get("rotate", 0)) % 360
    except Exception:
        return None  # poco texto o imagen ilegible


def leer_imagen(img: Image.Image, cfg: Config) -> Pagina:
    pytesseract.pytesseract.tesseract_cmd = cfg.tesseract_cmd
    # Por variable de entorno y no por argumento: las comillas en rutas fallan en Windows.
    os.environ["TESSDATA_PREFIX"] = str(cfg.tessdata_dir)
    img = _preparar(img)
    nitidez = _nitidez(img)
    mejor = _leer(img, cfg)

    # Si se lee mal, puede estar girada: se prueba la orientación sugerida y luego las demás.
    if mejor[1] < 70 or mejor[2] < 8:
        angulos = [a for a in (_angulo_osd(img, cfg), 180, 90, 270) if a]
        for angulo in dict.fromkeys(angulos):
            # `rotate` de PIL gira en sentido antihorario; Tesseract informa el giro horario necesario.
            candidato = _leer(img.rotate(-angulo, expand=True, fillcolor=255), cfg)
            if candidato[1] * min(candidato[2], 40) > mejor[1] * min(mejor[2], 40):
                mejor = candidato
            if mejor[1] >= 80 and mejor[2] >= 8:
                break

    return Pagina(texto=mejor[0], confianza=mejor[1], palabras=mejor[2], nitidez=nitidez)


def leer_archivo(ruta: Path, tipo: str, cfg: Config) -> list[Pagina]:
    """Lee una imagen o un PDF. Cada página se procesa y se libera antes de la siguiente."""
    if tipo != "pdf":
        with Image.open(ruta) as img:
            return [leer_imagen(img, cfg)]

    import pypdfium2 as pdfium

    paginas: list[Pagina] = []
    pdf = pdfium.PdfDocument(str(ruta))
    try:
        if len(pdf) > cfg.max_paginas_pdf:
            raise ValueError("pdf_demasiadas_paginas")
        for i in range(len(pdf)):
            pagina = pdf[i]
            texto = pagina.get_textpage().get_text_range().strip()
            if len(texto) >= 80:  # PDF con texto seleccionable: no necesita OCR
                paginas.append(Pagina(texto=texto, confianza=99.0, palabras=len(texto.split()), nitidez=99.0))
            else:
                imagen = pagina.render(scale=3).to_pil()  # ~216 ppp
                paginas.append(leer_imagen(imagen, cfg))
                imagen.close()
            pagina.close()
    finally:
        pdf.close()
    return paginas
