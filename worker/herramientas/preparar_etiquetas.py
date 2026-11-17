"""Crea o actualiza calibracion/etiquetas.xlsx a partir de los archivos de calibracion/imagenes.

    python herramientas/preparar_etiquetas.py              # crea la plantilla o agrega archivos nuevos
    python herramientas/preparar_etiquetas.py --renombrar  # además renombra archivos nuevos con códigos

- Nunca borra lo que ya se etiquetó: solo agrega filas para archivos nuevos y marca las filas cuyo
  archivo ya no existe.
- Todo queda en calibracion/ (ignorado por git). Contiene datos reales: no sale de este equipo.
"""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = Path(__file__).resolve().parents[2] / "calibracion"
IMAGENES = RAIZ / "imagenes"
EXCEL = RAIZ / "etiquetas.xlsx"
EXTENSIONES = {".jpg", ".jpeg", ".png", ".pdf"}
FILAS_CON_FORMATO = 600  # filas con listas desplegables y colores preparados

# carpeta -> (prefijo para renombrar, tipo sugerido, EPS sugerida)
CARPETAS = {
    "orden_salud_total": ("ORD-ST", "ORDEN", "SALUD_TOTAL"),
    "orden_sos": ("ORD-SOS", "ORDEN", "SOS"),
    "orden_otra": ("ORD-OTRA", "ORDEN", ""),
    "autorizacion_salud_total": ("AUT-ST", "AUTORIZACION", "SALUD_TOTAL"),
    "ops_sos": ("OPS-SOS", "AUTORIZACION", "SOS"),
    "historia": ("HC", "HISTORIA", ""),
    "plan_tratamiento": ("PLAN", "PLAN", ""),
    "no_identificables": ("NOID", "", ""),
    "otros": ("OTRO", "OTRO", ""),
}

LISTAS = {
    "TIPO": ["ORDEN", "HISTORIA", "AUTORIZACION", "PLAN", "OTRO", "NO_IDENTIFICABLE"],
    "EPS": ["SALUD_TOTAL", "SOS", "OTRA", "NO_APARECE"],
    "LEGIBILIDAD": ["LEGIBLE", "DUDOSA", "ILEGIBLE"],
    "CAPTURA": ["FOTO", "PDF_ESCANEADO", "PDF_DIGITAL", "CAPTURA_PANTALLA"],
    "SI": ["SÍ"],
    "SINO": ["SÍ", "NO"],
    "SINO_NA": ["SÍ", "NO", "NO_APLICA"],
    "ESPECIALIDAD": [
        "FISIOTERAPIA", "FONOAUDIOLOGIA", "TERAPIA_OCUPACIONAL", "TERAPIA_RESPIRATORIA", "FISIATRIA",
        "ORTOPEDIA", "EQUIPO_INTERDISCIPLINARIO", "INFILTRACIONES", "NO_INDICA", "VARIAS",
    ],
}

# (encabezado, grupo, ancho, lista desplegable, tipos a los que aplica, ayuda)
COLUMNAS = [
    ("ID", "auto", 9, None, None, "Código interno. Lo pone el sistema."),
    ("CARPETA", "auto", 22, None, None, "Carpeta donde está el archivo."),
    ("ARCHIVO", "auto", 34, None, None, "Ruta del archivo dentro de imagenes\\. No modificar."),
    ("CASO", "auto", 14, None, None, "Subcarpeta del caso (historias de varias páginas)."),
    ("FORMATO", "auto", 9, None, None, "JPG, PNG o PDF."),
    ("PAGINAS_ARCHIVO", "auto", 10, None, None, "Páginas del PDF (1 si es imagen)."),
    ("GRUPO", "auto", 12, None, None, "AJUSTE (70 %) o VALIDACION (30 %). Lo asigna el sistema. No modificar."),
    ("TIPO_DOCUMENTO", "clasif", 18, "TIPO", None, "Qué documento es. Viene sugerido por la carpeta: corrígelo si no corresponde."),
    ("EPS", "clasif", 14, "EPS", None, "EPS que aparece EN EL DOCUMENTO. NO_APARECE si no figura."),
    ("LEGIBILIDAD", "clasif", 13, "LEGIBILIDAD", None,
     "LEGIBLE: se lee todo. DUDOSA: se lee con esfuerzo o falta algo. ILEGIBLE: una persona no puede leer los datos clave."),
    ("CAPTURA", "clasif", 18, "CAPTURA", None, "Cómo se obtuvo: foto de celular, PDF escaneado, PDF digital o captura de pantalla."),
    ("GIRADA", "clasif", 9, "SI", None, "SÍ si el documento está de lado o al revés. Vacío = no."),
    ("BORROSA", "clasif", 9, "SI", None, "SÍ si está desenfocada o movida."),
    ("OSCURA_O_REFLEJO", "clasif", 11, "SI", None, "SÍ si hay poca luz, sombras o reflejos."),
    ("CORTADA", "clasif", 9, "SI", None, "SÍ si falta un borde o una parte del texto."),
    ("MANUSCRITA", "clasif", 11, "SI", None, "SÍ si tiene datos escritos a mano."),
    ("VARIOS_DOCUMENTOS", "clasif", 12, "SI", None, "SÍ si el archivo trae más de un documento (p. ej. PDF con orden e historia)."),
    ("DOCUMENTO", "dato", 15, None, "ORDEN,HISTORIA,AUTORIZACION,PLAN",
     "Número de identificación del paciente, solo dígitos (o letras si es pasaporte), SIN puntos ni espacios."),
    ("NOMBRE", "dato", 28, None, "ORDEN,HISTORIA,AUTORIZACION,PLAN", "Nombre completo tal como aparece."),
    ("SERVICIO", "dato", 30, None, "ORDEN,AUTORIZACION", "Servicio o procedimiento solicitado, tal como está escrito."),
    ("DIAGNOSTICO_CIE10", "dato", 12, None, "ORDEN,HISTORIA,PLAN", "Código CIE-10 (ej. M545). Solo el código, sin descripción."),
    ("FECHA_EMISION", "dato", 13, None, "ORDEN,HISTORIA,AUTORIZACION,PLAN",
     "Fecha de expedición o de atención. Formato DD/MM/AAAA."),
    ("FECHA_VENCIMIENTO", "dato", 13, None, "ORDEN,AUTORIZACION", "«Válida hasta», «vence», «vigencia». Formato DD/MM/AAAA."),
    ("NUMERO_ORDEN", "dato", 18, None, "ORDEN,AUTORIZACION", "Número de orden, autorización u OPS, tal como aparece."),
    ("PAGINA_ACTUAL", "dato", 9, None, "HISTORIA", "Número X de «Página X de Y» (vacío en PDF de varias páginas)."),
    ("PAGINA_TOTAL", "dato", 9, None, "HISTORIA", "Número Y de «Página X de Y»."),
    ("DIRECCIONAMIENTO_CON_VALOR", "dato", 14, "SINO_NA", "AUTORIZACION",
     "Solo Salud Total: SÍ si el campo «N.º ORDEN DE DIRECCIONAMIENTO» tiene un número; NO si está vacío."),
    ("ESPECIALIDAD_INDICADA", "dato", 22, "ESPECIALIDAD", "HISTORIA",
     "Especialidad a la que la historia remite o indica valoración. NO_INDICA si no lo dice."),
    ("EMITIDA_POR_PROMOVER", "dato", 11, "SINO", "ORDEN", "SÍ si la orden la expidió PROMOVER."),
    ("ETIQUETADO_POR", "control", 11, None, None, "Iniciales de quien llenó la fila."),
    ("REVISADO_POR", "control", 11, None, None, "Iniciales de la segunda persona (solo en las filas de revisión cruzada)."),
    ("OBSERVACIONES", "control", 30, None, None, "Dudas o detalles. NO escribir datos del paciente aquí."),
    ("ESTADO_FILA", "control", 16, None, None, "Lo calcula el Excel: FALTA CLASIFICAR, LISTA o ARCHIVO_NO_ENCONTRADO."),
]
CAMPOS_FECHA = {"FECHA_EMISION", "FECHA_VENCIMIENTO"}
CAMPOS_TEXTO = {"ID", "ARCHIVO", "DOCUMENTO", "NUMERO_ORDEN", "DIAGNOSTICO_CIE10", "FECHA_EMISION", "FECHA_VENCIMIENTO"}

COLORES = {
    "auto": ("475569", "F1F5F9"),
    "clasif": ("1D4ED8", "EFF6FF"),
    "dato": ("047857", "ECFDF5"),
    "control": ("B45309", "FFFBEB"),
}
GRIS_NO_APLICA = PatternFill("solid", fgColor="D9D9D9")
ROJO_ERROR = PatternFill("solid", fgColor="FECACA")
BORDE = Border(bottom=Side(style="thin", color="CBD5E1"))

COL = {nombre: get_column_letter(i + 1) for i, (nombre, *_r) in enumerate(COLUMNAS)}


def grupo_para(archivo: str) -> str:
    """70 % AJUSTE / 30 % VALIDACION, fijo por archivo (no cambia si se vuelve a ejecutar)."""
    return "VALIDACION" if int(hashlib.sha256(archivo.encode()).hexdigest(), 16) % 10 < 3 else "AJUSTE"


def paginas_pdf(ruta: Path) -> int | str:
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(ruta))
        n = len(pdf)
        pdf.close()
        return n
    except Exception:  # noqa: BLE001 - protegido o dañado: se anota para revisión
        return "NO_ABRE"


def archivos_actuales() -> list[Path]:
    return sorted(
        p for p in IMAGENES.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONES and not any(x.startswith("_EJEMPLO") for x in p.parts)
    )


def renombrar_nuevos(conocidos: set[str]) -> int:
    """Renombra archivos (y carpetas de caso) que aún no están en el Excel a códigos sin datos
    personales: ORD-SOS-001.jpg, historia/H001/H001-p01.jpg, etc."""
    cambios = 0
    validos = lambda r: r.is_file() and r.suffix.lower() in EXTENSIONES  # noqa: E731

    # Carpetas de caso de las historias: H001, H002…
    base_hc = IMAGENES / "historia"
    if base_hc.exists():
        usados = {d.name for d in base_hc.iterdir() if d.is_dir()}
        n = 0
        for caso in sorted(d for d in base_hc.iterdir() if d.is_dir() and not d.name.startswith("_EJEMPLO")):
            if re.fullmatch(r"H\d{3}", caso.name) or any(
                q.relative_to(IMAGENES).as_posix() in conocidos for q in caso.iterdir()
            ):
                continue
            while True:
                n += 1
                if f"H{n:03d}" not in usados:
                    break
            usados.add(f"H{n:03d}")
            caso.rename(caso.with_name(f"H{n:03d}"))
            cambios += 1

    for carpeta, (prefijo, _t, _e) in CARPETAS.items():
        base = IMAGENES / carpeta
        if not base.exists():
            continue
        # Páginas dentro de cada caso: se numeran una sola vez, en orden alfabético del nombre original.
        for caso in (d for d in base.iterdir() if d.is_dir() and not d.name.startswith("_EJEMPLO")):
            paginas = sorted(q for q in caso.iterdir() if validos(q))
            if any(q.relative_to(IMAGENES).as_posix() in conocidos for q in paginas):
                continue
            temporales = []
            for i, q in enumerate(paginas, start=1):
                destino = q.with_name(f"{caso.name}-p{i:02d}{q.suffix.lower()}")
                if q != destino:
                    tmp = q.with_name(f"__tmp_{i:02d}{q.suffix.lower()}")
                    q.rename(tmp)
                    temporales.append((tmp, destino))
            for tmp, destino in temporales:
                tmp.rename(destino)
                cambios += 1
        # Archivos sueltos de la carpeta.
        usados = {q.stem for q in base.iterdir() if q.is_file()}
        n = 0
        for ruta in sorted(q for q in base.iterdir() if validos(q)):
            if ruta.relative_to(IMAGENES).as_posix() in conocidos or re.fullmatch(rf"{re.escape(prefijo)}-\d{{3}}", ruta.stem):
                continue
            while True:
                n += 1
                nuevo_nombre = f"{prefijo}-{n:03d}"
                if nuevo_nombre not in usados:
                    break
            usados.add(nuevo_nombre)
            ruta.rename(ruta.with_name(nuevo_nombre + ruta.suffix.lower()))
            cambios += 1
    return cambios


def hoja_listas(wb: Workbook):
    ws = wb.create_sheet("Listas")
    for c, (nombre, valores) in enumerate(LISTAS.items(), start=1):
        ws.cell(row=1, column=c, value=nombre).font = Font(bold=True)
        for f, v in enumerate(valores, start=2):
            ws.cell(row=f, column=c, value=v)
    ws.sheet_state = "hidden"
    return {nombre: f"Listas!${get_column_letter(c)}$2:${get_column_letter(c)}${len(v) + 1}"
            for c, (nombre, v) in enumerate(LISTAS.items(), start=1)}


def hoja_instrucciones(wb: Workbook):
    ws = wb.active
    ws.title = "Instrucciones"
    lineas = [
        ("ETIQUETAS PARA CALIBRAR EL OCR · PROMOVER S.A.S.", "titulo"),
        ("Contiene datos de salud reales: no enviar, no copiar fuera de este equipo. Se borra al terminar.", "alerta"),
        ("", None),
        ("CÓMO LLENAR LA HOJA «Etiquetas»", "sub"),
        ("1. Abre el archivo de la columna ARCHIVO (carpeta calibracion\\imagenes) y llena SU fila.", None),
        ("2. Columnas GRISES: las llena el sistema. No las modifiques.", None),
        ("3. Columnas AZULES (clasificación): llénalas SIEMPRE. TIPO y EPS vienen sugeridas por la carpeta: corrígelas si no corresponden.", None),
        ("4. Columnas VERDES (datos): copia lo que DICE el documento, aunque parezca un error. Si un dato no aparece o no se lee, DEJA LA CELDA VACÍA.", None),
        ("   Nunca completes con lo que «debería» decir ni con datos de otro documento: el objetivo es medir si el sistema inventa.", None),
        ("5. Las celdas que se ponen GRISES al elegir el TIPO no aplican a ese documento: déjalas vacías.", None),
        ("6. Fechas en formato DD/MM/AAAA (ej. 05/11/2026). Documento sin puntos ni espacios. Si la celda se pone ROJA, el formato está mal.", None),
        ("7. Si la LEGIBILIDAD es ILEGIBLE, solo llena las columnas azules: no intentes adivinar los datos.", None),
        ("8. ETIQUETADO_POR: tus iniciales. OBSERVACIONES: dudas, sin datos del paciente.", None),
        ("9. ESTADO_FILA dice LISTA cuando las columnas azules obligatorias están completas.", None),
        ("", None),
        ("REVISIÓN CRUZADA (control de calidad)", "sub"),
        ("Una segunda persona vuelve a etiquetar 1 de cada 10 filas (ID terminado en 0) en una COPIA del archivo, sin mirar la primera.", None),
        ("Así se mide qué tan consistentes son las etiquetas. Pon tus iniciales en REVISADO_POR.", None),
        ("", None),
        ("CUANDO AGREGUES MÁS ARCHIVOS", "sub"),
        ("Cierra el Excel y pide que se ejecute preparar_etiquetas.py: agrega las filas nuevas sin borrar lo ya escrito.", None),
        ("La hoja «Resumen» muestra cuántos archivos hay por carpeta y cuántos están listos.", None),
    ]
    estilos = {
        "titulo": Font(bold=True, size=14, color="0F766E"),
        "alerta": Font(bold=True, color="B91C1C"),
        "sub": Font(bold=True, size=11, color="1D4ED8"),
    }
    for i, (texto, estilo) in enumerate(lineas, start=1):
        c = ws.cell(row=i, column=1, value=texto)
        if estilo:
            c.font = estilos[estilo]
        c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.column_dimensions["A"].width = 125
    leyenda = [("Automática (no tocar)", "auto"), ("Clasificación (obligatoria)", "clasif"),
               ("Datos del documento", "dato"), ("Control", "control")]
    fila = len(lineas) + 2
    ws.cell(row=fila, column=1, value="LEYENDA DE COLORES").font = estilos["sub"]
    for j, (texto, grupo) in enumerate(leyenda, start=1):
        c = ws.cell(row=fila + j, column=1, value=texto)
        c.fill = PatternFill("solid", fgColor=COLORES[grupo][0])
        c.font = Font(bold=True, color="FFFFFF")
    c = ws.cell(row=fila + 5, column=1, value="Celda gris dentro de los datos = no aplica a ese tipo de documento")
    c.fill = GRIS_NO_APLICA


def hoja_etiquetas(wb: Workbook, rangos: dict[str, str]):
    ws = wb.create_sheet("Etiquetas")
    for i, (nombre, grupo, ancho, _l, _a, ayuda) in enumerate(COLUMNAS, start=1):
        c = ws.cell(row=1, column=i, value=nombre)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=COLORES[grupo][0])
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        c.comment = Comment(ayuda, "PROMOVER")
        ws.column_dimensions[get_column_letter(i)].width = ancho
    ws.row_dimensions[1].height = 42
    ws.freeze_panes = "H2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNAS))}{FILAS_CON_FORMATO + 1}"

    ultima = FILAS_CON_FORMATO + 1
    for i, (nombre, grupo, _w, lista, aplica, _h) in enumerate(COLUMNAS, start=1):
        letra = get_column_letter(i)
        rango = f"{letra}2:{letra}{ultima}"
        if lista:
            dv = DataValidation(type="list", formula1=f"={rangos[lista]}", allow_blank=True,
                                showErrorMessage=True, errorTitle="Valor no válido",
                                error="Elige un valor de la lista desplegable.")
            ws.add_data_validation(dv)
            dv.add(rango)
        if aplica:
            # Gris si no aplica al tipo elegido.
            formula = f'AND(${COL["TIPO_DOCUMENTO"]}2<>"",ISERROR(SEARCH(${COL["TIPO_DOCUMENTO"]}2,"{aplica}")))'
            ws.conditional_formatting.add(rango, FormulaRule(formula=[formula], fill=GRIS_NO_APLICA, stopIfTrue=True))
        if nombre in CAMPOS_FECHA:
            mal = f'AND({letra}2<>"",OR(LEN({letra}2)<>10,MID({letra}2,3,1)<>"/",MID({letra}2,6,1)<>"/"))'
            ws.conditional_formatting.add(rango, FormulaRule(formula=[mal], fill=ROJO_ERROR))
        if nombre == "DOCUMENTO":
            mal = f'AND({letra}2<>"",OR(ISNUMBER(SEARCH(".",{letra}2)),ISNUMBER(SEARCH(" ",{letra}2)),ISNUMBER(SEARCH(",",{letra}2))))'
            ws.conditional_formatting.add(rango, FormulaRule(formula=[mal], fill=ROJO_ERROR))
        if nombre in CAMPOS_TEXTO:
            for f in range(2, ultima + 1):
                ws.cell(row=f, column=i).number_format = "@"
        if grupo == "auto":
            ws.conditional_formatting.add(
                rango, FormulaRule(formula=[f'${COL["ARCHIVO"]}2<>""'], fill=PatternFill("solid", fgColor=COLORES["auto"][1])))
    return ws


def formula_estado(f: int) -> str:
    c = COL
    return (f'=IF({c["ARCHIVO"]}{f}="","",IF(OR({c["TIPO_DOCUMENTO"]}{f}="",{c["EPS"]}{f}="",'
            f'{c["LEGIBILIDAD"]}{f}="",{c["CAPTURA"]}{f}=""),"FALTA CLASIFICAR","LISTA"))')


def hoja_resumen(wb: Workbook):
    ws = wb.create_sheet("Resumen")
    ws.append(["CARPETA", "ARCHIVOS", "LISTOS", "META (15-25)", "ILEGIBLES", "VALIDACIÓN"])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0F766E")
    e = "Etiquetas!"
    for i, carpeta in enumerate(CARPETAS, start=2):
        ws.append([
            carpeta,
            f'=COUNTIF({e}${COL["CARPETA"]}:${COL["CARPETA"]},A{i})',
            f'=COUNTIFS({e}${COL["CARPETA"]}:${COL["CARPETA"]},A{i},{e}${COL["ESTADO_FILA"]}:${COL["ESTADO_FILA"]},"LISTA")',
            f'=IF(B{i}<15,"Faltan "&(15-B{i}),"OK")',
            f'=COUNTIFS({e}${COL["CARPETA"]}:${COL["CARPETA"]},A{i},{e}${COL["LEGIBILIDAD"]}:${COL["LEGIBILIDAD"]},"ILEGIBLE")',
            f'=COUNTIFS({e}${COL["CARPETA"]}:${COL["CARPETA"]},A{i},{e}${COL["GRUPO"]}:${COL["GRUPO"]},"VALIDACION")',
        ])
    total = len(CARPETAS) + 2
    ws.append(["TOTAL", f"=SUM(B2:B{total - 1})", f"=SUM(C2:C{total - 1})", "", f"=SUM(E2:E{total - 1})", f"=SUM(F2:F{total - 1})"])
    for c in ws[total]:
        c.font = Font(bold=True)
    for letra, ancho in zip("ABCDEF", (28, 11, 9, 14, 11, 12)):
        ws.column_dimensions[letra].width = ancho


def crear_libro() -> Workbook:
    wb = Workbook()
    hoja_instrucciones(wb)
    rangos = hoja_listas(wb)
    hoja_etiquetas(wb, rangos)
    hoja_resumen(wb)
    wb.move_sheet("Listas", offset=10)
    return wb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--renombrar", action="store_true", help="renombra archivos nuevos con códigos sin datos personales")
    args = parser.parse_args()
    IMAGENES.mkdir(parents=True, exist_ok=True)

    wb = load_workbook(EXCEL) if EXCEL.exists() else crear_libro()
    ws = wb["Etiquetas"]
    conocidos = {ws.cell(row=f, column=3).value: f for f in range(2, ws.max_row + 1) if ws.cell(row=f, column=3).value}

    if args.renombrar:
        print(f"Archivos renombrados: {renombrar_nuevos(set(conocidos))}")

    actuales = archivos_actuales()
    relativos = {p.relative_to(IMAGENES).as_posix(): p for p in actuales}
    siguiente = 2
    while ws.cell(row=siguiente, column=3).value:
        siguiente += 1
    ids = [int(str(v)[2:]) for v in (ws.cell(row=f, column=1).value for f in range(2, siguiente)) if v and str(v).startswith("E-")]
    n_id = max(ids, default=0)

    nuevos = 0
    for relativa, ruta in relativos.items():
        if relativa in conocidos:
            continue
        partes = relativa.split("/")
        carpeta = partes[0]
        _p, tipo, eps = CARPETAS.get(carpeta, ("", "", ""))
        caso = partes[1] if len(partes) > 2 else ""
        formato = ruta.suffix.lower().lstrip(".").replace("jpeg", "jpg").upper()
        n_id += 1
        fila = [f"E-{n_id:04d}", carpeta, relativa, caso, formato,
                paginas_pdf(ruta) if formato == "PDF" else 1, grupo_para(relativa), tipo, eps]
        for c, v in enumerate(fila, start=1):
            ws.cell(row=siguiente, column=c, value=v)
        if formato == "PDF":
            ws.cell(row=siguiente, column=11, value=None)
        ws[f'{COL["ESTADO_FILA"]}{siguiente}'] = formula_estado(siguiente)
        siguiente += 1
        nuevos += 1

    faltantes = 0
    for relativa, f in conocidos.items():
        celda = ws[f'{COL["ESTADO_FILA"]}{f}']
        if relativa not in relativos:
            celda.value = "ARCHIVO_NO_ENCONTRADO"
            faltantes += 1
        elif celda.value == "ARCHIVO_NO_ENCONTRADO":
            celda.value = formula_estado(f)

    wb.save(EXCEL)
    print(f"Excel: {EXCEL}")
    print(f"Archivos en carpetas: {len(actuales)} · filas nuevas: {nuevos} · archivos que ya no están: {faltantes}")


if __name__ == "__main__":
    main()
