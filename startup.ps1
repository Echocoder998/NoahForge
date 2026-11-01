$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -TimeoutSec 2 -UseBasicParsing
  if ($response.StatusCode -eq 200) { exit 0 }
} catch { }
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput '.grok/dev-windows.log' -RedirectStandardError '.grok/dev-windows-error.log'
