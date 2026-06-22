$ErrorActionPreference = "Stop"

Write-Host "This script creates a Scheduled Task that starts JustShare at logon."
$root = (Resolve-Path ".").Path
$launcher = Join-Path $root "run_justshare.ps1"
if (-not (Test-Path $launcher)) {
    Write-Error "run_justshare.ps1 not found. Run this script from the repository root."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "JustShare" -Action $action -Trigger $trigger -Settings $settings -Description "Start JustShare local sharing server at logon" -Force
Write-Host "Scheduled task 'JustShare' installed."
