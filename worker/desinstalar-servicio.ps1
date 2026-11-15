# Detiene el worker de OCR y quita su arranque automático (tarea programada o acceso directo).
$nombre = 'PROMOVER Worker OCR'

if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
  "Tarea programada eliminada."
}
$acceso = Join-Path ([Environment]::GetFolderPath('Startup')) "$nombre.lnk"
if (Test-Path $acceso) { Remove-Item $acceso -Confirm:$false; "Acceso directo de Inicio eliminado." }

Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" |
  Where-Object { $_.CommandLine -like '*promover_worker.main*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "Worker detenido (PID $($_.ProcessId))." }
