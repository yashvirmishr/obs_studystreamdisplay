# Starts the Study Stream 2.0 backend in development mode.
# Usage:  .\scripts\dev-backend.ps1   (from the desktop/ folder)

$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "..\..\backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found. Creating one..."
    Push-Location $backendDir
    python -m venv .venv
    & .venv\Scripts\pip install -r requirements.txt
    Pop-Location
}

Write-Host "Starting Study Stream 2.0 backend on 127.0.0.1:47831 ..."
& $venvPython (Join-Path $backendDir "run_backend.py")
