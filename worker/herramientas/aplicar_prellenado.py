"""Vuelca a calibracion/etiquetas.xlsx las etiquetas sugeridas en calibracion/prellenado.jsonl.

    python herramientas/aplicar_prellenado.py

Cada línea del JSONL es un objeto con "ARCHIVO" y columnas del Excel (mismos nombres). Solo llena
celdas vacías: nunca pisa lo que una persona ya escribió. Marca ETIQUETADO_POR = "IA" y deja en
OBSERVACIONES "Prellenado IA: verificar" para que la revisión humana lo compare con la imagen.
"""

from __future__ import annotations

import json
from pathlib import Path

from openpyxl import load_workbook

RAIZ = Path(__file__).resolve().parents[2] / "calibracion"
EXCEL = RAIZ / "etiquetas.xlsx"
JSONL = RAIZ / "prellenado.jsonl"
MARCA = "Prellenado IA: verificar"


def main() -> None:
    sugerencias: dict[str, dict] = {}
    for linea in JSONL.read_text(encoding="utf-8").splitlines():
        if linea.strip():
            d = json.loads(linea)
            sugerencias[d.pop("ARCHIVO")] = d  # la última línea de un archivo gana

    wb = load_workbook(EXCEL)
    ws = wb["Etiquetas"]
    col = {c.value: c.column for c in ws[1] if c.value}
    llenadas = filas = 0
    desconocidas: set[str] = set()
    for f in range(2, ws.max_row + 1):
        archivo = ws.cell(row=f, column=col["ARCHIVO"]).value
        d = sugerencias.get(archivo)
        if not d:
            continue
        filas += 1
        for campo, valor in d.items():
            if campo == "OBSERVACIONES" or valor in (None, ""):
                continue
            if campo not in col:
                desconocidas.add(campo)
                continue
            celda = ws.cell(row=f, column=col[campo])
            if celda.value in (None, ""):
                celda.value = str(valor)
                llenadas += 1
        if not ws.cell(row=f, column=col["ETIQUETADO_POR"]).value:
            ws.cell(row=f, column=col["ETIQUETADO_POR"]).value = "IA"
        obs = ws.cell(row=f, column=col["OBSERVACIONES"])
        if not (obs.value or "").startswith(MARCA):
            nota = d.get("OBSERVACIONES")
            obs.value = f"{MARCA}." + (f" {nota}" if nota else "") + (f" | {obs.value}" if obs.value else "")
    wb.save(EXCEL)
    print(f"Filas prellenadas: {filas} · celdas llenadas: {llenadas} · sugerencias: {len(sugerencias)}")
    if desconocidas:
        print("Columnas desconocidas (ignoradas):", ", ".join(sorted(desconocidas)))


if __name__ == "__main__":
    main()
