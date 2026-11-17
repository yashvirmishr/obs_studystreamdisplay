# Reproducible sidecar build entry point for the Tauri desktop shell.
#
# Runs the backend PyInstaller build, then places a target-triple-named copy
# of the exe next to the plain one:
#
#   backend\dist\studystream-backend.exe
#   backend\dist\studystream-backend-<target-triple>.exe
#
# The triple-named copy is what Tauri 2 `externalBin` expects on disk: for
# externalBin: ["binaries/studystream-backend"] the file must literally be
# named binaries/studystream-backend-x86_64-pc-windows-msvc.exe at bundle
# time. Keep the reference path in tauri.conf.json pointing at wherever this
# script's -SidecarDir output lives (see backend/packaging/README.md).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File desktop\scripts\build-backend-sidecar.ps1
#   ... -TargetTriple aarch64-pc-windows-msvc   (override for ARM builds)

param(
    [string]$TargetTriple = "x86_64-pc-windows-msvc",
    # Where the triple-named copy is written. Defaults to backend\dist;
    # pass desktop\src-tauri\binaries once the sidecar wiring lands.
    [string]$SidecarDir = ""
)

$ErrorActionPreference = "Stop"

$desktopScriptsDir = $PSScriptRoot
$repoRoot = Split-Path (Split-Path $desktopScriptsDir -Parent) -Parent
$backendDir = Join-Path $repoRoot "backend"

if (-not $SidecarDir) {
    $SidecarDir = Join-Path $backendDir "dist"
}

# Build the exe (cleans dist/ and build/ itself, verifies the output exists).
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $backendDir "build_backend.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Error "backend build failed (exit $LASTEXITCODE)"
}

$sourceExe = Join-Path (Join-Path $backendDir "dist") "studystream-backend.exe"
if (-not (Test-Path $sourceExe)) {
    Write-Error "Built exe not found at $sourceExe"
}

New-Item -ItemType Directory -Force -Path $SidecarDir | Out-Null
$sidecarExe = Join-Path $SidecarDir "studystream-backend-$TargetTriple.exe"

# Copy with OneDrive-lock tolerance. Files under OneDrive-synced paths can be
# held by the sync filter (ReparsePoint) with no owning process; overwrite/
# delete then fail with "Access denied" for minutes at a time. Strategy:
#   1. plain copy (normal case),
#   2. retry loop (transient AV/sync handles release),
#   3. directory swap: rename binaries\ aside, recreate it, copy fresh.
# The swapped-aside directory is renamed *-DELETE-ME for manual cleanup.
$copySucceeded = $false
foreach ($attempt in 1..4) {
    try {
        Copy-Item -Force $sourceExe $sidecarExe -ErrorAction Stop
        $copySucceeded = $true
        break
    } catch {
        Write-Warning "copy attempt $attempt failed: $($_.Exception.Message.Split("`n")[0])"
        Start-Sleep -Seconds 6
    }
}
if (-not $copySucceeded) {
    $parent = Split-Path $SidecarDir -Parent
    $name = Split-Path $SidecarDir -Leaf
    $aside = Join-Path $parent "$name-stale-DELETE-ME"
    Write-Warning "falling back to directory swap: $aside"
    Rename-Item $SidecarDir "$name-stale-DELETE-ME" -ErrorAction Stop
    New-Item -ItemType Directory -Force -Path $SidecarDir | Out-Null
    Copy-Item -Force $sourceExe $sidecarExe
    Write-Warning "Old locked directory kept at $aside - delete it once OneDrive releases the files."
}

$sizeMB = [math]::Round((Get-Item $sidecarExe).Length / 1MB, 1)
Write-Host ""
Write-Host "Sidecar ready: $sidecarExe ($sizeMB MB)"
Write-Host ("Tauri externalBin entry: externalBin = [""binaries/studystream-backend""] " +
    "with this file placed as binaries/studystream-backend-$TargetTriple.exe " +
    "relative to src-tauri.")
