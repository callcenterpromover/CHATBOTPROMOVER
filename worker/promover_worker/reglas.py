"""Reglas deterministas de negocio (documentos 02, 06 y 07).

El sistema clasifica y alerta, pero no decide: todo caso dudoso queda con una alerta
que dice qué se detectó, por qué importa y qué debe revisar la persona (RB-065).
"""

from __future__ import annotations

import re
from datetime import date

from .extraccion import Extraccion, normalizar

NOMBRES_CATEGORIA = {
    "FISIOTERAPIA": "Fisioterapia",
    "FONOAUDIOLOGIA": "Fonoaudiología",
    "TERAPIA_OCUPACIONAL": "Terapia ocupacional",
    "TERAPIA_RESPIRATORIA": "Terapia respiratoria",
    "FISIATRIA": "Fisiatría",
    "ORTOPEDIA": "Ortopedia",
    "EQUIPO_INTERDISCIPLINARIO": "Equipo interdisciplinario",
    "INFILTRACIONES": "Infiltraciones",
}
ESPECIALISTAS = {"FISIATRIA", "ORTOPEDIA"}

# Textos que no definen una ruta por sí solos (RB-010, RB-021).
# PROMOVER (2026-11): con «consulta de ingreso modelo fisioterapia y rehabilitación», equipo
# interdisciplinario, UPI osteomuscular o fisiatría hay que revisar la historia clínica (sección
# de análisis y manejo) para saber cómo sigue el proceso del paciente.
_GENERICAS = (
    r"PRIMERA VEZ POR EQUIPO INTERDISCIPLINARIO"
    r"|PRIMERA VEZ POR FISIOTERAPIA Y REHABILITACION"
    r"|FISIOTERAPIA Y REHABILITACION"
    r"|FISIATRIA Y REHABILITACION"
    r"|UPI OSTEOMUSCULAR|FISIATRIA|MEDICINA FISICA"
)
# «Fisioterapia (respiratoria)», «consulta por fisioterapia (ocupacional)»: manda el paréntesis.
_PARENTESIS = [
    (r"\(\s*RESPIRATORIA", "TERAPIA_RESPIRATORIA", "terapia respiratoria"),
    (r"\(\s*OCUPACIONAL", "TERAPIA_OCUPACIONAL", "terapia ocupacional"),
    (r"\(\s*(?:FONO|LENGUAJE)", "FONOAUDIOLOGIA", "fonoaudiología"),
    (r"\(\s*(?:TERAPIA )?FISICA", "FISIOTERAPIA", "terapia física"),
]
_FUERA_DE_ALCANCE = r"URGENCIA|RADIOGRAFIA|RAYOS X|LABORATORIO|RESONANCIA|ECOGRAFIA|TOMOGRAFIA|EXAMEN"


def clasificar_servicio(servicio: str | None) -> tuple[str, str, str, bool]:
    """Devuelve (categoría, motivo, confianza, es_genérica) a partir del texto del servicio."""
    if not servicio or not servicio.strip():
        return "SIN_CLASIFICAR", "No hay texto de servicio para clasificar.", "BAJA", False
    t = normalizar(servicio)
    generica = bool(re.search(_GENERICAS, t))

    if re.search(_FUERA_DE_ALCANCE, t):
        return "FUERA_DE_ALCANCE", "El servicio parece urgencias o examen diagnóstico (RB-060).", "MEDIA", False
    if re.search(r"UPI OSTEOMUSCULAR", t):
        return "ORTOPEDIA", "UPI osteomuscular se interpreta como Ortopedia (RB-012); revisar la historia.", "MEDIA", True
    if re.search(r"ORTOPEDIA", t):
        return "ORTOPEDIA", "El servicio menciona Ortopedia (RB-013).", "ALTA", False
    if re.search(r"INFILTRACION", t):
        return "INFILTRACIONES", "El servicio menciona infiltración.", "ALTA", False
    if re.search(r"TERAPIA OCUPACIONAL", t):
        return "TERAPIA_OCUPACIONAL", "El servicio menciona Terapia ocupacional (RB-017).", "ALTA", False
    for patron, cat, nombre in _PARENTESIS:
        if re.search(rf"FISIOTERAPIA[^(\n]{{0,40}}{patron}", t):
            return cat, f"«Fisioterapia ({nombre})»: manda lo indicado entre paréntesis.", "ALTA", False
    if re.search(r"FONOAUDIOLOG|TERAPIA DEL? LENGUAJE", t):
        return "FONOAUDIOLOGIA", "El servicio menciona Fonoaudiología (RB-018).", "ALTA", False
    if re.search(r"MAXILOFACIAL", t):
        return "FONOAUDIOLOGIA", "Maxilofacial se orienta a Fonoaudiología (RB-020, regla preliminar).", "MEDIA", False
    if re.search(r"TERAPIA RESPIRATORIA", t):
        return "TERAPIA_RESPIRATORIA", "El servicio menciona Terapia respiratoria.", "ALTA", False
    if re.search(r"EQUIPO INTERDISCIPLINARIO", t):
        return "EQUIPO_INTERDISCIPLINARIO", "Orden genérica por equipo interdisciplinario (RB-010).", "BAJA", True
    if re.search(r"FISIATRIA|MEDICINA FISICA", t):
        if generica:
            return "FISIATRIA", "Texto genérico «Fisiatría y rehabilitación»; verificar con la historia (RB-021).", "BAJA", True
        return "FISIATRIA", "El servicio menciona Fisiatría (RB-014); revisar la historia.", "MEDIA", True
    if re.search(r"TERAPIAS? FISICAS?", t):
        return "FISIOTERAPIA", "El servicio menciona terapia física (RB-019).", "ALTA", False
    if re.search(r"FISIOTERAPIA", t):
        return "FISIOTERAPIA", "«Fisioterapia» suele indicar terapia física; verificar (RB-021).", "BAJA" if generica else "MEDIA", generica
    return "SIN_CLASIFICAR", "El texto del servicio no coincide con ninguna categoría conocida.", "BAJA", False


def _alerta(codigo: str, detalle: str) -> dict:
    return {"codigo": codigo, "detalle": detalle}


def _solo_digitos(v: str | None) -> str:
    return re.sub(r"\D", "", v or "")


def comparar_nombre(declarado: str | None, leido: str | None) -> str:
    """COINCIDE si comparten al menos dos palabras; DISCREPANCIA si no comparten ninguna."""
    if not declarado or not leido:
        return "SIN_COMPARAR"
    a = {p for p in normalizar(re.sub(r"\(.*?\)", "", declarado)).split() if len(p) > 2}
    b = {p for p in normalizar(leido).split() if len(p) > 2}
    comunes = len(a & b)
    if comunes >= 2 or (comunes >= 1 and min(len(a), len(b)) == 1):
        return "COINCIDE"
    return "DISCREPANCIA" if comunes == 0 else "SIN_COMPARAR"


def calcular_estado(s: dict, hay_alertas_abiertas: bool) -> str:
    """Estado general de la solicitud según lo que falta (RB §7)."""
    if "ILEGIBLE" in (s.get("orden_estado"), s.get("historia_estado")):
        return "DOCUMENTOS_POR_REENVIAR"
    if not s.get("nombre") or not s.get("documento"):
        return "ESPERANDO_DATOS"
    if s.get("orden_estado") == "NO_RECIBIDA":
        return "ESPERANDO_ORDEN"
    if s.get("historia_estado") == "NO_RECIBIDA":
        return "ESPERANDO_HISTORIA"
    if s.get("plan_estado") == "REQUERIDO_PENDIENTE":
        return "ESPERANDO_PLAN"
    if (
        hay_alertas_abiertas
        or s.get("historia_estado") == "POSIBLEMENTE_INCOMPLETA"
        or s.get("autorizacion_estado") in ("PENDIENTE_VERIFICACION_HUMANA", "POSIBLEMENTE_UTILIZADA")
        or s.get("eps") not in ("SALUD_TOTAL", "SOS")
        or s.get("categoria_probable") in ("SIN_CLASIFICAR", "FUERA_DE_ALCANCE")
    ):
        return "PENDIENTE_VERIFICACION_HUMANA"
    return "LISTA_PARA_REVISION"


def evaluar(
    solicitud: dict,
    ex: Extraccion,
    legibilidad: str,
    *,
    hoy: date,
    tipo_declarado: str = "DESCONOCIDO",
    paginas_historia_previas: int = 0,
    alertas_abiertas_previas: int = 0,
) -> dict:
    """Convierte la extracción de UN documento en el resultado a guardar.

    Devuelve el dict que recibe `guardar_resultado_ocr`: estado del trabajo, campos,
    alertas y cambios de la solicitud. No modifica nada.
    """
    tipo = ex.tipo_documento if ex.tipo_documento != "DESCONOCIDO" else tipo_declarado
    alertas: list[dict] = []
    cambios: dict = {}
    campos: list[dict] = []
    revisada = solicitud.get("revision_humana") == "COMPLETADA"

    resultado = {
        "estado": "COMPLETADO",
        "tipo_documento": tipo,
        "legibilidad": legibilidad,
        "pagina_actual": ex.pagina_actual,
        "pagina_total": ex.pagina_total,
        "error_codigo": None,
    }

    # --- Documento ilegible: pedir reenvío, no extraer nada -----------------------------
    if legibilidad == "ILEGIBLE":
        resultado["estado"] = "REENVIO_REQUERIDO"
        if tipo == "HISTORIA" and solicitud.get("historia_estado") != "COMPLETITUD_CONFIRMADA_HUMANAMENTE":
            cambios["historia_estado"] = "ILEGIBLE"
        elif tipo == "ORDEN" and solicitud.get("orden_estado") != "CONFIRMADA_HUMANAMENTE":
            cambios["orden_estado"] = "ILEGIBLE"
        elif tipo == "DESCONOCIDO" and solicitud.get("orden_estado") == "NO_RECIBIDA":
            # No se sabe qué documento era: solo se marca la orden si todavía no hay ninguna.
            cambios["orden_estado"] = "ILEGIBLE"
        alertas.append(_alerta(
            "DOCUMENTO_ILEGIBLE",
            "Un documento recibido no se pudo leer (borroso, oscuro o cortado). Se debe pedir al paciente "
            "una nueva foto con buena luz y todos los bordes visibles.",
        ))
        if not revisada:
            cambios["estado"] = calcular_estado({**solicitud, **cambios}, True)
        return {**resultado, "campos": [], "alertas": alertas, "solicitud": cambios}

    dudoso = legibilidad == "POSIBLEMENTE_ILEGIBLE"

    # --- Campos y verificación cruzada con lo que escribió el paciente ------------------
    for c in ex.campos:
        confianza = "BAJA" if dudoso and c.confianza != "BAJA" else c.confianza
        verificacion = "SIN_COMPARAR"
        if c.campo == "DOCUMENTO" and solicitud.get("documento"):
            verificacion = "COINCIDE" if _solo_digitos(solicitud["documento"]) == c.valor else "DISCREPANCIA"
            if verificacion == "DISCREPANCIA":
                alertas.append(_alerta(
                    "DISCREPANCIA_DOCUMENTO",
                    "El número de documento leído en el documento no coincide con el que escribió el paciente. "
                    "Revisar el original en WhatsApp y corregir el dato; el sistema no eligió ninguno.",
                ))
        elif c.campo == "NOMBRE":
            verificacion = comparar_nombre(solicitud.get("nombre"), c.valor)
            if verificacion == "DISCREPANCIA":
                alertas.append(_alerta(
                    "DISCREPANCIA_NOMBRE",
                    "El nombre leído en el documento no coincide con el que escribió el paciente. "
                    "Confirmar que el documento corresponde a esta persona.",
                ))
        elif c.campo == "EPS" and solicitud.get("eps") in ("SALUD_TOTAL", "SOS"):
            verificacion = "COINCIDE" if solicitud["eps"] == c.valor else "DISCREPANCIA"
            if verificacion == "DISCREPANCIA":
                alertas.append(_alerta(
                    "DISCREPANCIA_EPS",
                    "La EPS que aparece en el documento es distinta de la que declaró el paciente. "
                    "Verificar cuál aplica antes de continuar; las reglas cambian según la EPS.",
                ))
        campos.append({
            "campo": c.campo, "origen": tipo if tipo != "DESCONOCIDO" else "ORDEN",
            "valor_ocr": c.valor, "confianza": confianza, "verificacion": verificacion,
        })

    # --- Estado de cada documento ----------------------------------------------------
    if tipo == "DESCONOCIDO":
        alertas.append(_alerta(
            "TIPO_DOCUMENTO_NO_IDENTIFICADO",
            "No se pudo determinar si el documento es una orden, una historia clínica, un plan o una "
            "autorización. Revisarlo en WhatsApp y actualizar los estados de documentos.",
        ))
    elif tipo == "ORDEN":
        if solicitud.get("orden_estado") != "CONFIRMADA_HUMANAMENTE":
            cambios["orden_estado"] = "RECIBIDA_PENDIENTE_REVISION" if dudoso else "LEGIBLE"
    elif tipo == "HISTORIA":
        if solicitud.get("historia_estado") != "COMPLETITUD_CONFIRMADA_HUMANAMENTE":
            recibidas = paginas_historia_previas + 1
            if ex.pagina_total and recibidas < ex.pagina_total:
                cambios["historia_estado"] = "POSIBLEMENTE_INCOMPLETA"
                alertas.append(_alerta(
                    "HISTORIA_POSIBLEMENTE_INCOMPLETA",
                    f"La historia clínica indica «Página {ex.pagina_actual} de {ex.pagina_total}» y se han "
                    f"recibido {recibidas} página(s). Confirmar con el paciente si faltan páginas.",
                ))
            else:
                cambios["historia_estado"] = "RECIBIDA_PENDIENTE_REVISION"
    elif tipo == "PLAN":
        cambios["plan_estado"] = "RECIBIDO"
    # El direccionamiento de Salud Total se maneja como orden (decisión de PROMOVER, calibración
    # 2026-11), pero trae el campo «N.º ORDEN DE DIRECCIONAMIENTO» que dice si ya se usó (RB-062).
    if tipo == "AUTORIZACION" or ex.direccionamiento_con_valor is not None:
        if ex.direccionamiento_con_valor:
            cambios["autorizacion_estado"] = "POSIBLEMENTE_UTILIZADA"
            alertas.append(_alerta(
                "AUTORIZACION_POSIBLEMENTE_UTILIZADA",
                "El campo «N.º ORDEN DE DIRECCIONAMIENTO» tiene un valor. Según la regla informada, la "
                "autorización podría estar utilizada; verificar antes de continuar.",
            ))
        else:
            cambios["autorizacion_estado"] = "RECIBIDA"

    # --- Vencimiento (RB-043): nunca declarar vencida o vigente solo por OCR ---------------
    previa = solicitud.get("orden_vencimiento")
    ya_hay_fecha_anterior = bool(
        previa and solicitud.get("orden_vencimiento_confianza") == "ALTA"
        and ex.fecha_vencimiento and date.fromisoformat(previa) <= ex.fecha_vencimiento
    )
    if tipo in ("ORDEN", "AUTORIZACION") and ex.fecha_vencimiento_texto and ya_hay_fecha_anterior:
        pass  # con varios documentos se conserva la fecha que vence primero
    elif tipo in ("ORDEN", "AUTORIZACION") and ex.fecha_vencimiento_texto:
        cambios["orden_vencimiento_texto"] = ex.fecha_vencimiento_texto
        if ex.fecha_vencimiento and not dudoso:
            cambios["orden_vencimiento"] = ex.fecha_vencimiento.isoformat()
            cambios["orden_vencimiento_confianza"] = "ALTA"
            dias = (ex.fecha_vencimiento - hoy).days
            if dias < 0:
                alertas.append(_alerta(
                    "ORDEN_POSIBLEMENTE_VENCIDA",
                    "La fecha de vencimiento leída ya pasó. No se declara vencida solo por OCR: "
                    "verificar la fecha en el documento original.",
                ))
            elif dias <= 3:
                alertas.append(_alerta(
                    "ORDEN_PROXIMA_A_VENCER",
                    f"Según la fecha leída, el documento vence en {dias} día(s). Priorizar la revisión.",
                ))
        else:
            cambios["orden_vencimiento_confianza"] = "BAJA"
            if ex.fecha_vencimiento:
                cambios["orden_vencimiento"] = ex.fecha_vencimiento.isoformat()
            alertas.append(_alerta(
                "FECHA_VENCIMIENTO_NO_CONFIRMADA",
                f"La fecha de vencimiento se leyó con baja confianza («{ex.fecha_vencimiento_texto}»). "
                "No se declara vencida ni vigente; verificar en el documento original.",
            ))

    # --- Clasificación (RB-010 a RB-021) ----------------------------------------------
    if not revisada:
        servicio = ex.valor("SERVICIO") if tipo == "ORDEN" else None
        actual = solicitud.get("categoria_probable") or "SIN_CLASIFICAR"
        if tipo == "ORDEN" and (servicio or solicitud.get("servicio_texto")):
            cat, motivo, conf, generica = clasificar_servicio(servicio or solicitud.get("servicio_texto"))
            if ex.emitida_por_promover and cat not in ("SIN_CLASIFICAR", "FUERA_DE_ALCANCE"):
                motivo, conf = f"Orden emitida por PROMOVER: se respeta el servicio indicado (RB-011). {motivo}", "ALTA"
            cambios.update(categoria_probable=cat, clasificacion_motivo=motivo, clasificacion_confianza=conf)
            if cat == "FUERA_DE_ALCANCE":
                alertas.append(_alerta(
                    "SERVICIO_FUERA_DE_ALCANCE",
                    "El servicio de la orden parece urgencias o un examen diagnóstico, que este canal no "
                    "gestiona. Responder al paciente según el mensaje aprobado.",
                ))
            elif conf == "BAJA" or generica:
                alertas.append(_alerta(
                    "CLASIFICACION_INCIERTA",
                    "El texto de la orden es genérico o no define la especialidad con claridad. "
                    "Revisar la historia clínica y confirmar la especialidad.",
                ))
        elif tipo == "HISTORIA" and ex.especialidad_en_historia:
            indicada = ex.especialidad_en_historia
            conf_actual = solicitud.get("clasificacion_confianza")
            if actual == "SIN_CLASIFICAR" or conf_actual == "BAJA":
                cambios.update(
                    categoria_probable=indicada,
                    clasificacion_motivo=f"Orden genérica o sin clasificar; la historia indica {NOMBRES_CATEGORIA[indicada]} (RB-010).",
                    clasificacion_confianza="MEDIA",
                )
            elif actual != indicada:
                alertas.append(_alerta(
                    "CLASIFICACION_CONTRADICTORIA",
                    f"La orden se clasificó como {NOMBRES_CATEGORIA.get(actual, actual)}, pero la historia indica "
                    f"{NOMBRES_CATEGORIA[indicada]}. No se reclasificó automáticamente; definir la ruta correcta.",
                ))

    # --- Menor de 16 con especialista ---------------------------------------------------
    categoria = cambios.get("categoria_probable", solicitud.get("categoria_probable"))
    edad = solicitud.get("edad")
    if edad is not None and edad < 16 and categoria in ESPECIALISTAS:
        alertas.append(_alerta(
            "MENOR_16_ESPECIALISTA",
            f"El paciente declara {edad} años y la solicitud apunta a un especialista. El lineamiento indica "
            "que los menores de 16 no se atienden con especialistas, incluso con OPS. Revisar antes de contactar.",
        ))

    if not revisada:
        cambios["estado"] = calcular_estado({**solicitud, **cambios}, bool(alertas) or alertas_abiertas_previas > 0)

    return {**resultado, "campos": campos, "alertas": alertas, "solicitud": cambios}
