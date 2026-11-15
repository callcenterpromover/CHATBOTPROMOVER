# PROMOVER — Chatbot de recepción y lista de espera (piloto, Sede Cali)

El bot prepara solicitudes; **no agenda citas**. La asignación final se hace en Visoft.
La documentación funcional está en `Downloads\chatbot\chatbot\PROMOVER_Chatbot_Piloto` (documentos 00 a 11, v0.4).

## Estructura

| Carpeta | Qué es | Estado |
|---|---|---|
| `supabase/` | Esquema de la base (migraciones) y datos ficticios (`seed.sql`) | Fase 1 hecha |
| `web/` | Panel administrativo (Next.js), publicado en https://chatbotpromover.vercel.app. Después alojará el webhook de WhatsApp | Panel hecho; webhook pendiente (Fase 3) |
| `worker/` | Proceso Python de OCR para el equipo de la sede (ver `worker/README.md`) | Hecho y probado con documentos ficticios; falta calibrar con fotos reales anonimizadas |

## Bot de WhatsApp

- Lógica de la conversación: `web/lib/bot/motor.ts` (función pura, con pruebas en `motor.test.ts`).
  Textos en `web/lib/bot/mensajes.ts`; los marcados **PRELIMINAR** requieren aprobación de PROMOVER.
- Webhook para Meta: `web/app/api/whatsapp/route.ts` (verifica firma, no procesa dos veces un mensaje).
- Avisos tras el OCR: el worker llama a `/api/interno/documento-procesado` con `WORKER_SECRET`.
- **Simulador** (sin la API de Meta): con `MODO_SIMULACION=1`, el panel muestra «Simulador WhatsApp».
  Los documentos adjuntos son los ficticios de `worker/entrada`; el worker debe estar corriendo.
  Debe ponerse en `0` cuando haya pacientes reales.
- Pruebas: `npm --prefix web test`. Conversación completa contra la base:
  `npx tsx --env-file=.env.local scripts/probar-conversacion.mts` (desde `web/`).

Variables de servidor en Vercel (nunca con `NEXT_PUBLIC_`): `SUPABASE_SECRET_KEY`, `WORKER_SECRET`,
`MODO_SIMULACION`, y cuando exista la cuenta de Meta: `META_VERIFY_TOKEN`, `META_APP_SECRET`,
`META_PHONE_NUMBER_ID`, `META_WHATSAPP_TOKEN`. Registrar en Meta el webhook
`https://chatbotpromover.vercel.app/api/whatsapp`.

Pendiente legal: la Ley 1581 exige conservar prueba de la autorización, pero el cierre borra todo,
incluida `consentimiento_en`. Definir con jurídica cómo conservarla sin datos clínicos.

Controles de seguridad, pendientes antes de datos reales y respuesta a incidentes: [SEGURIDAD.md](SEGURIDAD.md).

## Reglas que no se rompen

- Las imágenes y documentos **nunca** se suben a Supabase ni a Vercel.
- No se guarda el chat ni el texto OCR completo; solo campos mínimos de solicitudes activas.
- Marcar `GESTIONADA` borra todo lo identificable de esa solicitud y lo verifica (`public.cerrar_solicitud`).
- Los logs no llevan nombres, documentos, teléfonos ni contenido clínico.
- La clave `service_role` / secreta y el token de Meta solo van en el servidor, jamás con `NEXT_PUBLIC_`.
- Toda tabla nueva lleva RLS y solo la ven los operadores (`private.es_operador()`).

## Ejecutar el panel en este equipo

```bash
npm --prefix web run dev
```

Abre http://localhost:3000. Las claves públicas están en `web/.env.local` (no se sube a git).

## Dar acceso a una persona al panel

1. En Supabase → Authentication → Users → **Add user**: correo y contraseña (la define la persona).
2. Habilitarla como operador (SQL Editor), cambiando el correo y el nombre:

```sql
insert into public.operadores (user_id, nombre)
select id, 'Nombre del auxiliar' from auth.users where email = 'correo@ejemplo.com';
```

3. En Authentication → Sign In / Providers, desactivar **Allow new users to sign up**.
   Aunque alguien se registrara, sin estar en `operadores` no ve ningún dato.

## Proyecto Supabase

- Nombre: `Chatbot` (ref `zmahnuhjvorejxtjzffn`) · región Oregón, EE. UU. (`us-west-2`).
  La documentación (04 §0, 05 §10) preveía São Paulo; la región de un proyecto no se puede cambiar.
- Conexión directa a la base desde redes IPv4: `aws-1-us-west-2.pooler.supabase.com:5432`,
  usuario `postgres.zmahnuhjvorejxtjzffn`. La contraseña no se guarda en el repositorio.
- Probar permisos y borrado: ejecutar `supabase/tests/permisos_y_cierre.sql` (no deja cambios).
- Solo datos ficticios hasta completar la revisión de privacidad (documento 05 §10).
- Existe un proyecto anterior sin uso, `promover-chatbot-piloto` (otra cuenta), pendiente de borrar.
