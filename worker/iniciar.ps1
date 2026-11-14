# Arranca el worker de OCR y lo deja corriendo. Cerrar la ventana o Ctrl+C lo detiene.
# Requiere haber ejecutado preparar.ps1 y tener worker\.env completo.
Set-Location $PSScriptRoot
& "$PSScriptRoot\.venv\Scripts\python.exe" -m promover_worker.main
