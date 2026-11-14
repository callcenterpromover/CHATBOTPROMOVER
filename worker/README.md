# Worker de OCR

Proceso que corre en el equipo de la sede. Toma documentos de la cola (`trabajos_ocr`), los descarga
directo desde Meta, los lee con Tesseract **uno a la vez**, aplica las reglas y guarda solo los campos
mínimos. El archivo se borra apenas termina la lectura; el texto leído nunca se guarda ni se registra.

Solo hace conexiones salientes (Supabase y Meta). No abre puertos.

## Instalar en un equipo nuevo

1. Instalar Python 3.12 y Tesseract OCR (en el equipo de la sede lo debe autorizar TI).
2. `powershell -ExecutionPolicy Bypass -File preparar.ps1` (entorno, dependencias e idioma español).
3. Copiar `.env.example` como `.env` y completar la clave secreta de Supabase.
4. `powershell -ExecutionPolicy Bypass -File iniciar.ps1`

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
