# Thijmens Playground: dagelijkse render. Start Claude Code headless met PLAYGROUND-RENDER.md.
$ErrorActionPreference = "Continue"
$project = "C:\Users\thijm\my-video"
$logDir  = "F:\temp\Playground\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$env:TEMP = "F:\temp\remotion-tmp"; $env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$jobs = Get-ChildItem "F:\temp\Playground\inbox" -Directory | Where-Object { $_.Name -ne "_done" }
$log = Join-Path $logDir ("render-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".log")
if (-not $jobs) { "Geen jobs in de inbox." | Out-File $log; exit 0 }
Set-Location $project
claude -p "Voer PLAYGROUND-RENDER.md uit." --allowedTools "Read,Write,Edit,Glob,Grep,Bash,Skill,Task" *>&1 | Out-File $log -Encoding utf8
