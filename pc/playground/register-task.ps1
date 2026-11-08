# Registreert "Playground Render": elke dag om 19:30 de render-job (alleen als je pc aan staat).
$script = "C:\Users\thijm\my-video\playground\run-render.ps1"
$action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At 19:30
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName "Playground Render" -Action $action -Trigger $trigger -Settings $settings -Description "Thijmens Playground: rendert goedgekeurde afleveringen" -Force
Write-Host "Klaar. Test nu met: Start-ScheduledTask -TaskName 'Playground Render'"
