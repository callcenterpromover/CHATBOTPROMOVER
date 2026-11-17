# Auditoría de seguridad — 17 de noviembre de 2026

Revisión del repositorio CHATBOTPROMOVER (panel Next.js, base Supabase y worker OCR) con criterios
de OWASP Top 10. Se revisó la base en producción (proyecto Chatbot), el código y el historial de git.

## Resumen

| Área | Estado | Cambio aplicado |
|---|---|---|
| RLS y permisos de la base | Bien, con un hallazgo | Cierre solo por función; borrado directo revocado |
| Secretos y git | Bien | Ninguno |
| Autenticación y sesiones | Bien, con un hallazgo | Límite de intentos de inicio de sesión |
| Cabeceras y CSP | Mejorable | CSP con nonce, HSTS, COOP |
| Webhook (DoS) | Mejorable | Límite de mensajes por número |
| Worker y archivos | Bien | Ninguno |
| Dependencias | Bien en producción | Actualizaciones menores |

## Hallazgos y correcciones

**1. Borrado directo de solicitudes (riesgo medio, corregido).** Un operativo podía borrar por la API
REST de Supabase una solicitud asignada a él, sin pasar por `cerrar_solicitud`: sin validar el motivo
y sin registro en `auditoria`. Ahora `cerrar_solicitud` corre con permisos propios, verifica que quien
llama tenga la solicitud asignada o sea administrador, y se revocó `DELETE` sobre `solicitudes` y
`observaciones` para usuarios del panel (migración `20261123000000_endurecimiento.sql`).

**2. Sin límite de intentos de inicio de sesión (riesgo medio, corregido).** El inicio de sesión se hace
desde el servidor, así que el límite por IP de Supabase Auth ve la IP de Vercel y no la del atacante.
Ahora: 5 intentos por cuenta y 20 por IP cada 15 minutos, guardados en la base con claves HMAC (no
quedan la IP ni el correo). Probado: el sexto intento devuelve «Demasiados intentos».

**3. CSP con `'unsafe-inline'` en scripts (riesgo bajo, corregido).** La política anterior permitía
scripts en línea, lo que reducía la protección ante una inyección de HTML. Ahora `proxy.ts` genera un
nonce por petición y solo corren los scripts marcados por Next.js (`'strict-dynamic'`); en producción no
hay `'unsafe-eval'`. Se agregó HSTS (2 años), `Cross-Origin-Opener-Policy` y una política que no permite
nada en las rutas `/api`. Verificado en un build de producción: todos los scripts llevan el nonce y no hay
violaciones en la consola.

**4. Inundación del webhook (riesgo bajo, corregido).** Las peticiones sin firma HMAC válida ya se
rechazaban antes de tocar la base. Para mensajes firmados, más de 30 de un mismo número en 5 minutos se
ignoran. La protección contra DDoS de red la da la plataforma de Vercel.

## Verificado sin cambios

- **RLS:** todas las tablas de `public` tienen RLS; `anon` no tiene permisos sobre tablas ni funciones.
  Las tablas del bot (`conversaciones`, `mensajes_*`, `estado_worker`) no tienen políticas: solo el
  servidor las usa. La vista `lista_espera` usa `security_invoker`. Todas las funciones `security definer`
  fijan `search_path`.
- **Campos privilegiados:** los operativos solo pueden actualizar columnas de trabajo (estado, datos
  del paciente, verificación). No pueden cambiar `asignado_a`, roles ni datos del sistema; asignar y
  tomar solicitudes pasa por funciones que validan el rol. Un operativo no ve la cola de otro.
- **Inyección SQL:** todo el acceso a datos usa el cliente de Supabase o funciones con parámetros. No
  hay SQL dinámico con datos del usuario (el único `format()` usa nombres de tabla fijos de la migración).
- **Exposición de datos:** las páginas seleccionan columnas concretas; la clave secreta y los datos
  del bot nunca llegan al navegador. Las únicas variables públicas son la URL de Supabase y la clave
  *publishable*.
- **Secretos:** búsqueda en todo el historial de git de claves de Supabase, JWT, claves privadas,
  contraseñas de base, claves de Kapso y `WORKER_SECRET`: sin resultados. `.gitignore` excluye `.env*`,
  `calibracion/` y los logs; los `.env.example` solo tienen marcadores.
- **Rutas protegidas:** `proxy.ts` exige sesión en todo excepto `/login`, los webhooks firmados y
  `/api/interno` (protegido con `WORKER_SECRET`). Cada página y acción vuelve a verificar el rol.
- **Cookies:** `HttpOnly`, `SameSite=Lax`, `Secure` en producción; cierre por 30 minutos de inactividad.
- **Contraseñas:** las gestiona Supabase Auth (bcrypt); el panel nunca las guarda.
- **CORS:** las rutas `/api` no envían `Access-Control-Allow-Origin`, así que ningún otro dominio puede
  leerlas desde un navegador; los webhooks son llamadas entre servidores. Las acciones del servidor de
  Next.js comprueban el origen.
- **XSS:** no hay `dangerouslySetInnerHTML` ni `innerHTML`; React escapa todo el contenido.
- **Validación:** formularios y endpoints validan longitud, formato y listas permitidas en el servidor,
  y la base repite las validaciones con `check`. No se agregó Zod: ya hay validación estricta y duplicarla
  no reduce el riesgo.
- **Worker:** tipo de archivo por los bytes iniciales (JPEG, PNG o PDF), máximo 15 MB y 15 páginas,
  límite de píxeles y de tiempo de Tesseract, descarga solo por HTTPS desde dominios permitidos. El
  archivo se borra al terminar la lectura (también si falla) y el texto leído no se guarda; solo los
  campos extraídos, que se borran al cerrar la solicitud.
- **Cifrado:** todo el tráfico va por HTTPS/TLS (Vercel, Supabase, Kapso, Meta); Supabase cifra la base
  en reposo.

## Dependencias

- `npm audit --omit=dev`: 0 vulnerabilidades en lo que llega a producción.
- `npm audit` completo: 17 alertas (picomatch, minimatch) en eslint y vitest, herramientas que solo
  corren en desarrollo. Sin versión corregida compatible; se revisan en la próxima actualización.
- `pip-audit` del worker: sin vulnerabilidades conocidas.
- Actualizados: react y react-dom 19.3.1, tailwindcss 4.3.5.

## Recomendaciones pendientes (requieren acción del usuario)

1. Hacer **privado** el repositorio de GitHub (contiene los lineamientos con nombres de profesionales).
2. Supabase: desactivar el registro abierto y activar MFA para los administradores.
3. Rotar la contraseña de la base, la clave secreta de Supabase y la clave de Kapso (pasaron por el chat).
4. Vercel: activar las reglas de firewall o el límite de peticiones del plan para `/api/webhook`.
5. Antes de datos reales: `MODO_SIMULACION=0` y `PERMITIR_FUENTE_LOCAL=0`.
