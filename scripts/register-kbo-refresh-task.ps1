# Registers a Windows Scheduled Task that runs scripts/refresh-kbo-companies.ts
# once a month (day 1 at 03:00 local time by default — KBO publishes a new
# Full export daily, so any day works; once a month keeps the refresh cheap).
# Run this once, as the user who should own the task, from a normal
# PowerShell prompt.
#
# Uses schtasks.exe rather than the ScheduledTasks PowerShell module (the
# approach tenderproc_bosa_scraper/scripts/register_windows_task.ps1 uses
# for its daily trigger): New-ScheduledTaskTrigger has no -Monthly
# parameter set at all (only -Once/-Daily/-Weekly/-AtLogOn/-AtStartup are
# real parameter sets), and hand-building the underlying
# MSFT_TaskMonthlyTrigger CIM object hit an undocumented validation error
# ("Paramètre incorrect" / E_INVALIDARG) that several property-format fixes
# didn't resolve. schtasks /SC MONTHLY works directly, no CIM involved.
#
# schtasks' /TR only accepts a single executable path (no shell operators
# like && survive PowerShell -> schtasks -> cmd's triple layer of argument
# parsing intact), so /TR points at scripts/run-kbo-refresh.cmd, a tiny
# wrapper that cd's into the project directory before running the script.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\register-kbo-refresh-task.ps1

param(
    [string]$TaskName = "TenderProc-KBO-Refresh",
    [int]$DayOfMonth = 1,
    [string]$Time = "03:00"
)

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$WrapperPath = Join-Path $ProjectDir "scripts\run-kbo-refresh.cmd"
if (-not (Test-Path $WrapperPath)) {
    throw "Wrapper script not found: $WrapperPath"
}

schtasks /Create /TN $TaskName /TR $WrapperPath /SC MONTHLY /D $DayOfMonth /ST $Time /F
if ($LASTEXITCODE -ne 0) {
    throw "schtasks /Create failed with exit code $LASTEXITCODE"
}

Write-Host "Registered scheduled task '$TaskName' running on day $DayOfMonth of each month at $Time"
Write-Host "Working directory (via $WrapperPath): $ProjectDir"
Write-Host "To test immediately: schtasks /Run /TN `"$TaskName`""
Write-Host "To view run history: schtasks /Query /TN `"$TaskName`" /V /FO LIST"
