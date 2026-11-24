"""Compara la extracción del worker con las etiquetas humanas de calibración.

    python herramientas/medir_ocr.py [--grupo AJUSTE|VALIDACION|TODOS] [--etiquetas archivo.xlsx]
                                     [--ronda N] [--detalle]

Usa el caché de herramientas/ocr_calibracion.py (no repite el OCR) y la extracción ACTUAL de
promover_worker/extraccion.py, así que sirve para medir cada ajuste de reglas.

Resultado por campo:
  OK         la etiqueta tiene valor y el sistema extrajo el mismo
  ERROR      la etiqueta tiene valor y el sistema extrajo otro (dato equivocado)
  OMITIDO    la etiqueta tiene valor y el sistema no extrajo nada (aceptable: no inventa)
  INVENTADO  la etiqueta está vacía y el sistema extrajo algo (lo más grave)
  VACIO_OK   ninguno de los dos tiene valor

En pantalla solo salen conteos. Con --detalle se escribe en calibracion/resultados/ un CSV con
los valores (datos de salud: queda solo en calibracion/, que no sale del equipo).
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
import sys
import unicodedata
import warnings
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from promover_worker import ocr  # noqa: E402
from promover_worker.extraccion import extraer  # noqa: E402

from openpyxl import load_workbook  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2] / "calibracion"
CACHE = RAIZ / "_ocr_cache.jsonl"
RESULTADOS = RAIZ / "resultados"
DECISIONES = RAIZ / "decisiones.json"  # decisiones de PROMOVER sobre etiquetas (tipo, duplicados)
# Campos que el equipo usa al agendar (PROMOVER, 2026-11): se resumen aparte.
PRIORITARIOS = ["EPS", "TIPO_DOCUMENTO", "DOCUMENTO", "NOMBRE", "FECHA_VENCIMIENTO", "SERVICIO"]

CAMPOS = [
    "TIPO_DOCUMENTO", "EPS", "DOCUMENTO", "NOMBRE", "SERVICIO", "DIAGNOSTICO_CIE10",
    "FECHA_EMISION", "FECHA_VENCIMIENTO", "NUMERO_ORDEN", "PAGINA_ACTUAL", "PAGINA_TOTAL",
    "DIRECCIONAMIENTO_CON_VALOR", "ESPECIALIDAD_INDICADA", "EMITIDA_POR_PROMOVER",
]
# Campos que solo se evalúan para ciertos tipos (según la etiqueta humana).
SOLO_TIPOS = {
    "DIRECCIONAMIENTO_CON_VALOR": {"AUTORIZACION", "ORDEN"},
    "ESPECIALIDAD_INDICADA": {"HISTORIA"},
    "EMITIDA_POR_PROMOVER": {"ORDEN"},
    "SERVICIO": {"ORDEN", "AUTORIZACION"},
    "FECHA_VENCIMIENTO": {"ORDEN", "AUTORIZACION"},
    "NUMERO_ORDEN": {"ORDEN", "AUTORIZACION"},
    "PAGINA_ACTUAL": {"HISTORIA"},
    "PAGINA_TOTAL": {"HISTORIA"},
}


def norm(s: object) -> str:
    s = "" if s is None else str(s)
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.upper()).strip()


def alnum(s: object) -> str:
    return re.sub(r"[^0-9A-Z]", "", norm(s))


def fecha_iso(s: object) -> str:
    """dd/mm/aaaa de la etiqueta -> aaaa-mm-dd."""
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", norm(s))
    return f"{m[3]}-{m[2]}-{m[1]}" if m else norm(s)


def esperado(campo: str, fila: dict) -> str:
    """Valor que el sistema debería devolver según la etiqueta ('' = nada)."""
    v = fila.get(campo)
    if campo == "EPS":
        return {"SALUD_TOTAL": "SALUD_TOTAL", "SOS": "SOS"}.get(norm(v), "")
    if campo == "DIRECCIONAMIENTO_CON_VALOR":
        return {"SI": "SI", "NO": "NO"}.get(norm(v), "")
    if campo == "EMITIDA_POR_PROMOVER":
        return {"SI": "SI", "NO": "NO"}.get(norm(v), "")
    if campo == "ESPECIALIDAD_INDICADA":
        return "" if norm(v) in ("", "NO_INDICA", "VARIAS") else norm(v)
    if campo in ("FECHA_EMISION", "FECHA_VENCIMIENTO"):
        return fecha_iso(v) if v else ""
    if campo in ("DOCUMENTO", "NUMERO_ORDEN", "DIAGNOSTICO_CIE10"):
        return alnum(v)
    if campo in ("PAGINA_ACTUAL", "PAGINA_TOTAL"):
        return str(int(float(v))) if v not in (None, "") else ""
    return norm(v)


def obtenido(campo: str, ex) -> str:
    if campo == "TIPO_DOCUMENTO":
        return ex.tipo_documento
    if campo == "DIRECCIONAMIENTO_CON_VALOR":
        return "" if ex.direccionamiento_con_valor is None else ("SI" if ex.direccionamiento_con_valor else "NO")
    if campo == "EMITIDA_POR_PROMOVER":
        return "SI" if ex.emitida_por_promover else "NO"
    if campo == "ESPECIALIDAD_INDICADA":
        return ex.especialidad_en_historia or ""
    if campo == "PAGINA_ACTUAL":
        return str(ex.pagina_actual or "")
    if campo == "PAGINA_TOTAL":
        return str(ex.pagina_total or "")
    nombre = {"DIAGNOSTICO_CIE10": "DIAGNOSTICO"}.get(campo, campo)
    v = ex.valor(nombre)
    if v is None:
        return ""
    if campo in ("DOCUMENTO", "NUMERO_ORDEN", "DIAGNOSTICO_CIE10"):
        return alnum(v)
    return norm(v)


def coincide(campo: str, esp: str, obt: str) -> bool:
    if campo == "NOMBRE":
        a, b = set(esp.split()), set(obt.split())
        return bool(a) and len(a & b) / len(a) >= 0.75
    if campo == "SERVICIO":
        return difflib.SequenceMatcher(None, esp, obt).ratio() >= 0.6 or (obt and obt in esp)
    return esp == obt


def resultado(campo: str, esp: str, obt: str) -> str:
    if esp and obt:
        return "OK" if coincide(campo, esp, obt) else "ERROR"
    if esp:
        return "OMITIDO"
    return "INVENTADO" if obt else "VACIO_OK"


def cargar_etiquetas(ruta: Path) -> list[dict]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ws = load_workbook(ruta, read_only=True)["Etiquetas"]
    filas = ws.iter_rows(values_only=True)
    cab = list(next(filas))
    return [dict(zip(cab, f)) for f in filas if f and f[0]]


def legibilidad_sistema(paginas: list[dict]) -> str:
    orden = {"ILEGIBLE": 0, "POSIBLEMENTE_ILEGIBLE": 1, "LEGIBLE": 2}
    # Se recalcula con los umbrales actuales de ocr.Pagina (no con los guardados en el caché).
    actuales = [ocr.Pagina(p["texto"], p["confianza"], p["palabras"], p["nitidez"]).legibilidad for p in paginas]
    return min(actuales, key=orden.get, default="ILEGIBLE")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grupo", default="AJUSTE", choices=["AJUSTE", "VALIDACION", "TODOS"])
    ap.add_argument("--etiquetas", default=str(RAIZ / "etiquetas_revisado.xlsx"))
    ap.add_argument("--ronda", default="0")
    ap.add_argument("--detalle", action="store_true")
    args = ap.parse_args()

    cache = {}
    for linea in CACHE.read_text(encoding="utf-8").splitlines():
        if linea.strip():
            d = json.loads(linea)
            cache[d["archivo"]] = d
    decisiones = json.loads(DECISIONES.read_text(encoding="utf-8")) if DECISIONES.exists() else {}
    excluir = set(decisiones.get("excluir", []))
    filas = [f for f in cargar_etiquetas(Path(args.etiquetas))
             if (args.grupo == "TODOS" or f.get("GRUPO") == args.grupo) and f["ARCHIVO"] not in excluir]
    if decisiones.get("direccionamiento_es_orden"):
        for f in filas:
            if f.get("CARPETA") == "autorizacion_salud_total" and norm(f.get("TIPO_DOCUMENTO")) == "AUTORIZACION":
                f["TIPO_DOCUMENTO"] = "ORDEN"

    conteo: dict[str, Counter] = defaultdict(Counter)
    tipos: Counter = Counter()
    legib: Counter = Counter()
    sin_ocr = 0
    detalle: list[list] = []
    for f in filas:
        c = cache.get(f["ARCHIVO"])
        if not c or "paginas" not in c:
            sin_ocr += 1
            continue
        texto = "\n".join(p["texto"] for p in c["paginas"])
        ex = extraer(texto)
        tipo_etq = norm(f.get("TIPO_DOCUMENTO"))
        tipos[(tipo_etq, ex.tipo_documento)] += 1
        legib[(norm(f.get("LEGIBILIDAD")), legibilidad_sistema(c["paginas"]))] += 1
        ilegible = norm(f.get("LEGIBILIDAD")) == "ILEGIBLE"
        varias_paginas = len(c["paginas"]) > 1
        for campo in CAMPOS:
            if campo == "EMITIDA_POR_PROMOVER" and not esperado(campo, f):
                continue
            if campo in SOLO_TIPOS and tipo_etq not in SOLO_TIPOS[campo]:
                continue
            if campo == "PAGINA_ACTUAL" and varias_paginas:
                continue
            if ilegible and campo != "TIPO_DOCUMENTO":
                continue
            esp = norm(f.get("TIPO_DOCUMENTO")) if campo == "TIPO_DOCUMENTO" else esperado(campo, f)
            obt = obtenido(campo, ex)
            res = resultado(campo, esp, obt)
            conteo[campo][res] += 1
            if args.detalle and res not in ("OK", "VACIO_OK"):
                detalle.append([f["ID"], f["ARCHIVO"], campo, res, esp, obt])

    print(f"Grupo {args.grupo}: {len(filas)} archivos · sin OCR: {sin_ocr}\n")
    print(f"{'CAMPO':28} {'OK':>4} {'ERROR':>6} {'OMIT':>5} {'INVENT':>7} {'VACIO':>6}  precisión  cobertura")
    for campo in CAMPOS:
        k = conteo[campo]
        extraidos = k["OK"] + k["ERROR"] + k["INVENTADO"]
        con_valor = k["OK"] + k["ERROR"] + k["OMITIDO"]
        prec = f"{100 * k['OK'] / extraidos:5.1f}%" if extraidos else "   - "
        cob = f"{100 * k['OK'] / con_valor:5.1f}%" if con_valor else "   - "
        print(f"{campo:28} {k['OK']:>4} {k['ERROR']:>6} {k['OMITIDO']:>5} {k['INVENTADO']:>7} {k['VACIO_OK']:>6}  {prec:>9}  {cob:>9}")

    ok = sum(conteo[c]["OK"] for c in PRIORITARIOS)
    err = sum(conteo[c]["ERROR"] + conteo[c]["INVENTADO"] for c in PRIORITARIOS)
    con = sum(conteo[c]["OK"] + conteo[c]["ERROR"] + conteo[c]["OMITIDO"] for c in PRIORITARIOS)
    print(f"\nCampos prioritarios (EPS, tipo, documento, nombre, vencimiento, servicio): "
          f"precisión {100 * ok / max(ok + err, 1):.1f}% · cobertura {100 * ok / max(con, 1):.1f}%")
    print(f"Duplicados excluidos: {len(excluir)}")
    print("\nTipo de documento (etiqueta -> sistema):")
    for (a, b), n in sorted(tipos.items()):
        print(f"  {a:14} -> {b:14} {n}")
    print("\nLegibilidad (etiqueta -> sistema):")
    for (a, b), n in sorted(legib.items()):
        print(f"  {a:10} -> {b:22} {n}")

    if args.detalle:
        RESULTADOS.mkdir(exist_ok=True)
        ruta = RESULTADOS / f"ronda_{args.ronda}_{args.grupo.lower()}.csv"
        with ruta.open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh)
            w.writerow(["ID", "ARCHIVO", "CAMPO", "RESULTADO", "ESPERADO", "OBTENIDO"])
            w.writerows(detalle)
        print(f"\nDetalle: {ruta}")


if __name__ == "__main__":
    main()
