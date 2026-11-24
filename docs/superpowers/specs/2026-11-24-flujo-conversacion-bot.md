# Flujo de la conversación del bot por tipo de solicitud

Fecha: 2026-11-24 · Parte de `2026-11-24-flujos-revision-aprendizaje-design.md` (§6.3). Aprobado por PROMOVER al pedir «define el flujo y ajusta el chat».

## Principios

- Una pregunta a la vez; nunca se confirma una cita (el equipo agenda en Visoft).
- Solo se pide lo que el tipo de solicitud necesita. El tipo sale del **servicio elegido en el menú** (catálogo de Agendas):
  - **Terapia** (continuidad: terapia física, terapia respiratoria, terapia de fonoaudiología, terapia ocupacional): solo plan de tratamiento + fecha de última asistencia.
  - **Valoración** (una sola cita; inicia el proceso de terapias): orden (+ historia si el servicio la exige) (+ OPS si es obligatoria).
  - **Especialista** (fisiatría, ortopedia/UPI, equipo interdisciplinario, infiltraciones; solo SOS; una sola cita): orden + historia (+ OPS si es obligatoria).
- **OPS (solo SOS)**, según la columna «autorización SOS» del servicio en Agendas: `SIEMPRE` → se pide; `CONDICIONAL` → se pide si el paciente es menor de edad (< 18), y en adultos depende del diagnóstico/IPS (el equipo la verifica; el bot no la pide); `MENORES` → solo menores; `NO` → nunca. Salud Total no usa OPS: su direccionamiento es la orden.
- **Historia clínica**: especialistas y valoración de fisioterapia (sus órdenes suelen ser «consulta de ingreso modelo fisioterapia y rehabilitación», que exige revisar la sección de análisis y manejo).
- **Continuidad**: más de **20 días** sin asistir → no es continuidad: debe ir a medicina general de su EPS para renovar órdenes y documentos (Salud Total y SOS).

## Flujo

```
INICIO ─ bienvenida
  └─ CONSENTIMIENTO ── NO ──────────────────────────────▶ FIN 1 · Sin autorización (no se guarda nada)
        SÍ
  DOCUMENTO (→ CONFIRMAR si traía puntos/letras) → NOMBRE → EPS
        Otra EPS ───────────────────────────────────────▶ FIN 2 · EPS fuera de alcance (revisión manual)
  EDAD → SERVICIO (menú por EPS; SOS: submenú Especialistas)
        especialista y < 16 años ── aviso EPS → vuelve al menú (o FIN 3 si escribe CANCELAR)

  ┌─ TERAPIA ─ ÚLTIMA ASISTENCIA (fecha o «hace N días»)
  │     > 20 días ──────────────────────────────────────▶ FIN 4 · Renovar proceso (medicina general EPS)
  │     PLAN (foto) ─ «no tengo» → aviso, queda pendiente
  │
  ├─ VALORACIÓN ─ ORDEN (foto) ─ «no tengo» ───────────▶ FIN 5 · Sin orden (pídela a tu EPS; envíala por aquí)
  │     [valoración de fisioterapia] HISTORIA (páginas + LISTO) ─ «no tengo» → aviso, queda pendiente
  │     [SOS y OPS obligatoria] OPS (foto) ─ «no tengo» → aviso, queda pendiente
  │
  └─ ESPECIALISTA ─ ORDEN ─ «no tengo» ────────────────▶ FIN 5
        HISTORIA (páginas + LISTO) ─ «no tengo» → aviso, queda pendiente
        [OPS obligatoria] OPS (foto) ─ «no tengo» → aviso, queda pendiente

  PREFERENCIA (franjas del servicio o texto) → FACTORES (fuera de Cali, movilidad, embarazo)
                                                       ▶ FIN 6 · Solicitud registrada (resumen)

En cualquier paso:  URGENCIA → aviso 123 y sigue · PERSONA → alerta y sigue
                    CANCELAR → ▶ FIN 7 · Desistió · audio/otro → aviso y repite la pregunta
Después de un FIN:  documentos se agregan a la solicitud · NUEVA → nueva solicitud
```

## Datos que registra

`documento`, `nombre`, `eps`, `edad`, `servicio`, `ultima_asistencia` (terapia), estados `orden/historia/plan/autorizacion` (`REQUERIDO_PENDIENTE` cuando falta un documento obligatorio), `preferencia_horario`, `factores`, y alertas: `EPS_FUERA_DE_ALCANCE`, `CONTINUIDAD_VENCIDA`, `SIN_ORDEN`, `MENOR_EDAD_ESPECIALISTA`, `POSIBLE_URGENCIA`, `SOLICITA_PERSONA`, `PACIENTE_DESISTE`.

## Compatibilidad

Las conversaciones que ya iban por el paso anterior `TERAPIA_PREVIA` saltan al siguiente paso del flujo nuevo según su servicio.
