# Builds the Study Stream 2.0 backend PyInstaller sidecar.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File backend\build_backend.ps1
#
# Does NOT activate the venv — calls .venv\Scripts\pyinstaller.exe directly.

$ErrorActionPreference = "Stop"

$backendDir = $PSScriptRoot
$specPath = Join-Path $backendDir "studystream.spec"
$pyinstaller = Join-Path $backendDir ".venv\Scripts\pyinstaller.exe"
$distDir = Join-Path $backendDir "dist"
$buildDir = Join-Path $backendDir "build"
$exePath = Join-Path $distDir "studystream-backend.exe"

if (-not (Test-Path $pyinstaller)) {
    Write-Error ("PyInstaller not found at {0}. Install it with: " +
        "backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt") -f $pyinstaller
}

# Clean previous output so the exe we verify is always from this build.
foreach ($dir in @($distDir, $buildDir)) {
    if (Test-Path $dir) {
        Remove-Item -Recurse -Force $dir
    }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $pyinstaller $specPath --noconfirm --distpath $distDir --workpath $buildDir
if ($LASTEXITCODE -ne 0) {
    Write-Error "PyInstaller failed with exit code $LASTEXITCODE"
}
$sw.Stop()

if (-not (Test-Path $exePath)) {
    Write-Error "Expected sidecar exe was not produced: $exePath"
}

$sizeMB = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
Write-Host ""
Write-Host "Build OK in $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s"
Write-Host "Sidecar exe: $exePath ($sizeMB MB)"
