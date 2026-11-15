# Deja el worker de OCR funcionando de forma permanente en este equipo.
#
# - Con permisos de administrador: crea la tarea programada "PROMOVER Worker OCR" que arranca al
#   encender el equipo (aunque nadie inicie sesión) y se reinicia sola si se detiene.
# - Sin permisos de administrador: crea un acceso directo en Inicio, que arranca al iniciar sesión.
#
# Requisitos: haber ejecutado preparar.ps1 y tener worker\.env completo.
# Para quitarlo: desinstalar-servicio.ps1
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$pythonw = Join-Path $raiz '.venv\Scripts\pythonw.exe'
$nombre = 'PROMOVER Worker OCR'

if (-not (Test-Path $pythonw)) { throw "Falta el entorno de Python. Ejecuta primero preparar.ps1." }
if (-not (Test-Path (Join-Path $raiz '.env'))) { throw "Falta worker\.env. Copia .env.example como .env y complétalo." }

# Revisión rápida de la configuración (sin mostrar valores).
$env_ = Get-Content (Join-Path $raiz '.env') | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' }
$conf = @{}; foreach ($l in $env_) { $k, $v = $l -split '=', 2; $conf[$k.Trim()] = $v.Trim() }
foreach ($k in 'SUPABASE_URL', 'SUPABASE_SECRET_KEY') { if (-not $conf[$k]) { throw "Falta $k en worker\.env" } }
if ($conf['PANEL_URL'] -like '*localhost*') { Write-Warning "PANEL_URL apunta a localhost: los avisos al paciente solo funcionarán con el panel local." }
if ($conf['PERMITIR_FUENTE_LOCAL'] -eq '1') { Write-Warning "PERMITIR_FUENTE_LOCAL=1 (modo de pruebas). Con pacientes reales debe ser 0." }

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)

if ($esAdmin) {
  $accion = New-ScheduledTaskAction -Execute $pythonw -Argument '-m promover_worker.main' -WorkingDirectory $raiz
  $disparador = New-ScheduledTaskTrigger -AtStartup
  $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
  $usuario = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited
  Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -Settings $ajustes -Principal $usuario `
    -Description 'Lee los documentos de la lista de espera de PROMOVER con OCR local.' -Force | Out-Null
  Start-ScheduledTask -TaskName $nombre
  "Tarea programada '$nombre' creada e iniciada. Arranca sola al encender el equipo."
} else {
  $inicio = [Environment]::GetFolderPath('Startup')
  $acceso = Join-Path $inicio "$nombre.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($acceso)
  $lnk.TargetPath = $pythonw
  $lnk.Arguments = '-m promover_worker.main'
  $lnk.WorkingDirectory = $raiz
  $lnk.WindowStyle = 7
  $lnk.Save()
  if (-not (Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" | Where-Object { $_.CommandLine -like '*promover_worker.main*' })) {
    Start-Process -FilePath $pythonw -ArgumentList '-m promover_worker.main' -WorkingDirectory $raiz -WindowStyle Hidden
  }
  "Acceso directo creado en Inicio y worker iniciado. Arranca al iniciar sesión en Windows."
  "Para que arranque sin iniciar sesión, ejecuta este script como administrador."
}
"Registro: $raiz\logs\worker.log  ·  Estado visible en el Dashboard del panel."
