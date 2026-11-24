# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Equipo de agendamiento de PROMOVER S.A.S. sede Cali** (rol `operativo`): toma solicitudes de cita que llegan por WhatsApp, revisa los documentos y datos que el bot y el OCR prepararon, contacta al paciente por WhatsApp o llamada, agenda en Visoft y marca la solicitud como gestionada. Trabaja en **portátil** (pantalla de 13–15") con WhatsApp abierto al lado; gestiona **entre 20 y 60 solicitudes al día** por persona, así que pasar rápido de una a otra importa.
- **Administradores** (`administrador`, `super_admin`): sobre todo **gestionan solicitudes igual que el equipo**; además configuran Agendas (servicios, franjas, reglas), usuarios y, el super_admin, el interruptor del bot.

## Product Purpose

Convertir los mensajes de WhatsApp de pacientes (Salud Total y SOS) en solicitudes listas para agendar: el bot recoge datos y documentos según el tipo de solicitud, un worker local lee los documentos con OCR, y el panel le presenta al equipo lo que falta, lo que hay que verificar y lo que ya está correcto. El bot nunca agenda: el equipo agenda en Visoft. Éxito: menos tiempo por solicitud, menos idas y vueltas con el paciente y ninguna cita mal asignada.

## Operating Context

- Flujo diario: lista de espera (colas por estado/servicio/EPS) → tomar solicitud → revisar documentos y alertas → contactar por WhatsApp o llamada → actualizar datos → «Revisado» → agendar en Visoft → «Gestionada».
- Herramientas al lado: WhatsApp Web, Visoft (agenda), teléfono.
- Tipos de solicitud (decididos 2026-11-24): terapia (continuidad: plan + última asistencia), valoración (orden, historia si es fisioterapia, OPS si aplica), especialista SOS (orden + historia, OPS si aplica). Detalle en `docs/superpowers/specs/`.
- Lineamientos de agendamiento: `docs/lineamientos_agendamiento_promover.md`.

## Capabilities and Constraints

- Next.js 16 + Tailwind 4 + Supabase (RLS por rol). Desplegado en Vercel. Worker OCR en Python en un equipo de la sede.
- Roles: `operativo`, `administrador`, `super_admin`. Configuración solo administradores.
- Datos de salud: nada de contenido clínico en logs; al cerrar se borra la solicitud.
- Debe funcionar en celular (no es el uso principal), tableta y escritorio.
- Pendiente (diseño aprobado, no construido): botón «Revisado» obligatorio antes de «Gestionada», campos prellenados y solo los requeridos por tipo, página «Aprendizaje».

## Brand Commitments

- Nombre: PROMOVER S.A.S., sede Cali. Idioma: español de Colombia, tuteo, claro y cálido.
- Los textos marcados PRELIMINAR en el bot esperan aprobación jurídica.

## Product Principles

1. Lo que falta primero: cada pantalla dice qué hay que hacer a continuación.
2. Solo lo que aplica: no mostrar campos, pasos ni opciones que no corresponden al tipo de solicitud o al rol.
3. Menos clics por solicitud: el equipo gestiona decenas al día.
4. El sistema propone, la persona decide: el OCR y el bot sugieren; nada se da por cierto sin revisión humana.

## Accessibility & Inclusion

Contraste AA, foco visible, objetivos táctiles de 44 px en celular, entradas de 16 px en móvil.
