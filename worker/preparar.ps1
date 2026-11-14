# Prepara el worker en un equipo nuevo: entorno de Python, dependencias e idioma español de Tesseract.
# Requisitos previos: Python 3.12 y Tesseract OCR instalados.
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
if (-not (Test-Path $py)) { $py = 'python' }

if (-not (Test-Path "$raiz\.venv")) { & $py -m venv "$raiz\.venv" }
& "$raiz\.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
& "$raiz\.venv\Scripts\python.exe" -m pip install --quiet -r "$raiz\requirements.txt"

# Datos de idioma: español (descarga oficial de tesseract-ocr) y detección de orientación.
New-Item -ItemType Directory -Force "$raiz\tessdata" | Out-Null
if (-not (Test-Path "$raiz\tessdata\spa.traineddata")) {
  Invoke-WebRequest -UseBasicParsing `
    -Uri 'https://github.com/tesseract-ocr/tessdata/raw/4.1.0/spa.traineddata' `
    -OutFile "$raiz\tessdata\spa.traineddata"
}
$osd = 'C:\Program Files\Tesseract-OCR\tessdata\osd.traineddata'
if ((Test-Path $osd) -and -not (Test-Path "$raiz\tessdata\osd.traineddata")) {
  Copy-Item $osd "$raiz\tessdata\osd.traineddata"
}

New-Item -ItemType Directory -Force "$raiz\tmp", "$raiz\entrada" | Out-Null
"Listo. Copia .env.example como .env y completa la clave secreta."
