$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $python) {
    Write-Error "Python 3 is required but was not found."
}

if (-not (Test-Path ".venv")) {
    if ($python.Name -eq "py.exe") {
        & $python.Source -3 -m venv .venv
    } else {
        & $python.Source -m venv .venv
    }
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $venvPython -m pip install -r requirements.txt

$storage = if ($env:JUSTSHARE_STORAGE_DIR) { $env:JUSTSHARE_STORAGE_DIR } else { ".\data" }
New-Item -ItemType Directory -Force -Path $storage | Out-Null
New-Item -ItemType Directory -Force -Path ".\logs" | Out-Null

$port = if ($env:JUSTSHARE_PORT) { $env:JUSTSHARE_PORT } else { "8787" }
$hostName = if ($env:JUSTSHARE_HOST) { $env:JUSTSHARE_HOST } else { "0.0.0.0" }
$lanIp = (& $venvPython -c "import socket; ips=[i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET) if not i[4][0].startswith('127.')]; print(ips[0] if ips else '')").Trim()

Write-Host ""
Write-Host "JustShare is running."
Write-Host ""
Write-Host "Local access:"
Write-Host "http://localhost:$port"
Write-Host ""
if ($lanIp) {
    Write-Host "LAN access:"
    Write-Host "http://$lanIp`:$port"
    Write-Host ""
} else {
    Write-Host "LAN access:"
    Write-Host "Could not detect automatically. Use this machine's LAN IP with port $port."
    Write-Host ""
}
Write-Host "Storage:"
Write-Host $storage
Write-Host ""
Write-Host "Use only on trusted local networks. Press CTRL+C to stop."
Write-Host ""

$env:JUSTSHARE_HOST = $hostName
$env:JUSTSHARE_PORT = $port
& $venvPython -m justshare
