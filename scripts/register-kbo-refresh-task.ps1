# Registers a Windows Scheduled Task that runs scripts/refresh-kbo-companies.ts
# once a month (day 1 at 03:00 local time by default — KBO publishes a new
# Full export daily, so any day works; once a month keeps the refresh cheap).
# Run this once, as the user who should own the task, from a normal
# PowerShell prompt. Mirrors the precedent set by
# tenderproc_bosa_scraper/scripts/register_windows_task.ps1.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\register-kbo-refresh-task.ps1

param(
    [string]$TaskName = "TenderProc-KBO-Refresh",
    [string]$NpxExe = (Get-Command npx).Source,
    [int]$DayOfMonth = 1,
    [string]$Time = "03:00"
)

$ProjectDir = Split-Path -Parent $PSScriptRoot
$Action = New-ScheduledTaskAction -Execute $NpxExe `
    -Argument "tsx scripts/refresh-kbo-companies.ts" `
    -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger -Monthly -At $Time -DaysOfMonth $DayOfMonth

$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Monthly refresh of kbo_companies from KBO Open Data (TenderProc signup company search)." `
    -Force

Write-Host "Registered scheduled task '$TaskName' running on day $DayOfMonth of each month at $Time"
Write-Host "Working directory: $ProjectDir"
Write-Host "To test immediately: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "To view run history: Get-ScheduledTaskInfo -TaskName '$TaskName'"
