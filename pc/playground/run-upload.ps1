# Thijmens Playground: YouTube-upload. Gewone Python, kost GEEN Claude-tegoed.
# Gestart door de Taakplanner "Playground Upload" (zie register-upload-task.ps1). Uploadt max 1 video per run,
# ingepland op de eerstvolgende vrije dag om 17:00. Niets klaar = meteen klaar.
$ErrorActionPreference = "Continue"
$project = "C:\Users\thijm\my-video"
$logDir  = "F:\temp\Playground\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("upload-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".log")
Set-Location $project
python playground\youtube_upload.py upload *>&1 | Out-File $log -Encoding utf8
exit $LASTEXITCODE
