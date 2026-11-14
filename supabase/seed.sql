-- DATOS FICTICIOS para la Fase 1. Ninguna persona real. No ejecutar en un entorno con datos reales.
insert into public.solicitudes
  (creada_en, ultima_interaccion, telefono, nombre, documento, eps, eps_texto, servicio_texto,
   categoria_probable, clasificacion_motivo, clasificacion_confianza, estado, orden_estado,
   historia_estado, plan_estado, autorizacion_estado, orden_vencimiento, orden_vencimiento_texto,
   orden_vencimiento_confianza, terapia_previa, preferencia_horario, edad, factores, factores_origen)
values
  (now() - interval '12 days', now() - interval '1 day', '573000000001', 'María Ejemplo Uno (ficticio)', '1000000001', 'SALUD_TOTAL', 'Salud Total', 'Terapia física integral',
   'FISIOTERAPIA', 'La orden indica terapia física y la historia lo respalda.', 'ALTA', 'LISTA_PARA_REVISION', 'LEGIBLE',
   'RECIBIDA_PENDIENTE_REVISION', 'NO_REQUERIDO', 'RECIBIDA', current_date + 5, 'Válida hasta ' || to_char(current_date + 5, 'DD/MM/YYYY'), 'ALTA', 'NO', 'Mañanas', 41, '{}', null),
  (now() - interval '3 days', now() - interval '3 days', '573000000002', 'Carlos Ejemplo Dos (ficticio)', '1000000002', 'SOS', 'SOS', 'Terapia de lenguaje',
   'FONOAUDIOLOGIA', 'Texto de la orden.', 'MEDIA', 'ESPERANDO_HISTORIA', 'LEGIBLE',
   'NO_RECIBIDA', 'NO_REQUERIDO', 'NO_RECIBIDA', current_date + 40, null, 'ALTA', 'NO', null, 9, '{}', null),
  (now() - interval '8 days', now() - interval '2 days', '573000000003', 'Lucía Ejemplo Tres (ficticio)', '1000000003', 'SALUD_TOTAL', 'Salud Total', 'Terapia ocupacional',
   'TERAPIA_OCUPACIONAL', 'Texto de la orden.', 'MEDIA', 'PENDIENTE_VERIFICACION_HUMANA', 'LEGIBLE',
   'POSIBLEMENTE_INCOMPLETA', 'NO_REQUERIDO', 'NO_DETERMINADA', current_date + 21, null, 'MEDIA', 'NO', 'Tardes', 35, '{}', null),
  (now() - interval '20 days', now() - interval '4 days', '573000000004', 'Jorge Ejemplo Cuatro (ficticio)', '1000000004', 'SOS', 'S.O.S', 'UPI osteomuscular',
   'ORTOPEDIA', 'UPI osteomuscular se interpreta como Ortopedia (RB-012).', 'ALTA', 'PENDIENTE_VERIFICACION_HUMANA', 'LEGIBLE',
   'RECIBIDA_PENDIENTE_REVISION', 'NO_REQUERIDO', 'RECIBIDA', current_date + 2, null, 'ALTA', 'SI', null, 58, '{MOVILIDAD_REDUCIDA}', 'DECLARADO'),
  (now() - interval '1 day', now() - interval '1 day', '573000000005', 'Sofía Ejemplo Cinco (ficticio)', '1000000005', 'SALUD_TOTAL', 'salud total', 'Fisioterapia',
   'SIN_CLASIFICAR', null, null, 'DOCUMENTOS_POR_REENVIAR', 'ILEGIBLE',
   'NO_RECIBIDA', 'NO_REQUERIDO', 'NO_DETERMINADA', null, null, null, null, null, null, '{}', null),
  (now() - interval '6 days', now() - interval '6 days', '573000000006', 'Andrés Ejemplo Seis (ficticio)', '1000000006', 'OTRA', 'Nueva EPS', 'Terapia física',
   'FISIOTERAPIA', 'Texto de la orden.', 'MEDIA', 'PENDIENTE_VERIFICACION_HUMANA', 'LEGIBLE',
   'RECIBIDA_PENDIENTE_REVISION', 'NO_REQUERIDO', 'NO_DETERMINADA', current_date + 15, null, 'MEDIA', 'NO', null, 50, '{}', null),
  (now() - interval '15 days', now() - interval '5 days', '573000000007', 'Elena Ejemplo Siete (ficticio)', '1000000007', 'SALUD_TOTAL', 'Salud Total', 'Consulta de primera vez por fisiatría y rehabilitación',
   'FISIATRIA', 'Orden genérica; la historia indica Fisiatría (RB-014).', 'MEDIA', 'LISTA_PARA_REVISION', 'LEGIBLE',
   'COMPLETITUD_CONFIRMADA_HUMANAMENTE', 'NO_REQUERIDO', 'RECIBIDA', current_date + 30, null, 'ALTA', 'SI', null, 67, '{ADULTO_MAYOR}', 'DOCUMENTADO'),
  (now() - interval '4 days', now() - interval '4 days', '573000000007', 'Elena Ejemplo Siete (ficticio)', '1000000007', 'SALUD_TOTAL', 'Salud Total', 'Terapia respiratoria',
   'TERAPIA_RESPIRATORIA', 'Texto de la orden.', 'ALTA', 'ESPERANDO_HISTORIA', 'LEGIBLE',
   'NO_RECIBIDA', 'NO_REQUERIDO', 'NO_RECIBIDA', current_date + 25, null, 'ALTA', 'NO', null, 67, '{ADULTO_MAYOR}', 'DOCUMENTADO'),
  (now() - interval '9 days', now() - interval '3 days', '573000000009', 'Rosa Ejemplo Nueve (ficticio)', '1000000009', 'SOS', 'SOS', 'Terapia ocupacional',
   'TERAPIA_OCUPACIONAL', 'Continuidad: ya inició terapia para este diagnóstico (RB-017).', 'ALTA', 'ESPERANDO_PLAN', 'LEGIBLE',
   'RECIBIDA_PENDIENTE_REVISION', 'REQUERIDO_PENDIENTE', 'RECIBIDA', current_date + 12, null, 'ALTA', 'SI', 'Lunes o miércoles', 72, '{ADULTO_MAYOR,FUERA_DE_CALI}', 'DECLARADO'),
  (now() - interval '5 days', now() - interval '5 days', '573000000010', 'Mateo Ejemplo Diez (ficticio)', '1000000010', 'SOS', 'SOS', 'Consulta con fisiatría',
   'FISIATRIA', 'Texto de la orden.', 'MEDIA', 'PENDIENTE_VERIFICACION_HUMANA', 'LEGIBLE',
   'RECIBIDA_PENDIENTE_REVISION', 'NO_REQUERIDO', 'RECIBIDA', current_date + 18, null, 'ALTA', 'NO', null, 12, '{}', null),
  (now() - interval '11 days', now() - interval '2 days', '573000000011', 'Pedro Ejemplo Once (ficticio)', '1000000011', 'SALUD_TOTAL', 'Salud Total', 'Fonoaudiología',
   'FONOAUDIOLOGIA', 'Texto de la orden.', 'ALTA', 'PENDIENTE_VERIFICACION_HUMANA', 'LEGIBLE',
   'RECIBIDA_PENDIENTE_REVISION', 'NO_REQUERIDO', 'POSIBLEMENTE_UTILIZADA', current_date - 1, '0?/11/2026', 'BAJA', 'NO', null, 30, '{EMBARAZO}', 'DECLARADO'),
  (now() - interval '2 hours', now() - interval '2 hours', '573000000012', null, null, 'SIN_DEFINIR', null, null,
   'SIN_CLASIFICAR', null, null, 'ESPERANDO_DATOS', 'NO_RECIBIDA',
   'NO_RECIBIDA', 'NO_REQUERIDO', 'NO_DETERMINADA', null, null, null, null, null, null, '{}', null);

insert into public.campos_extraidos (solicitud_id, campo, origen, valor_ocr, confianza, verificacion)
select s.id, v.campo, v.origen, v.valor_ocr, v.confianza, v.verificacion
from (values
  ('1000000001', 'Terapia física integral', 'DOCUMENTO', 'ORDEN', '1000000001', 'ALTA', 'COINCIDE'),
  ('1000000001', 'Terapia física integral', 'NOMBRE', 'ORDEN', 'MARIA EJEMPLO UNO', 'ALTA', 'COINCIDE'),
  ('1000000001', 'Terapia física integral', 'DIAGNOSTICO', 'HISTORIA', 'M545 (ficticio)', 'MEDIA', 'SIN_COMPARAR'),
  ('1000000004', 'UPI osteomuscular', 'DOCUMENTO', 'ORDEN', '1000000904', 'MEDIA', 'DISCREPANCIA'),
  ('1000000004', 'UPI osteomuscular', 'NOMBRE', 'ORDEN', 'JORGE EJEMPLO CUATRO', 'ALTA', 'COINCIDE'),
  ('1000000004', 'UPI osteomuscular', 'NUMERO_ORDEN', 'AUTORIZACION', 'OPS-000123 (ficticio)', 'ALTA', 'SIN_COMPARAR'),
  ('1000000011', 'Fonoaudiología', 'FECHA_VENCIMIENTO', 'AUTORIZACION', '0?/11/2026', 'BAJA', 'SIN_COMPARAR'),
  ('1000000011', 'Fonoaudiología', 'NUMERO_ORDEN', 'AUTORIZACION', 'DIR-445566 (ficticio)', 'MEDIA', 'SIN_COMPARAR')
) as v (documento, servicio, campo, origen, valor_ocr, confianza, verificacion)
join public.solicitudes s on s.documento = v.documento and s.servicio_texto = v.servicio;

insert into public.alertas (solicitud_id, codigo, detalle)
select s.id, v.codigo, v.detalle
from (values
  ('1000000003', 'Terapia ocupacional', 'HISTORIA_POSIBLEMENTE_INCOMPLETA', 'La historia clínica indica "Página 2 de 4" y solo se recibieron 2 páginas. Confirmar con el paciente si faltan las páginas 3 y 4.'),
  ('1000000004', 'UPI osteomuscular', 'DISCREPANCIA_DOCUMENTO', 'El número de documento leído en la orden no coincide con el que escribió el paciente. Revisar el original en WhatsApp y corregir el dato; el sistema no eligió ninguno.'),
  ('1000000004', 'UPI osteomuscular', 'ORDEN_PROXIMA_A_VENCER', 'La orden vence en menos de 3 días según la fecha leída. Priorizar la revisión.'),
  ('1000000006', 'Terapia física', 'EPS_FUERA_DE_ALCANCE', 'El paciente declaró una EPS distinta de Salud Total y SOS. No se aplicaron reglas automáticas; decidir manualmente cómo continuar.'),
  ('1000000007', 'Consulta de primera vez por fisiatría y rehabilitación', 'MISMO_PACIENTE_MULTIPLES_SOLICITUDES', 'Este paciente tiene 2 solicitudes activas (Fisiatría y Terapia respiratoria). Confirmar que son independientes y no un duplicado.'),
  ('1000000007', 'Terapia respiratoria', 'MISMO_PACIENTE_MULTIPLES_SOLICITUDES', 'Este paciente tiene 2 solicitudes activas (Fisiatría y Terapia respiratoria). Confirmar que son independientes y no un duplicado.'),
  ('1000000010', 'Consulta con fisiatría', 'MENOR_16_ESPECIALISTA', 'El paciente declara 12 años y solicita especialista. El lineamiento indica que los menores de 16 no se atienden con especialistas, incluso con OPS. Revisar antes de contactar.'),
  ('1000000011', 'Fonoaudiología', 'FECHA_VENCIMIENTO_NO_CONFIRMADA', 'La fecha de vencimiento se leyó con baja confianza ("0?/11/2026"). No se declara vencida ni vigente; verificar en el documento original.'),
  ('1000000011', 'Fonoaudiología', 'AUTORIZACION_POSIBLEMENTE_UTILIZADA', 'El campo "N.º ORDEN DE DIRECCIONAMIENTO" tiene un valor. Según la regla informada, la autorización podría estar utilizada; verificar.')
) as v (documento, servicio, codigo, detalle)
join public.solicitudes s on s.documento = v.documento and s.servicio_texto = v.servicio;

insert into public.trabajos_ocr (solicitud_id, media_id, tipo_documento, estado, intentos, legibilidad, pagina_actual, pagina_total, terminado_en)
select s.id, v.media_id, v.tipo, v.estado, 1, v.legibilidad, v.pa, v.pt, now()
from (values
  ('1000000001', 'Terapia física integral', 'media-ficticio-001', 'ORDEN', 'COMPLETADO', 'LEGIBLE', null::int, null::int),
  ('1000000003', 'Terapia ocupacional', 'media-ficticio-003', 'HISTORIA', 'COMPLETADO', 'LEGIBLE', 2, 4),
  ('1000000005', 'Fisioterapia', 'media-ficticio-005', 'ORDEN', 'REENVIO_REQUERIDO', 'ILEGIBLE', null, null)
) as v (documento, servicio, media_id, tipo, estado, legibilidad, pa, pt)
join public.solicitudes s on s.documento = v.documento and s.servicio_texto = v.servicio;
