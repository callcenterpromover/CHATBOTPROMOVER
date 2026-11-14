"""Extracción de campos a partir del texto OCR.

Reglas (documento 06): nunca inventar un campo; si algo no se lee con claridad se
devuelve con confianza BAJA o no se devuelve. El texto completo no sale de este módulo:
solo los campos mínimos.
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

# Una fecha "candidata": puede traer caracteres dudosos (?, letras por dígitos) que no se corrigen.
_FECHA = (
    r"(\d{4}-\d{1,2}-\d{1,2}"
    r"|[\dOo?lI]{1,2}\s?[/\-.]\s?[\dOo?lI]{1,2}\s?[/\-.]\s?\d{2,4}"
    r"|\d{1,2}\s+DE\s+[A-Z]+\s+(?:DE\s+|DEL\s+)?\d{4})"
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
    t = crudo.strip().upper()
    try:
        if m := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", t):
            return date(int(m[1]), int(m[2]), int(m[3]))
        if m := re.fullmatch(r"(\d{1,2})\s?[/\-.]\s?(\d{1,2})\s?[/\-.]\s?(\d{4})", t):
            return date(int(m[3]), int(m[2]), int(m[1]))  # formato colombiano: día/mes/año
        if m := re.fullmatch(r"(\d{1,2})\s+DE\s+([A-Z]+)\s+(?:DE\s+|DEL\s+)?(\d{4})", t):
            mes = MESES.get(m[2])
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


def tipo_documento(texto_norm: str) -> str:
    t = texto_norm
    if re.search(r"ORDEN DE DIRECCIONAMIENTO|CONSULTAS PARAMEDICAS|AUTORIZACION DE SERVICIOS", t):
        return "AUTORIZACION"
    if re.search(r"PLAN DE TRATAMIENTO|PROGRAMA DE TRATAMIENTO|PLAN TERAPEUTICO", t):
        return "PLAN"
    if re.search(r"HISTORIA CLINICA|ANAMNESIS|ENFERMEDAD ACTUAL|EVOLUCION MEDICA|MOTIVO DE CONSULTA", t):
        return "HISTORIA"
    if re.search(r"ORDEN (?:DE SERVICIO|MEDICA)|ORDENES MEDICAS|SOLICITUD DE SERVICIOS|REMISION|SE SOLICITA", t):
        return "ORDEN"
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


def _especialidad_indicada(t: str) -> str | None:
    """Especialidad que la historia indica de forma explícita (remisión/valoración). Si hay
    más de una distinta, no se elige ninguna."""
    halladas = {
        categoria
        for categoria, patron in _ESPECIALIDADES_HISTORIA
        if re.search(rf"{_VERBO_REMISION}[^\n]{{0,40}}?(?:{patron})", t)
    }
    return halladas.pop() if len(halladas) == 1 else None


def extraer(texto: str) -> Extraccion:
    t = normalizar(texto)
    r = Extraccion(tipo_documento=tipo_documento(t))

    # Documento de identidad: solo si viene rotulado.
    if m := re.search(
        # [IL1]DENTIFICACION: el OCR suele confundir la I mayúscula con L o 1.
        r"(?:\bC\.? ?C\b\.?|\bT\.? ?I\b\.?|CEDULA|[IL1]DENTIFICACION|DOCUMENTO)[^\d\n]{0,25}(\d[\d. ]{4,13}\d)", t
    ):
        digitos = re.sub(r"\D", "", m[1])
        if 6 <= len(digitos) <= 11:
            r.campos.append(Campo("DOCUMENTO", digitos, "ALTA"))

    if m := re.search(
        r"(?:PACIENTE|NOMBRES? Y APELLIDOS|NOMBRE DEL PACIENTE|NOMBRE COMPLETO|NOMBRES?)\s*[:\-]\s*([A-ZÑ ]{5,60})", t
    ):
        nombre = re.sub(r"\s+(?:C ?C|T ?I|DOCUMENTO|[IL]DENTIFICACION|EDAD|EPS)\b.*$", "", m[1]).strip()
        if len(nombre.split()) >= 2:
            r.campos.append(Campo("NOMBRE", nombre, "MEDIA"))

    if re.search(r"SALUD TOTAL", t):
        r.campos.append(Campo("EPS", "SALUD_TOTAL", "ALTA"))
    elif re.search(r"SERVICIO OCCIDENTAL DE SALUD|\bS\.? ?O\.? ?S\b", t):
        r.campos.append(Campo("EPS", "SOS", "ALTA"))

    if m := re.search(
        r"(?:SERVICIO SOLICITADO|SERVICIO|PROCEDIMIENTO|SE SOLICITA|REMITIDO A|ESPECIALIDAD)\s*[:\-]\s*([^\n]{4,80})", t
    ):
        r.campos.append(Campo("SERVICIO", m[1].strip(" .-"), "MEDIA"))

    # Diagnóstico: solo el código CIE-10, no la descripción.
    if m := re.search(r"(?:DIAGNOSTICOS?|\bDX\b|CIE-? ?10)[^\n]{0,40}?\b([A-TV-Z]\d{2}[0-9X]?)\b", t):
        r.campos.append(Campo("DIAGNOSTICO", m[1], "MEDIA"))

    if m := re.search(rf"(?:FECHA(?: DE)? (?:EMISION|EXPEDICION|ORDEN|SOLICITUD|AUTORIZACION|ATENCION)|EXPEDID[AO])[^\d\n]{{0,20}}{_FECHA}", t):
        f = interpretar_fecha(m[1])
        r.campos.append(Campo("FECHA_EMISION", f.isoformat() if f else m[1], "ALTA" if f else "BAJA"))

    if m := re.search(rf"(?:FECHA DE VENCIMIENTO|VENCIMIENTO|VENCE|VALID[AO] HASTA|VIGEN\w+ HASTA|VIGENCIA)[^\d\n?]{{0,20}}{_FECHA}", t):
        f = interpretar_fecha(m[1])
        r.fecha_vencimiento = f
        r.fecha_vencimiento_texto = m[1]
        r.campos.append(Campo("FECHA_VENCIMIENTO", f.isoformat() if f else m[1], "ALTA" if f else "BAJA"))

    if m := re.search(r"(?:AUTORIZACION|ORDEN|OPS)\s*(?:N[O°º.]{0,2}|NUMERO|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{3,19})\b", t):
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

    r.emitida_por_promover = "PROMOVER" in t
    if r.tipo_documento == "HISTORIA":
        r.especialidad_en_historia = _especialidad_indicada(t)

    return r
