Param(
  [int]$Port = 5173,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

function Get-PythonCmd {
  if (Get-Command py -ErrorAction SilentlyContinue) { return 'py' }
  if (Get-Command python -ErrorAction SilentlyContinue) { return 'python' }
  throw 'Python was not found. Please install Python.'
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $ScriptRoot '.venv'
$VenvPython = Join-Path $VenvPath 'Scripts/python.exe'

try {
  Push-Location $ScriptRoot

  $py = Get-PythonCmd

  if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating venv: $VenvPath"
    & $py -m venv $VenvPath
  }

  if (-not (Test-Path $VenvPython)) {
    throw "venv python not found: $VenvPython"
  }

  $url = "http://localhost:$Port/"
  Write-Host "Starting local server: $url"
  if (-not $NoOpen) { Start-Process $url | Out-Null }

  Write-Host 'Press Ctrl+C to stop.'
  & $VenvPython -m http.server $Port
}
finally {
  Pop-Location
}

