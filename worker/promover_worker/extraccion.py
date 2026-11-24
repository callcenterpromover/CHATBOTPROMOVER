"""Extracción de campos a partir del texto OCR.

Reglas (documento 06): nunca inventar un campo; si algo no se lee con claridad se
devuelve con confianza BAJA o no se devuelve. El texto completo no sale de este módulo:
solo los campos mínimos.

Los patrones se calibraron con documentos reales etiquetados (calibracion/, ronda 1): formatos
de direccionamiento de Salud Total (Virrey Solís), OPS de SOS, órdenes de Comfandi, Viva 1A,
IPSMedic y FIDEM, planes de tratamiento y tarjetas de control de citas de PROMOVER.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

MESES = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6, "JULIO": 7,
    "AGOSTO": 8, "SEPTIEMBRE": 9, "SETIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
}
# Abreviaturas que imprimen los sistemas (Virrey Solís: «03 Nov 2026», sellos: «27 JUL 2026»).
MESES_CORTOS = {
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "APR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8,
    "AUG": 8, "SEP": 9, "SET": 9, "OCT": 10, "NOV": 11, "DIC": 12, "DEC": 12,
}
_MES_CORTO = "|".join(MESES_CORTOS)

# Una fecha "candidata": puede traer caracteres dudosos (?, letras por dígitos) que no se corrigen.
_FECHA = (
    r"(\d{4}\s?[-/]\s?\d{1,2}\s?[-/]\s?\d{1,2}"
    r"|[\dOo?lI]{1,2}\s?[/\-.]\s?[\dOo?lI]{1,2}\s?[/\-.]\s?\d{2,4}"
    r"|\d{1,2}\s+DE\s+[A-Z]+\s+(?:DE\s+|DEL\s+)?\d{4}"
    rf"|\d{{1,2}}\s+(?:{_MES_CORTO})[A-Z]*\.?\s+\d{{4}})"
)


def normalizar(texto: str) -> str:
    """Mayúsculas, sin tildes, espacios simples. Conserva los saltos de línea."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )
    lineas = [re.sub(r"[ \t]+", " ", linea).strip() for linea in sin_tildes.upper().splitlines()]
    return "\n".join(linea for linea in lineas if linea)


def interpretar_fecha(crudo: str) -> date | None:
    """Convierte un texto de fecha. Devuelve None si es ambigua o inválida (no adivina)."""
    t = re.sub(r"\s+", " ", crudo.strip().upper())
    try:
        if m := re.fullmatch(r"(\d{4}) ?[-/] ?(\d{1,2}) ?[-/] ?(\d{1,2})", t):
            return date(int(m[1]), int(m[2]), int(m[3]))
        if m := re.fullmatch(r"(\d{1,2}) ?[/\-.] ?(\d{1,2}) ?[/\-.] ?(\d{4})", t):
            return date(int(m[3]), int(m[2]), int(m[1]))  # formato colombiano: día/mes/año
        if m := re.fullmatch(r"(\d{1,2}) DE ([A-Z]+) (?:DE |DEL )?(\d{4})", t):
            mes = MESES.get(m[2])
            return date(int(m[3]), mes, int(m[1])) if mes else None
        if m := re.fullmatch(r"(\d{1,2}) ([A-Z]{3})[A-Z]*\.? (\d{4})", t):
            mes = MESES_CORTOS.get(m[2])
            return date(int(m[3]), mes, int(m[1])) if mes else None
    except ValueError:
        return None
    return None


@dataclass
class Campo:
    campo: str
    valor: str
    confianza: str  # ALTA | MEDIA | BAJA


@dataclass
class Extraccion:
    tipo_documento: str = "DESCONOCIDO"
    campos: list[Campo] = field(default_factory=list)
    pagina_actual: int | None = None
    pagina_total: int | None = None
    fecha_vencimiento: date | None = None
    fecha_vencimiento_texto: str | None = None
    emitida_por_promover: bool = False
    direccionamiento_con_valor: bool | None = None  # Salud Total: None = campo no encontrado
    especialidad_en_historia: str | None = None

    def valor(self, campo: str) -> str | None:
        return next((c.valor for c in self.campos if c.campo == campo), None)


# Orden de evaluación: del formato más característico al más genérico. Las historias suelen
# contener órdenes y las órdenes suelen mencionar «autorización», por eso cada tipo exige
# marcas propias de su formato.
_TIPOS = [
    ("PLAN", r"PLAN DE TRATAMIENTO|PROGRAMA DE TRATAMIENTO|PLAN TERAPEUTICO|CONTROL DE CITAS"
             r"|MEDIOS FISICOS|SENOR PACIENTE|DE SU COMPROMISO|NO\.? SESIONES"),
    # La OPS de SOS trae un campo «Historia clínica»; sus marcas propias van antes.
    ("AUTORIZACION", r"SERVICIOS AUTORIZADOS|NUMERO AUTORIZACION|AUTORIZACION DE SERVICIOS"),
    ("ORDEN", r"ORDEN MEDICA:? ?N?\.? ?\d{5,}"),
    # Encabezados propios de la historia: pesan más que las órdenes y remisiones que la historia
    # menciona en su plan («se genera direccionamiento», «orden médica»).
    ("HISTORIA", r"HISTORIA CLINICA|EPICRISIS|MOTIVO DE CONSULTA|ENFERMEDAD ACTUAL|ANALISIS Y PLAN"
                 r"|REVISION POR SISTEMAS"),
    # El direccionamiento de Salud Total se maneja como ORDEN (decisión de PROMOVER, 2026-11).
    ("ORDEN", r"DIRECCIONAMIENTO|DIRECCIONADO|CONSULTAS PARAMEDICAS"),
    ("AUTORIZACION", r"AUTORIZACION DE SERVICIOS|SERVICIOS AUTORIZADOS|NUMERO AUTORIZACION"
                     r"|ENTIDAD RESPONSABLE (?:DEL? )?PAGO"),
    ("ORDEN", r"SOLICITUDES EXTERNAS|SOLICITUD MEDICA|NUMERO DE ORDEN|ORDEN MEDICA|FORMULA MEDICA"
              r"|PRESTACION DENOMINACION|PENDIENTES AUTORIZACION|SERVICIOS A CARGO DE LA EPS"),
    ("HISTORIA", r"HISTORIA CLINICA|EPICRISIS|ANAMNESIS|ENFERMEDAD ACTUAL|EVOLUCION MEDICA"
                 r"|MOTIVO DE CONSULTA|REVISION POR SISTEMAS|EXAMEN FISICO|ANTECEDENTES"
                 r"|IMPRESION DIAGNOSTICA|ANALISIS Y PLAN"),
    ("ORDEN", r"ORDEN (?:DE SERVICIO|MEDICA)|ORDENES MEDICAS|SOLICITUD DE SERVICIOS|REMISION|SE SOLICITA"),
]


def tipo_documento(texto_norm: str) -> str:
    for tipo, patron in _TIPOS:
        if re.search(patron, texto_norm):
            return tipo
    return "DESCONOCIDO"


_ESPECIALIDADES_HISTORIA = [
    ("ORTOPEDIA", r"ORTOPEDIA|UPI OSTEOMUSCULAR"),
    ("FISIATRIA", r"FISIATRIA|MEDICINA FISICA Y REHABILITACION"),
    ("EQUIPO_INTERDISCIPLINARIO", r"EQUIPO INTERDISCIPLINARIO"),
    ("TERAPIA_OCUPACIONAL", r"TERAPIA OCUPACIONAL"),
    ("FONOAUDIOLOGIA", r"FONOAUDIOLOGIA|TERAPIA DEL? LENGUAJE"),
    ("TERAPIA_RESPIRATORIA", r"TERAPIA RESPIRATORIA"),
    ("FISIOTERAPIA", r"TERAPIAS? FISICAS?|FISIOTERAPIA"),
]
_VERBO_REMISION = r"(?:REMIT\w*|REMISION|VALORACION POR|INTERCONSULTA\w*|SE SOLICITA|SE ORDENA|CONTROL POR|MANEJO POR)"


# Sección donde el médico dice cómo sigue el proceso del paciente (PROMOVER, 2026-11).
_SECCION_ANALISIS = (
    r"ANALISIS Y (?:PLAN|MANEJO|CONDUCTA)|PLAN DE MANEJO|PLAN Y MANEJO|CONDUCTA|PLAN DE TRATAMIENTO"
    r"|ORDENES MEDICAS|\bANALISIS\b|\bPLAN\s*:"
)


def _especialidad_indicada(t: str) -> str | None:
    """Especialidad que la historia indica de forma explícita. Primero se busca en la sección de
    análisis y manejo (cualquier mención); si no hay sección o no es concluyente, en todo el texto
    con un verbo de remisión. Si hay más de una distinta, no se elige ninguna."""
    if m := re.search(_SECCION_ANALISIS, t):
        seccion = t[m.start():]
        halladas = {cat for cat, patron in _ESPECIALIDADES_HISTORIA if re.search(patron, seccion)}
        if len(halladas) == 1:
            return halladas.pop()
        if len(halladas) > 1:
            return None
    halladas = {
        categoria
        for categoria, patron in _ESPECIALIDADES_HISTORIA
        if re.search(rf"{_VERBO_REMISION}[^\n]{{0,40}}?(?:{patron})", t)
    }
    return halladas.pop() if len(halladas) == 1 else None


def _fecha(patron_rotulo: str, t: str) -> tuple[date | None, str] | None:
    """Primera fecha rotulada. Un año fuera de rango (el OCR lee 2076 o 2028) se devuelve como
    texto dudoso, sin interpretar."""
    if m := re.search(rf"(?:{patron_rotulo})[^\d\n]{{0,20}}{_FECHA}", t):
        f = interpretar_fecha(m[1])
        if f and not (date.today().year - 3 <= f.year <= date.today().year + 2):
            f = None
        return f, m[1]
    return None


# Lugares donde «PROMOVER» aparece sin que PROMOVER haya emitido el documento: como prestador
# al que se direcciona, en datos de contacto que otra IPS imprime o en la remisión.
_PROMOVER_COMO_DESTINO = r"PROMOVER\W{0,5}(?:TEL|DIRECCION|UPI)|\*+ ?PROMOVER|NOMBRE: ?PROMOVER"
_OTRO_EMISOR = (
    r"COMFANDI|VIVA 1A|IPS ?MEDIC|FIDEM|VIRREY|CLINICA|HOSPITAL|SOLICITUDES EXTERNAS|DIRECCIONAMIENTO"
    r"|SERVICIOS AUTORIZADOS|CENTRO MEDICO|IMBANACO|VERSALLES"
)


def extraer(texto: str) -> Extraccion:
    t = normalizar(texto)
    r = Extraccion(tipo_documento=tipo_documento(t))

    # Documento de identidad: solo si viene rotulado. Se evita el documento del médico
    # («Profesional ... Documento», «Registro médico») y el NIT del prestador.
    for m in re.finditer(
        # [IL1]DENTIFICACION: el OCR suele confundir la I mayúscula con L o 1.
        r"(?:\bC\.? ?C\b\.?|\bT\.? ?I\b\.?|\bR\.? ?C\b\.?|\bP\.? ?T\b\.?|CEDULA|[IL1]DENTIFICACION|[IL1]DENTIFICADO\(?A?\)?"
        r"|DOCUMENTO|NUMERO DOCUMENTO)[^\d\n]{0,25}(\d[\d. ]{4,13}\d)", t
    ):
        previo = t[max(0, m.start() - 60):m.start()]
        if re.search(r"PROFESIONAL|REMISOR|MEDICO|REGISTRO|FIRMADO|NIT", previo.splitlines()[-1] if previo else ""):
            continue
        digitos = re.sub(r"\D", "", m[1])
        if 6 <= len(digitos) <= 11:
            r.campos.append(Campo("DOCUMENTO", digitos, "ALTA"))
            break

    for m in re.finditer(
        r"(?:NOMBRE DEL PACIENTE|NOMBRE PACIENTE|PACIENTE|NOMBRES? Y APELLIDOS|NOMBRE COMPLETO|NOMBRES?)"
        r"\s*[:\-]\s*([A-ZÑ ]{5,60})", t
    ):
        nombre = re.sub(
            r"\s+(?:C ?C|T ?I|DOCUMENTO|[IL1]DENTIFICA\w*|EDAD|EPS|FECHA|SEXO|TIPO|TELEFONO|NIT)\b.*$", "", m[1]
        ).strip()
        if len(nombre.split()) >= 2 and not re.search(
            r"PROMOVER|SALUD|AMBULATORIO|AFILIADO|PLAN |IPS|CLINICA|EPS|TERAPIAS", nombre
        ):
            r.campos.append(Campo("NOMBRE", nombre, "MEDIA"))
            break

    if re.search(r"SALUD ?TOTAL|EPS ?0?02\b", t):
        r.campos.append(Campo("EPS", "SALUD_TOTAL", "ALTA"))
    elif re.search(r"SERVICIO OCCIDENTAL DE SALUD|\bS\.? ?O\.? ?S\b|SOS[- ]PGP|EPS ?0?18\b", t):
        r.campos.append(Campo("EPS", "SOS", "ALTA"))

    # Servicio: la línea del procedimiento (con o sin código CUPS delante). Se saltan el título
    # del formato y el nombre del prestador («PROMOVER SAS MD TERAPIAS CALI»).
    for m in re.finditer(
        r"(?:\b\d{6}\b[^\n\w]{0,3})?((?:CONSULTAS PARAMEDICAS ?- ?)?(?:CONSULTA|TERAPIA|VALORACION|INGRESO)"
        r"[^\n]{6,100})", t
    ):
        servicio = m[1].strip(" .-")
        if not re.search(r"POR UTILI|ORDEN DE|\bNIT\b|CODIGO|PROMOVER|TERAPIAS CALI|CONSULTA EXTERNA", servicio):
            r.campos.append(Campo("SERVICIO", servicio, "MEDIA"))
            break

    # Diagnóstico: solo el código CIE-10, no la descripción. «R25.2» -> R252.
    if m := re.search(
        r"(?:DIAGNOSTICOS?|\bDX\b(?: PPAL)?|CIE-? ?10)[^\n]{0,40}?\b([A-TV-Z]\d{2})(?:\.?([0-9X]))?\b", t
    ):
        r.campos.append(Campo("DIAGNOSTICO", m[1] + (m[2] or ""), "MEDIA"))

    if hallada := _fecha(
        r"FECHA(?: DE)? (?:EMISION|EXPEDICION|ORDEN|SOLICITUD|AUTORIZACION|ATENCION|APERTURA)"
        r"|EXPEDID[AO]|FECHA EXPE\w*|F\. ?EXPEDICION|FECHA Y HORA(?: DE SOLICITUD)?|CREACION|NUMERO AUTORIZACION[^\n]*FECHA",
        t,
    ):
        f, crudo = hallada
        r.campos.append(Campo("FECHA_EMISION", f.isoformat() if f else crudo, "ALTA" if f else "BAJA"))

    if hallada := _fecha(
        r"FECHA (?:DE )?VENCIMIENTO|VENCIMIENTO|VENCE|VALID[AO] (?:DESDE [^\n]{0,30}?)?HASTA"
        r"|VIGEN\w+ HASTA|VIGENCIA|DESDE [^\n]{0,15}HASTA",
        t,
    ):
        f, crudo = hallada
        r.fecha_vencimiento = f
        r.fecha_vencimiento_texto = crudo
        r.campos.append(Campo("FECHA_VENCIMIENTO", f.isoformat() if f else crudo, "ALTA" if f else "BAJA"))

    if m := re.search(
        r"(?:NUMERO (?:DE )?(?:ORDEN|AUTORIZACION)|ORDEN MEDICA|CONSECUTIVO|DP ANTERIOR"
        r"|(?:AUTORIZACION|ORDEN|OPS)\s*(?:N[O°º.]{0,2}|NUMERO|#))\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{3,19})\b",
        t,
    ):
        if re.search(r"\d", m[1]):
            r.campos.append(Campo("NUMERO_ORDEN", m[1], "MEDIA"))

    # Salud Total (RB-062): si el campo tiene valor, la autorización podría estar utilizada.
    # Se exige el «:» para no confundir el campo con el título del formato. No se depende del
    # «N.º» inicial porque el OCR lo lee de muchas formas.
    if m := re.search(r"ORDEN DE DIRECCIONAMIENTO[ \t]*:[ \t]*([A-Z0-9\-]{3,20})?", t):
        valor = m[1] or ""
        r.direccionamiento_con_valor = bool(re.search(r"\d", valor))

    if m := re.search(r"PAG(?:INA|\.)?\s*(\d{1,3})\s*(?:DE|/)\s*(\d{1,3})", t):
        actual, total = int(m[1]), int(m[2])
        if 1 <= actual <= total:
            r.pagina_actual, r.pagina_total = actual, total

    r.emitida_por_promover = (
        "PROMOVER" in t
        and not re.search(_OTRO_EMISOR, t)
        and not re.search(_PROMOVER_COMO_DESTINO, t)
    )
    if r.tipo_documento == "HISTORIA":
        r.especialidad_en_historia = _especialidad_indicada(t)

    return r
