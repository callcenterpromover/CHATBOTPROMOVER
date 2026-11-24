# Flujos por tipo de solicitud, revisión en el panel y aprendizaje

Fecha: 2026-11-24 · Estado: borrador para aprobación

## 1. Intención

En PROMOVER (sede Cali) una persona revisa **todas** las solicitudes antes de agendar en Visoft. Hoy:

- el bot hace las mismas preguntas a todos (orden, historia, terapia previa, plan…), aunque no apliquen;
- el panel muestra todos los campos a todos los tipos de solicitud y el equipo los llena uno a uno;
- cuando el equipo corrige la categoría o un dato, el sistema no se entera: se equivoca igual la próxima vez.

Se quiere que:

1. cada tipo de solicitud tenga **su flujo**: el bot solo pide lo que ese tipo necesita y el panel solo muestra esos campos;
2. el panel llegue **prellenado** con lo que leyó el OCR y la persona solo confirme o corrija;
3. el botón **«Revisado»** (hoy «Guardar cambios») guarde y declare «revisé todo y es correcto»; sin él no se puede cerrar como gestionada;
4. cada «Revisado» alimente el **aprendizaje**: la clasificación del servicio (el dolor principal) y la confianza del OCR mejoran solas, **sin pasos extra** para el equipo.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Definición única y editable (solo administradores) de tipos de solicitud, requisitos y reglas por diagnóstico, usada por bot y panel.
- Bot que identifica el tipo temprano y no hace preguntas que no aplican.
- Panel con solo los campos requeridos, prellenados, y botón «Revisado» obligatorio antes de «Gestionada».
- Registro de aprendizaje en cada «Revisado» y uso de lo aprendido para clasificar el servicio.
- Página «Aprendizaje» para ver y apagar lo aprendido.

**No objetivos**
- El bot no agenda (sigue igual: registra preferencia; el equipo agenda en Visoft).
- No se entrena un modelo de IA ni se reentrena Tesseract. (Un clasificador estadístico queda para después, cuando haya volumen.)
- No se escriben reglas de extracción nuevas automáticamente.

**Antiobjetivos (sería un fracaso aunque funcione)**
- Que el bot pida documentos que no aplican o deje de pedir uno obligatorio.
- Que el aprendizaje haga al sistema **inventar** o afirmar con confianza alta algo aprendido de pocos casos.
- Que el equipo tenga más clics que hoy para cerrar una solicitud.
- Guardar texto completo de documentos de pacientes para «aprender».

## 3. Restricciones

- Privacidad: el texto OCR completo no se guarda; solo campos (como hoy en `campos_extraidos`). Para la historia se guardan solo las **categorías de especialidad** halladas en análisis y manejo, no texto.
- Todo lo configurable se edita desde el panel, solo administradores (`requerirRol(["administrador","super_admin"])`), con RPC `security definer` + `private.exigir_admin()` + auditoría, como en Agendas.
- El worker (Python, en la sede) solo lee documentos y reporta campos; no decide requisitos (decisión: enfoque A).
- Nada de esto cambia los permisos actuales de RLS sobre solicitudes.

## 4. Enfoques considerados

| | Enfoque | A favor | En contra |
|---|---|---|---|
| **A (elegido)** | Tablas en Supabase + un módulo TypeScript (`web/lib/requisitos.ts`) que calcula requisitos; lo usan bot y panel; el worker solo extrae | una sola lógica, mismo lenguaje del motor del bot, fácil de probar | mover a la web reglas de OPS que hoy viven en el worker |
| B | Mismas tablas + función SQL que calcula requisitos, llamada por web y worker | fuente única aun si el worker decidiera | SQL difícil de probar/cambiar; el bot ya está en TS |
| C (descartado) | Lógica duplicada TS + Python | — | bot y worker terminarían diciendo cosas distintas |

Aprendizaje de la clasificación: **memoria de casos** (enfoque A del aprendizaje) con la visibilidad de «sugerencias para administrador». Descartados por ahora: clasificador estadístico (pocos datos) y solo sugerencias manuales (depende de que alguien las apruebe).

## 5. Tipos de solicitud y requisitos (decididos con PROMOVER)

**Valoraciones:** son una sola cita. Sirven para iniciar el proceso de terapias o para que un especialista revise al paciente, si aplica. Nunca son continuidad.

| Tipo | Datos del paciente | Documentos | Reglas / avisos |
|---|---|---|---|
| **Continuidad de terapia** (ya hace terapias, cualquier EPS y cualquier terapia) | EPS, tipo y número de documento, nombre | **solo** plan de tratamiento + fecha de última asistencia | más de **20 días** sin asistir (editable) → no es continuidad: debe renovar el proceso (SOS: medicina general de su EPS para renovar órdenes y documentos). Las **valoraciones y los especialistas no tienen continuidad**: son una sola cita |
| Salud Total: terapia (física, respiratoria, ocupacional, fono) | EPS, documento, nombre | orden (direccionamiento) + vencimiento | Salud Total **no** maneja especialistas |
| SOS: terapia física / valoración de fisioterapia | EPS, documento, nombre | orden + vencimiento | OPS no exigida |
| SOS: fonoaudiología | + edad | orden + **OPS siempre** | |
| SOS: ocupacional | + edad | orden + **OPS si menor**; adulto: **OPS si el diagnóstico está en la lista** | sin diagnóstico legible → «OPS: verificar» |
| SOS: especialistas (fisiatría, ortopedia/UPI, equipo interdisciplinario, infiltraciones) | + edad (≥ 16) | orden + historia; **OPS según IPS y diagnóstico** (lista) | menor de 16 → mensaje de EPS (ya existe) |
| Cualquier servicio genérico (ingreso modelo fisioterapia y rehabilitación, equipo interdisciplinario, UPI, fisiatría) | — | **+ historia clínica** (sección análisis y manejo) | |

**OPS:** el bot la **pide** cuando es obligatoria (fono SOS, ocupacional menor, adulto con diagnóstico de la lista conocido en la conversación o leído por OCR). Si «depende» (IPS/diagnóstico sin lista), **no la exige**: el panel muestra «OPS: verificar según IPS y diagnóstico».

**Reglas por diagnóstico (lista editable):** una sola tabla para todo lo que dependa del diagnóstico. Cada entrada: nombre, códigos CIE-10 (prefijos, p. ej. `I63`, `I64`), palabras clave, servicio al que aplica, grupo de edad, qué exige (hoy: OPS). Semilla inicial: Down (Q90), ACV (I63, I64…), condiciones psicológicas (F…), alteración de la marcha (R26) para ocupacional adulto; especialistas vacía hasta que PROMOVER la llene. El CIE-10 viene de la orden o la historia (OCR) o lo corrige el equipo.

## 6. Diseño

### 6.1 Datos (migración nueva)

- `tipos_solicitud`: código, nombre, eps (`TODAS|SALUD_TOTAL|SOS`), servicios/categorías que lo activan, `es_continuidad`, orden, activo.
- `requisitos_tipo`: por tipo, qué **campos** (documento, nombre, edad, fecha última asistencia…) y qué **documentos** (orden, historia, plan, OPS) aplican y con qué condición (`SIEMPRE`, `SI_MENOR`, `SI_DIAGNOSTICO`, `VERIFICAR`).
- `reglas_diagnostico`: la lista editable descrita arriba.
- `configuracion_agenda`: + `dias_max_inasistencia` (20, todas las EPS).
- `solicitudes`: + `tipo_solicitud` (código), + `ultima_asistencia` (fecha; puede reutilizar `cita_previa_fecha` — decisión del builder tras revisar usos), + `revisado_en`, `revisado_por`.
- `aprendizaje_registros` (solo lectura para operadores, escritura por RPC): solicitud, campo/aspecto (`CATEGORIA`, `DOCUMENTO`, `NOMBRE`, `EPS`, `TIPO_DOCUMENTO`, estados), valor propuesto por el sistema, valor final, formato/emisor detectado, confianza, fecha.
- `aprendizaje_servicio`: texto de servicio normalizado → categoría final, conteos por categoría, activo (apagable), última actualización.
- La categoría que **sugirió el sistema** se guarda aparte (`categoria_sugerida`, `clasificacion_origen`: `REGLA|APRENDIDO|HISTORIA`) para que la corrección humana no la borre.

### 6.2 Lógica compartida — `web/lib/requisitos.ts` (pura, con pruebas)

- `tipoSolicitud(datos, catalogo)`: EPS + servicio/categoría + continuidad → tipo.
- `requisitos(solicitud, tipo, reglasDiagnostico, edadCorte)`: lista de campos y documentos con estado `REQUERIDO|NO_APLICA|VERIFICAR` y motivo legible.
- `faltantes(solicitud, requisitos)`: lo que falta para estar completa.
- `continuidadVencida(ultimaAsistencia, eps, config)`.
- `clasificarConAprendizaje(servicioTexto, memoria, reglas)`: si el texto normalizado tiene ≥ **5** casos y ≥ **90 %** a una categoría y está activo → esa categoría, confianza MEDIA, motivo «aprendido de N casos»; si no, las reglas actuales. Nunca confianza ALTA por aprendizaje. Umbrales editables.

### 6.3 Bot

Nuevo orden: consentimiento → documento → nombre → EPS → edad → servicio (→ especialista) → **¿ya está haciendo terapias de este servicio?** → según tipo:

- **Continuidad de terapia** (la pregunta «¿ya está haciendo terapias?» solo se hace si el servicio es una terapia, nunca para valoraciones ni especialistas): fecha de última asistencia → (> 20 días: mensaje de renovar el proceso; SOS: medicina general de su EPS; termina sin pedir documentos) → plan de tratamiento → preferencia → factores.
- **Nuevo:** orden → (OPS si obligatoria) → (historia si el servicio es genérico o especialista) → preferencia → factores.

Cada paso de documento se salta si `requisitos` dice `NO_APLICA`. La OPS se pide solo si es `REQUERIDO`. Si el diagnóstico que obliga OPS solo se conoce después (OCR de la orden), el bot pide la OPS en ese momento. Conversaciones a mitad de camino siguen funcionando (los pasos existentes aceptan lo mismo). Mensajes nuevos en `mensajes.ts` (fecha última asistencia, OPS, medicina general SOS).

### 6.4 Panel — detalle de la solicitud

- Arriba, el **tipo de solicitud** (editable si el sistema se equivocó) y la lista de requisitos con su estado (✔ recibido / falta / verificar + motivo).
- Solo se muestran los campos que el tipo requiere; vienen **prellenados** con el valor OCR (o el de la conversación) y se distingue visualmente lo que viene del OCR con confianza baja.
- Los estados de documentos (orden, historia, plan, OPS) se proponen automáticamente desde OCR + requisitos; la persona solo cambia lo que esté mal.
- Botón **«Revisado»** reemplaza «Guardar cambios»: guarda todo, marca `revision_humana = COMPLETADA`, `revisado_en/por`, y escribe los registros de aprendizaje (RPC). Se puede pulsar más de una vez (re-revisión); el aprendizaje usa la última.
- **«Marcar como gestionada»** queda deshabilitado (y bloqueado en servidor) hasta que exista «Revisado» posterior al último cambio del sistema.
- Las correcciones campo a campo actuales (`valor_corregido`) se integran en el mismo formulario: ya no hay botones «Guardar» por campo.

### 6.5 Aprendizaje

- Al «Revisado»: un registro por aspecto comparando propuesto vs final. Cambiado = error; igual = acierto (implícito; válido porque «Revisado» significa revisado y correcto).
- `aprendizaje_servicio` se actualiza al instante desde los registros (clave: servicio normalizado sin números/CUPS, sin datos personales).
- Confianza del OCR por formato: si un campo de un formato se corrige en > 30 % de los últimos 20 casos, su confianza baja un nivel en el panel (marca «revisar»); < 5 % sube a ALTA. Cálculo en la web al mostrar (o vista SQL); el worker no cambia.
- Umbrales de legibilidad: recalculo semanal sugerido en la página Aprendizaje (no automático en el worker; el administrador lo aplica). *Llamada del diseñador: aplicar automáticamente en el worker es riesgoso sin supervisión.*
- Formatos no reconocidos: conteo de documentos con tipo DESCONOCIDO agrupados por emisor/encabezado detectado.

### 6.6 Página «Aprendizaje» (`/admin/aprendizaje`, administradores)

```
Aprendizaje                               últimos 30 días
Servicio: acierto 81 % (↑ 6)   Documento: 77 %   Nombre: 70 %   EPS: 99 %
Aprendido (servicio → categoría)         casos  acuerdo  activo
«terapia fisica sedativa» → Fisioterapia     9    100 %    [✔]
«consulta ingreso modelo…» → Fisioterapia   14     86 %    [ ]  ← bajo el umbral
Formatos sin reconocer: 3 casos «Clínica Nueva…»
```

Más las secciones editables: tipos de solicitud y requisitos, reglas por diagnóstico, umbrales.

## 7. Orden de construcción

1. Base: tablas + `requisitos.ts` + páginas admin de tipos/requisitos/diagnósticos.
2. Panel: tipo + requisitos + prellenado + «Revisado» + bloqueo de «Gestionada» + registros de aprendizaje.
3. Bot: flujo por tipo.
4. Aprendizaje: memoria de servicio en la clasificación, confianza por formato, página «Aprendizaje».

Cada etapa se puede subir sola. La 2 empieza a acumular datos para la 4.

## 8. Precisiones tras la revisión del builder

Respondidas por la conversación o el proyecto:
- **La OPS es la autorización de SOS**: se usan `autorizacion_estado` y el documento `AUTORIZACION` existentes; no hay columna nueva.
- **El bot no pregunta la IPS**: PROMOVER no puede saber con certeza la IPS primaria del paciente. Lo que «depende de IPS» queda en `VERIFICAR`; `ips_sos` solo alimenta los avisos al equipo.
- **El servicio en el bot es menú numerado**, así que la memoria de aprendizaje usa como clave el **texto del servicio leído por OCR en la orden** (normalizado, sin CUPS ni números), no lo que eligió el paciente.

Llamadas del diseñador (revisables):
- **Retención (privacidad):** al cerrar, `cerrar_solicitud` sigue borrando todo lo de la solicitud. Los registros de aprendizaje se guardan **sin vínculo a la solicitud y sin valores personales**: para documento, nombre y EPS solo «coincidió sí/no», formato y confianza. Para el servicio se guardan el texto normalizado del servicio y las categorías sugerida y final, que no identifican al paciente. `private.contar_restos` no los cuenta como restos. Así las métricas de 30 días sobreviven al cierre.
- **Estado general:** los requisitos calculados por `requisitos.ts` se **persisten en la solicitud** (`requisitos jsonb` + `tipo_solicitud`) cada vez que el bot o el panel actúan. El `calcular_estado` del worker y las colas leen esos requisitos persistidos en vez de suponer orden + historia; sin requisitos persistidos se conserva el comportamiento actual.
- **Re-revisión:** «Gestionada» se bloquea de nuevo solo si llega un **documento nuevo** procesado por el worker después del último «Revisado». Los cambios del bot o de otro operador no lo bloquean.
- **«Menor de edad» para OPS de ocupacional:** menos de **18** años, como valor editable propio (`edad_mayoria`), distinto del corte niño/adulto de las franjas y del mínimo de 16 de especialistas.
- **Formato del documento:** el worker agrega un campo extraído `EMISOR` (Comfandi, Viva 1A, IPSMedic, FIDEM, Virrey Solís/Salud Total, OPS SOS, PROMOVER, desconocido) a partir de los mismos patrones que ya usa para el tipo. Es extracción, no decisión: respeta el enfoque A.

## 9. Lo que queda al builder

- Nombres exactos de columnas/tablas y si `ultima_asistencia` reutiliza `cita_previa_fecha`.
- Cómo encajar la clasificación actual del worker (`reglas.py`) con la de la web: el worker sigue sugiriendo; la web la complementa con lo aprendido al mostrar y al revisar.
- Migración de solicitudes abiertas: calcular su tipo al vuelo; no bloquear «Gestionada» a las que ya estaban en proceso antes del despliegue (o pedir «Revisado» una vez).
- Diseño visual del panel siguiendo el estilo actual (skill impeccable).
