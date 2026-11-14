"""Genera documentos FICTICIOS en worker/entrada para probar el OCR (Fase 1).

    python herramientas/generar_documentos.py
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ENTRADA = Path(__file__).resolve().parent.parent / "entrada"
HOY = date.today()


def _fuente(tam: int):
    for nombre in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(nombre, tam)
        except OSError:
            continue
    return ImageFont.load_default()


def pagina(lineas: list[str], titulo: str) -> Image.Image:
    img = Image.new("RGB", (1240, 1754), "white")  # A4 a 150 ppp
    d = ImageDraw.Draw(img)
    d.text((90, 80), titulo, font=_fuente(40), fill="black")
    d.line((90, 140, 1150, 140), fill="black", width=2)
    y = 180
    for linea in lineas:
        d.text((90, y), linea, font=_fuente(28), fill="black")
        y += 58
    d.text((90, 1650), "DOCUMENTO FICTICIO PARA PRUEBAS", font=_fuente(20), fill="gray")
    return img


def f(dias: int) -> str:
    return (HOY + timedelta(days=dias)).strftime("%d/%m/%Y")


def main() -> None:
    ENTRADA.mkdir(exist_ok=True)

    orden = pagina([
        "IPS EJEMPLO S.A.S. - NIT 900.000.000",
        "Paciente: LAURA PRUEBA VEINTE",
        "C.C. 1.000.000.020        Edad: 44 años",
        "EPS: SALUD TOTAL",
        f"Fecha de expedición: {f(-6)}",
        "Servicio: Terapia física integral",
        "Diagnóstico: M545 LUMBAGO NO ESPECIFICADO",
        "Cantidad: 10 sesiones",
        f"Válida hasta: {f(20)}",
        "Orden No. 778899",
    ], "ORDEN DE SERVICIO")
    orden.save(ENTRADA / "orden_clara.png")
    orden.rotate(90, expand=True).save(ENTRADA / "orden_girada.png")
    orden.filter(ImageFilter.GaussianBlur(9)).save(ENTRADA / "orden_borrosa.jpg", quality=40)

    pagina([
        "IPS EJEMPLO S.A.S.",
        "Paciente: LAURA PRUEBA VEINTE",
        "C.C. 1.000.000.920",  # documento distinto a propósito
        "EPS: SALUD TOTAL",
        "Servicio: Consulta de primera vez por fisiatría y rehabilitación",
        f"Válida hasta: {f(2)}",
    ], "ORDEN DE SERVICIO").save(ENTRADA / "orden_discrepancia.png")

    pagina([
        "Nombre: LAURA PRUEBA VEINTE     Identificación: 1000000020",
        "EPS: SALUD TOTAL",
        f"Fecha de atención: {f(-8)}",
        "Motivo de consulta: dolor lumbar de dos meses de evolución.",
        "Enfermedad actual: paciente refiere dolor al estar de pie.",
        "Diagnóstico: M545",
        "Plan: se remite a Ortopedia para valoración.",
        "Página 1 de 3",
    ], "HISTORIA CLINICA").save(ENTRADA / "historia_p1de3.png")

    pagina([
        "SALUD TOTAL EPS",
        "Paciente: LAURA PRUEBA VEINTE     C.C. 1000000020",
        "Servicio: Terapia física",
        "N.º ORDEN DE DIRECCIONAMIENTO: 445566",
        f"Vigencia hasta: {f(25)}",
    ], "CONSULTAS PARAMEDICAS - ORDEN DE DIRECCIONAMIENTO").save(ENTRADA / "autorizacion_usada.png")

    (ENTRADA / "no_es_imagen.png").write_bytes(b"esto no es una imagen")

    # PDF de dos páginas escaneadas (sin texto seleccionable): historia completa 2 de 2.
    p1 = pagina(["Nombre: LAURA PRUEBA VEINTE   Identificación: 1000000020", "Motivo de consulta: control.",
                 "Página 1 de 2"], "HISTORIA CLINICA")
    p2 = pagina(["Enfermedad actual: evolución favorable.", "Plan: continuar manejo.", "Página 2 de 2"],
                "HISTORIA CLINICA")
    p1.save(ENTRADA / "historia_completa.pdf", save_all=True, append_images=[p2], resolution=150)

    print("Generados:", ", ".join(sorted(a.name for a in ENTRADA.iterdir())))


if __name__ == "__main__":
    main()
