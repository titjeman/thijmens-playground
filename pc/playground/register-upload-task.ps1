# Registreert "Playground Upload": 08:15 en 13:15 (gemiste tijden worden ingehaald zodra de pc aangaat).
# De render van de avond ervoor is dan klaar; de video gaat ingepland op 17:00 dezelfde dag.
# Eenmalig uitvoeren in PowerShell:  powershell -ExecutionPolicy Bypass -File C:\Users\thijm\my-video\playground\register-upload-task.ps1
$script = "C:\Users\thijm\my-video\playground\run-upload.ps1"
$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$triggers = @("08:15", "13:15") | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "Playground Upload" -Action $action -Trigger $triggers -Settings $settings -Description "Thijmens Playground: zet klare shorts ingepland op YouTube (geen Claude-tegoed)" -Force | Out-Null
Get-ScheduledTask -TaskName "Playground Upload" | Select-Object -ExpandProperty Triggers | ForEach-Object { $_.StartBoundary }
Write-Host "Klaar. Hierboven moeten 2 tijden staan (08:15 en 13:15)."
