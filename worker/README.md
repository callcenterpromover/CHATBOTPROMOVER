# Worker de OCR

Proceso que corre en el equipo de la sede. Toma documentos de la cola (`trabajos_ocr`), los descarga
directo desde Meta, los lee con Tesseract **uno a la vez**, aplica las reglas y guarda solo los campos
mínimos. El archivo se borra apenas termina la lectura; el texto leído nunca se guarda ni se registra.

Solo hace conexiones salientes (Supabase y Meta). No abre puertos.

## Instalar en un equipo nuevo

1. Instalar Python 3.12 y Tesseract OCR (en el equipo de la sede lo debe autorizar TI).
2. `powershell -ExecutionPolicy Bypass -File preparar.ps1` (entorno, dependencias e idioma español).
3. Copiar `.env.example` como `.env` y completar la clave secreta de Supabase.
4. Probar a mano: `powershell -ExecutionPolicy Bypass -File iniciar.ps1` (Ctrl+C para detener).
5. **Control manual con ícono** (lo instalado en el PC de desarrollo):
   `powershell -ExecutionPolicy Bypass -File crear-acceso-directo.ps1` crea en el escritorio el ícono
   **OCR PROMOVER**. Al abrirlo aparece una ventana con un botón para encender o apagar el OCR.
   Cerrar la ventana no lo apaga: sigue en segundo plano. El apagado es ordenado (termina el documento
   en curso) y nunca corren dos a la vez. Tras reiniciar el equipo queda apagado hasta volver a encenderlo.
   No combinarlo con la tarea programada del paso siguiente (la tarea lo volvería a encender).
   Dejarlo permanente sin intervención: `powershell -ExecutionPolicy Bypass -File instalar-servicio.ps1`.
   - Como administrador crea la tarea programada «PROMOVER Worker OCR»: arranca al encender el equipo,
     aunque nadie inicie sesión, y se reinicia sola si se detiene.
   - Sin administrador crea un acceso directo en Inicio (arranca al iniciar sesión).
   - Para quitarlo: `desinstalar-servicio.ps1`.
6. Verificar en el **Dashboard** del panel: «Lector de documentos (OCR): funcionando». El worker envía
   una señal cada minuto. El registro queda en `worker\logs\worker.log` (sin datos de pacientes).

## Probar sin WhatsApp (documentos ficticios)

Con `PERMITIR_FUENTE_LOCAL=1` en `.env`:

```powershell
.\.venv\Scripts\python.exe herramientas\generar_documentos.py   # crea worker\entrada\*
.\.venv\Scripts\python.exe herramientas\probar_ocr.py           # lee sin tocar la base
.\.venv\Scripts\python.exe herramientas\simular.py --nombre "Laura Prueba Veinte (ficticio)" --documento 1000000020 --servicio "Terapia física integral" orden_clara.png historia_p1de3.png
.\.venv\Scripts\python.exe -m promover_worker.main --una-vez    # procesa la cola y termina
.\.venv\Scripts\python.exe -m pytest -q                         # pruebas de reglas
```

En operación real `PERMITIR_FUENTE_LOCAL` debe ser `0`.

## Qué hace con cada documento

| Situación | Resultado |
|---|---|
| Legible | Extrae campos, los compara con lo que escribió el paciente y actualiza estados. |
| Dato que no coincide | Marca `DISCREPANCIA` y crea una alerta. **No elige ni corrige.** |
| Borroso o cortado | `REENVIO_REQUERIDO` + alerta; no extrae nada. |
| Archivo dañado, protegido o no admitido | `REENVIO_REQUERIDO` + alerta. |
| Historia «Página X de Y» con páginas faltantes | `POSIBLEMENTE_INCOMPLETA` + alerta. |
| Fecha de vencimiento dudosa | Confianza baja + alerta; no declara vencida ni vigente. |
| Orden genérica | Clasificación de baja confianza; se orienta con la historia si esta es clara. |
| Fallo técnico (red, etc.) | Reintenta hasta 3 veces; luego queda en `ERROR`. |
| La solicitud se cerró mientras se procesaba | Se descarta todo. |
| Revisión humana marcada como completada | No se cambia la clasificación ni el estado. |

## Pendiente antes del piloto real

- Calibrar los umbrales de legibilidad (`ocr.py`) y los patrones de extracción (`extraccion.py`) con
  fotos reales **anonimizadas** de órdenes y autorizaciones de Salud Total y SOS. Hoy solo están
  probados con documentos ficticios generados por computador.
- Probar la descarga desde Meta con el token real (Fase 3).
- Registrar el worker como tarea que arranca sola al encender el equipo.
