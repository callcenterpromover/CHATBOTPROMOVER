# Crea en el escritorio el ícono «OCR PROMOVER», que abre la ventana para encender y apagar el OCR.
# Requisito: haber ejecutado preparar.ps1.
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$pythonw = Join-Path $raiz '.venv\Scripts\pythonw.exe'
if (-not (Test-Path $pythonw)) { throw "Falta el entorno de Python. Ejecuta primero preparar.ps1." }

& (Join-Path $raiz '.venv\Scripts\python.exe') (Join-Path $raiz 'herramientas\crear_icono.py') | Out-Null

$escritorio = [Environment]::GetFolderPath('Desktop')
$acceso = Join-Path $escritorio 'OCR PROMOVER.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($acceso)
$lnk.TargetPath = $pythonw
$lnk.Arguments = '"' + (Join-Path $raiz 'control_ocr.pyw') + '"'
$lnk.WorkingDirectory = $raiz
$lnk.IconLocation = (Join-Path $raiz 'recursos\ocr.ico') + ',0'
$lnk.Description = 'Encender o apagar el lector de documentos (OCR) de PROMOVER'
$lnk.Save()
"Ícono creado en el escritorio: $acceso"
