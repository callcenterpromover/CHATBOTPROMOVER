"""Genera worker/recursos/ocr.ico (círculo verde azulado con «OCR») para el acceso directo."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DESTINO = Path(__file__).resolve().parent.parent / "recursos" / "ocr.ico"


def main() -> None:
    DESTINO.parent.mkdir(exist_ok=True)
    lado = 256
    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 8, lado - 8, lado - 8), radius=56, fill=(15, 118, 110, 255))
    d.rounded_rectangle((48, 70, lado - 48, lado - 70), radius=14, outline=(255, 255, 255, 255), width=10)
    try:
        fuente = ImageFont.truetype("arialbd.ttf", 64)
    except OSError:
        fuente = ImageFont.load_default()
    d.text((lado / 2, lado / 2), "OCR", font=fuente, fill=(255, 255, 255, 255), anchor="mm")
    img.save(DESTINO, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Icono creado: {DESTINO}")


if __name__ == "__main__":
    main()
