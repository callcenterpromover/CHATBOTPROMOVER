"""Pruebas de extracción y reglas con textos ficticios (casos del documento 08)."""

from datetime import date

import pytest

from promover_worker.extraccion import extraer, interpretar_fecha
from promover_worker.reglas import calcular_estado, clasificar_servicio, comparar_nombre, evaluar

HOY = date(2026, 11, 14)

ORDEN = """
IPS EJEMPLO S.A.S.
ORDEN DE SERVICIO
Paciente: MARIA EJEMPLO UNO
C.C. 1.000.000.001   Edad: 41
EPS: SALUD TOTAL
Fecha de expedición: 02/11/2026
Servicio: Terapia física integral
Diagnóstico: M545 LUMBAGO NO ESPECIFICADO
Válida hasta: 19/11/2026
Orden No. 778899
"""

HISTORIA_P2 = """
HISTORIA CLINICA
Nombre: JORGE EJEMPLO CUATRO   Identificación: 1000000004
Enfermedad actual: paciente refiere dolor.
Plan: se remite a Fisiatría para valoración.
Página 2 de 4
"""

SOLICITUD = {
    "nombre": "María Ejemplo Uno (ficticio)", "documento": "1000000001", "eps": "SALUD_TOTAL",
    "servicio_texto": "Terapia física integral", "categoria_probable": "SIN_CLASIFICAR",
    "clasificacion_confianza": None, "estado": "ESPERANDO_ORDEN", "orden_estado": "NO_RECIBIDA",
    "historia_estado": "NO_RECIBIDA", "plan_estado": "NO_REQUERIDO",
    "autorizacion_estado": "NO_DETERMINADA", "revision_humana": "PENDIENTE", "edad": 41,
}


def codigos(resultado):
    return {a["codigo"] for a in resultado["alertas"]}


# ---------------------------------------------------------------- extracción

def test_extrae_campos_de_una_orden_clara():
    ex = extraer(ORDEN)
    assert ex.tipo_documento == "ORDEN"
    assert ex.valor("DOCUMENTO") == "1000000001"
    assert ex.valor("NOMBRE") == "MARIA EJEMPLO UNO"
    assert ex.valor("EPS") == "SALUD_TOTAL"
    assert ex.valor("SERVICIO") == "TERAPIA FISICA INTEGRAL"
    assert ex.valor("DIAGNOSTICO") == "M545"
    assert ex.valor("FECHA_EMISION") == "2026-11-02"
    assert ex.fecha_vencimiento == date(2026, 11, 19)
    assert ex.valor("NUMERO_ORDEN") == "778899"


def test_no_inventa_campos_que_no_estan():
    ex = extraer("Texto cualquiera sin rótulos 123456789 ni fechas claras")
    assert ex.campos == []
    assert ex.tipo_documento == "DESCONOCIDO"
    assert ex.fecha_vencimiento is None


def test_historia_detecta_paginacion_y_especialidad():
    ex = extraer(HISTORIA_P2)
    assert ex.tipo_documento == "HISTORIA"
    assert (ex.pagina_actual, ex.pagina_total) == (2, 4)
    assert ex.especialidad_en_historia == "FISIATRIA"


def test_historia_con_dos_especialidades_no_elige():
    ex = extraer("HISTORIA CLINICA\nSe remite a Ortopedia.\nValoración por Fisiatría.")
    assert ex.especialidad_en_historia is None


@pytest.mark.parametrize("crudo,esperado", [
    ("19/11/2026", date(2026, 11, 19)),
    ("2026-11-19", date(2026, 11, 19)),
    ("19 de noviembre de 2026", date(2026, 11, 19)),
    ("0?/11/2026", None),
    ("31/02/2026", None),
    ("1O/11/2026", None),  # letra O en vez de cero: no se corrige
])
def test_fechas_no_se_adivinan(crudo, esperado):
    assert interpretar_fecha(crudo) == esperado


def test_fecha_de_vencimiento_dudosa_queda_con_baja_confianza():
    ex = extraer("ORDEN DE SERVICIO\nVálida hasta: 0?/11/2026")
    assert ex.fecha_vencimiento is None
    assert ex.fecha_vencimiento_texto == "0?/11/2026"
    assert [c.confianza for c in ex.campos if c.campo == "FECHA_VENCIMIENTO"] == ["BAJA"]


def test_autorizacion_salud_total_con_y_sin_direccionamiento():
    con = extraer("CONSULTAS PARAMEDICAS - ORDEN DE DIRECCIONAMIENTO\nN.º ORDEN DE DIRECCIONAMIENTO: 445566")
    sin = extraer("CONSULTAS PARAMEDICAS - ORDEN DE DIRECCIONAMIENTO\nN.º ORDEN DE DIRECCIONAMIENTO:\nPaciente: X Y")
    # El direccionamiento de Salud Total se maneja como orden (PROMOVER, 2026-11).
    assert con.tipo_documento == "ORDEN" and con.direccionamiento_con_valor is True
    assert sin.direccionamiento_con_valor is False


def test_autorizacion_sos_se_reconoce():
    ex = extraer("SERVICIO OCCIDENTAL DE SALUD\nP-AUTORIZACION DE SERVICIOS DE SALUD\nAutorización No. OPS-000123")
    assert ex.tipo_documento == "AUTORIZACION"
    assert ex.valor("EPS") == "SOS"
    assert ex.valor("NUMERO_ORDEN") == "OPS-000123"


# ---------------------------------------------------------------- clasificación

@pytest.mark.parametrize("texto,categoria", [
    ("UPI osteomuscular", "ORTOPEDIA"),
    ("Terapias físicas", "FISIOTERAPIA"),
    ("Terapia ocupacional", "TERAPIA_OCUPACIONAL"),
    ("Terapia de lenguaje", "FONOAUDIOLOGIA"),
    ("Maxilofacial", "FONOAUDIOLOGIA"),
    ("Terapia respiratoria", "TERAPIA_RESPIRATORIA"),
    ("Infiltración de rodilla", "INFILTRACIONES"),
    ("Radiografía de tórax", "FUERA_DE_ALCANCE"),
    ("Algo desconocido", "SIN_CLASIFICAR"),
])
def test_clasificacion_por_texto(texto, categoria):
    assert clasificar_servicio(texto)[0] == categoria


def test_orden_generica_queda_con_baja_confianza():
    cat, _, conf, generica = clasificar_servicio("Consulta de primera vez por fisiatría y rehabilitación")
    assert (cat, conf, generica) == ("FISIATRIA", "BAJA", True)


# ---------------------------------------------------------------- evaluación

def test_orden_completa_y_legible():
    r = evaluar(SOLICITUD, extraer(ORDEN), "LEGIBLE", hoy=HOY)
    assert r["estado"] == "COMPLETADO"
    assert r["solicitud"]["orden_estado"] == "LEGIBLE"
    assert r["solicitud"]["categoria_probable"] == "FISIOTERAPIA"
    assert r["solicitud"]["orden_vencimiento"] == "2026-11-19"
    assert r["solicitud"]["estado"] == "ESPERANDO_HISTORIA"  # falta la historia (RB-002)
    assert codigos(r) == set()
    verificaciones = {c["campo"]: c["verificacion"] for c in r["campos"]}
    assert verificaciones["DOCUMENTO"] == "COINCIDE"
    assert verificaciones["NOMBRE"] == "COINCIDE"


def test_documento_distinto_genera_discrepancia_sin_elegir():
    s = {**SOLICITUD, "documento": "1000000999"}
    r = evaluar(s, extraer(ORDEN), "LEGIBLE", hoy=HOY)
    assert "DISCREPANCIA_DOCUMENTO" in codigos(r)
    assert "documento" not in r["solicitud"]  # el dato declarado no se sobrescribe
    assert next(c for c in r["campos"] if c["campo"] == "DOCUMENTO")["verificacion"] == "DISCREPANCIA"


def test_documento_ilegible_pide_reenvio():
    r = evaluar(SOLICITUD, extraer(""), "ILEGIBLE", hoy=HOY, tipo_declarado="ORDEN")
    assert r["estado"] == "REENVIO_REQUERIDO"
    assert r["campos"] == []
    assert r["solicitud"]["orden_estado"] == "ILEGIBLE"
    assert r["solicitud"]["estado"] == "DOCUMENTOS_POR_REENVIAR"


def test_historia_con_paginas_faltantes():
    s = {**SOLICITUD, "nombre": "Jorge Ejemplo Cuatro", "documento": "1000000004", "orden_estado": "LEGIBLE"}
    r = evaluar(s, extraer(HISTORIA_P2), "LEGIBLE", hoy=HOY, paginas_historia_previas=1)
    assert r["solicitud"]["historia_estado"] == "POSIBLEMENTE_INCOMPLETA"
    assert "HISTORIA_POSIBLEMENTE_INCOMPLETA" in codigos(r)
    assert r["solicitud"]["estado"] == "PENDIENTE_VERIFICACION_HUMANA"


def test_orden_generica_se_orienta_con_la_historia():
    s = {**SOLICITUD, "orden_estado": "LEGIBLE", "categoria_probable": "FISIATRIA", "clasificacion_confianza": "BAJA"}
    texto = "HISTORIA CLINICA\nPlan: valoración por Ortopedia.\nPágina 1 de 1"
    r = evaluar(s, extraer(texto), "LEGIBLE", hoy=HOY)
    assert r["solicitud"]["categoria_probable"] == "ORTOPEDIA"
    assert "RB-010" in r["solicitud"]["clasificacion_motivo"]


def test_contradiccion_entre_orden_e_historia_no_reclasifica():
    s = {**SOLICITUD, "orden_estado": "LEGIBLE", "categoria_probable": "FISIOTERAPIA", "clasificacion_confianza": "ALTA"}
    r = evaluar(s, extraer(HISTORIA_P2.replace("Página 2 de 4", "")), "LEGIBLE", hoy=HOY)
    assert "categoria_probable" not in r["solicitud"]
    assert "CLASIFICACION_CONTRADICTORIA" in codigos(r)


def test_orden_de_promover_se_respeta():
    texto = ORDEN.replace("IPS EJEMPLO S.A.S.", "PROMOVER S.A.S.").replace("Terapia física integral", "Fisioterapia")
    r = evaluar(SOLICITUD, extraer(texto), "LEGIBLE", hoy=HOY)
    assert r["solicitud"]["clasificacion_confianza"] == "ALTA"
    assert "RB-011" in r["solicitud"]["clasificacion_motivo"]


def test_vencimiento_proximo_y_vencido():
    proxima = evaluar(SOLICITUD, extraer(ORDEN.replace("19/11/2026", "16/11/2026")), "LEGIBLE", hoy=HOY)
    vencida = evaluar(SOLICITUD, extraer(ORDEN.replace("19/11/2026", "01/11/2026")), "LEGIBLE", hoy=HOY)
    assert "ORDEN_PROXIMA_A_VENCER" in codigos(proxima)
    assert "ORDEN_POSIBLEMENTE_VENCIDA" in codigos(vencida)


def test_fecha_dudosa_no_declara_vencimiento():
    r = evaluar(SOLICITUD, extraer(ORDEN.replace("19/11/2026", "0?/11/2026")), "LEGIBLE", hoy=HOY)
    assert "orden_vencimiento" not in r["solicitud"]
    assert r["solicitud"]["orden_vencimiento_confianza"] == "BAJA"
    assert "FECHA_VENCIMIENTO_NO_CONFIRMADA" in codigos(r)


def test_imagen_dudosa_baja_la_confianza():
    r = evaluar(SOLICITUD, extraer(ORDEN), "POSIBLEMENTE_ILEGIBLE", hoy=HOY)
    assert r["solicitud"]["orden_estado"] == "RECIBIDA_PENDIENTE_REVISION"
    assert all(c["confianza"] == "BAJA" for c in r["campos"])
    assert "FECHA_VENCIMIENTO_NO_CONFIRMADA" in codigos(r)


def test_menor_de_16_con_especialista():
    s = {**SOLICITUD, "edad": 12, "servicio_texto": "Consulta con fisiatría"}
    r = evaluar(s, extraer(ORDEN.replace("Terapia física integral", "Consulta con fisiatría")), "LEGIBLE", hoy=HOY)
    assert "MENOR_16_ESPECIALISTA" in codigos(r)


def test_autorizacion_posiblemente_utilizada():
    texto = "SALUD TOTAL\nCONSULTAS PARAMEDICAS - ORDEN DE DIRECCIONAMIENTO\nN.º ORDEN DE DIRECCIONAMIENTO: 445566"
    r = evaluar(SOLICITUD, extraer(texto), "LEGIBLE", hoy=HOY)
    assert r["solicitud"]["autorizacion_estado"] == "POSIBLEMENTE_UTILIZADA"
    assert "AUTORIZACION_POSIBLEMENTE_UTILIZADA" in codigos(r)


def test_tipo_no_identificado_alerta():
    r = evaluar(SOLICITUD, extraer("texto legible pero sin rótulos conocidos"), "LEGIBLE", hoy=HOY)
    assert "TIPO_DOCUMENTO_NO_IDENTIFICADO" in codigos(r)


def test_revision_humana_completada_no_se_pisa():
    s = {**SOLICITUD, "revision_humana": "COMPLETADA", "categoria_probable": "ORTOPEDIA", "estado": "LISTA_PARA_REVISION"}
    r = evaluar(s, extraer(ORDEN), "LEGIBLE", hoy=HOY)
    assert "categoria_probable" not in r["solicitud"]
    assert "estado" not in r["solicitud"]


def test_confirmacion_humana_de_documentos_no_se_degrada():
    s = {**SOLICITUD, "orden_estado": "CONFIRMADA_HUMANAMENTE"}
    r = evaluar(s, extraer(ORDEN), "POSIBLEMENTE_ILEGIBLE", hoy=HOY)
    assert "orden_estado" not in r["solicitud"]


def test_documento_ilegible_sin_tipo_no_dania_una_orden_ya_legible():
    s = {**SOLICITUD, "orden_estado": "LEGIBLE"}
    r = evaluar(s, extraer(""), "ILEGIBLE", hoy=HOY)
    assert r["estado"] == "REENVIO_REQUERIDO"
    assert "orden_estado" not in r["solicitud"]
    assert "DOCUMENTO_ILEGIBLE" in codigos(r)


def test_con_varios_documentos_se_conserva_la_fecha_que_vence_primero():
    s = {**SOLICITUD, "orden_vencimiento": "2026-11-16", "orden_vencimiento_confianza": "ALTA"}
    texto = "SALUD TOTAL\nCONSULTAS PARAMEDICAS - ORDEN DE DIRECCIONAMIENTO\nVigencia hasta: 09/12/2026"
    r = evaluar(s, extraer(texto), "LEGIBLE", hoy=HOY)
    assert "orden_vencimiento" not in r["solicitud"]
    mas_cercana = evaluar(s, extraer(texto.replace("09/12/2026", "15/11/2026")), "LEGIBLE", hoy=HOY)
    assert mas_cercana["solicitud"]["orden_vencimiento"] == "2026-11-15"


# ---------------------------------------------------------------- utilidades

def test_comparar_nombre():
    assert comparar_nombre("María Ejemplo Uno (ficticio)", "MARIA EJEMPLO UNO") == "COINCIDE"
    assert comparar_nombre("María Ejemplo Uno", "PEDRO PRUEBA DOS") == "DISCREPANCIA"
    assert comparar_nombre(None, "MARIA EJEMPLO") == "SIN_COMPARAR"


def test_estado_lista_para_revision_solo_si_no_falta_nada():
    completa = {**SOLICITUD, "orden_estado": "LEGIBLE", "historia_estado": "RECIBIDA_PENDIENTE_REVISION",
                "categoria_probable": "FISIOTERAPIA"}
    assert calcular_estado(completa, False) == "LISTA_PARA_REVISION"
    assert calcular_estado(completa, True) == "PENDIENTE_VERIFICACION_HUMANA"
    assert calcular_estado({**completa, "plan_estado": "REQUERIDO_PENDIENTE"}, False) == "ESPERANDO_PLAN"
    assert calcular_estado({**completa, "eps": "OTRA"}, False) == "PENDIENTE_VERIFICACION_HUMANA"


# ---------------------------------------------------------------- calibración 2026-11

@pytest.mark.parametrize("texto,categoria", [
    ("Consulta de primera vez por fisioterapia (respiratoria)", "TERAPIA_RESPIRATORIA"),
    ("Consulta por fisioterapia (ocupacional)", "TERAPIA_OCUPACIONAL"),
    ("Fisioterapia (terapia fisica) rodilla", "FISIOTERAPIA"),
    ("Terapia fonoaudiologica integral", "FONOAUDIOLOGIA"),
])
def test_fisioterapia_con_parentesis_y_variantes(texto, categoria):
    assert clasificar_servicio(texto)[0] == categoria


@pytest.mark.parametrize("texto", [
    "Consultas paramedicas - Consulta de ingreso modelo fisioterapia y rehabilitacion",
    "890215 Consulta de primera vez por equipo interdisciplinario",
    "Valoracion por UPI osteomuscular",
    "Consulta de primera vez por especialista en medicina fisica y rehabilitacion",
])
def test_servicios_que_obligan_a_revisar_la_historia(texto):
    assert clasificar_servicio(texto)[3] is True


def test_especialidad_desde_la_seccion_de_analisis():
    texto = "HISTORIA CLINICA\nEnfermedad actual: dolor lumbar\nANALISIS Y PLAN\nPaciente con buena evolucion, continuar terapia ocupacional 10 sesiones"
    assert extraer(texto).especialidad_en_historia == "TERAPIA_OCUPACIONAL"


def test_fechas_con_mes_abreviado_y_anio_imposible():
    ex = extraer("DIRECCIONAMIENTO CONSULTAS PARAMEDICAS\nFecha Vencimiento: 22 Abr 2027")
    assert ex.valor("FECHA_VENCIMIENTO") == "2027-04-22"
    dudosa = extraer("ORDEN MEDICA\nFecha de expedicion: 04/11/2076")
    assert next(c for c in dudosa.campos if c.campo == "FECHA_EMISION").confianza == "BAJA"
