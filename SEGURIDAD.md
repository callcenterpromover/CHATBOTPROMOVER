# Seguridad y protección de datos

El sistema maneja datos de salud (Ley 1581 de 2012: datos sensibles). Este documento resume los
controles vigentes, lo que falta antes de usar datos reales y qué hacer ante un incidente.

## Qué datos existen y dónde

| Dato | Dónde vive | Cuánto tiempo |
|---|---|---|
| Fotos y PDF de órdenes e historias clínicas | Meta (WhatsApp) y, durante segundos, `worker/tmp` del equipo de la sede | Se borran apenas termina el OCR |
| Texto completo leído por OCR | Solo en memoria del worker | Nunca se guarda ni se registra |
| Campos mínimos de la solicitud (nombre, documento, teléfono, EPS, servicio, estados) | Supabase | Hasta marcar `GESTIONADA`; entonces se borran y se verifica |
| Paso de la conversación del bot | Supabase (`conversaciones`) | Se borra con la solicitud |
| Auditoría (quién cerró o exportó, cuándo) | Supabase (`auditoria`) | Sin datos de pacientes |
| Métricas | Supabase (`metricas_cierre`) | Solo agregados por mes, EPS y servicio |

## Controles implementados

**Acceso**
- Panel con usuario y contraseña (Supabase Auth). Solo ven datos los usuarios de la tabla `operadores`
  (RLS en todas las tablas). El rol anónimo no tiene ningún permiso.
- El operador solo puede modificar las columnas que edita en el panel (permisos por columna).
- La sesión se cierra sola tras 30 minutos sin actividad. Las cookies de sesión son `httpOnly`.
- El simulador solo existe con `MODO_SIMULACION=1` y solo acepta números ficticios (`5730000000xx`).

**Claves**
- La clave secreta de Supabase, el token de Meta y `WORKER_SECRET` solo viven en variables de servidor
  (Vercel) y en `worker/.env` del equipo de la sede. Nunca con prefijo `NEXT_PUBLIC_` ni en git.
- La revisión automática de GitHub busca secretos en todo el historial en cada push.

**Bot y webhook**
- El webhook verifica la firma HMAC de Meta, rechaza cuerpos de más de 512 KB y no procesa dos veces
  el mismo mensaje. El endpoint del worker exige `WORKER_SECRET` (comparación en tiempo constante).
- Máximo 30 documentos por solicitud. No se reciben documentos antes de la autorización del paciente.

**Worker**
- Solo conexiones salientes; no abre puertos.
- Descarga solo desde dominios de Meta por HTTPS y con IDs numéricos; el token nunca va a otro dominio.
- Tipo de archivo por contenido real, límites de tamaño, páginas de PDF, píxeles (imágenes "bomba")
  y tiempo máximo de Tesseract.

**Navegador**
- Política de contenido (CSP) que impide cargar scripts externos o enviar datos a otros dominios,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, sin indexación.
- La búsqueda por nombre o documento se hace en el navegador: no viaja en la URL ni queda en registros.

**Registros (logs)**
- Ningún log contiene nombres, documentos, teléfonos ni texto de mensajes o documentos: solo IDs
  internos, códigos y tiempos.

## Pendiente antes de usar datos reales

- [ ] Repositorio de GitHub **privado**.
- [ ] Supabase: desactivar el registro abierto (Authentication → Sign In / Providers → *Allow new users to sign up*).
- [ ] Regenerar la contraseña de la base (fuerte, 20+ caracteres) y la clave secreta, que pasaron por un chat.
      Actualizar Vercel, `web/.env.local` y `worker/.env`.
- [ ] Contraseñas fuertes y únicas para cada operador; activar MFA si el plan lo permite.
- [ ] `MODO_SIMULACION=0` en Vercel y `PERMITIR_FUENTE_LOCAL=0` en el worker.
- [ ] Decidir la región de la base (hoy EE. UU.; la documentación preveía São Paulo) y reflejarlo en la autorización.
- [ ] Aprobación jurídica de los textos marcados PRELIMINAR y de cómo conservar la prueba de autorización.
- [ ] Equipo de la sede: cuenta de Windows con contraseña, disco cifrado (BitLocker si TI lo permite),
      bloqueo automático de pantalla y `worker\.env` accesible solo para esa cuenta.
- [ ] Vercel: no activar Analytics ni herramientas de terceros que capturen datos del panel.
- [ ] Política para los CSV exportados: guardarlos en una carpeta protegida y borrarlos al final del día.

## Si se filtra una clave o un dato

1. Regenerar de inmediato la clave afectada (Supabase → Settings → API Keys; Meta → token; `WORKER_SECRET`).
2. Actualizar Vercel y el equipo de la sede, y volver a desplegar.
3. Revisar la tabla `auditoria` y los registros de Supabase para ver qué se consultó o exportó.
4. Informar al responsable de protección de datos de PROMOVER: si hubo acceso a datos de pacientes,
   la Ley 1581 obliga a reportar el incidente a la SIC.

## Comprobaciones

- `supabase/tests/auditoria_permisos.sql`: lista permisos, políticas y funciones expuestas (solo lectura).
- `supabase/tests/permisos_y_cierre.sql`: verifica RLS y el borrado al cerrar (no deja cambios).
- `npm --prefix web test` y `python -m pytest` en `worker/` (incluye `tests/test_seguridad.py`).
