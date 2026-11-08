# Registreert "Playground Render": 19:30 plus herkansingen om 22:30, 01:30 en 04:30 (alleen als je pc aan staat;
# gemiste tijden worden ingehaald zodra hij aangaat). Een lege inbox kost niets.
# Eenmalig uitvoeren in PowerShell:  powershell -ExecutionPolicy Bypass -File C:\Users\thijm\my-video\playground\register-task.ps1
$script = "C:\Users\thijm\my-video\playground\run-render.ps1"
$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$triggers = @("19:30", "22:30", "01:30", "04:30") | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName "Playground Render" -Action $action -Trigger $triggers -Settings $settings -Description "Thijmens Playground: rendert goedgekeurde afleveringen en knipt clips, met herkansingen" -Force | Out-Null
Get-ScheduledTask -TaskName "Playground Render" | Select-Object -ExpandProperty Triggers | ForEach-Object { $_.StartBoundary }
Write-Host "Klaar. Hierboven moeten 4 tijden staan (19:30, 22:30, 01:30, 04:30)."
