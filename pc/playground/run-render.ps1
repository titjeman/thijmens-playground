# Thijmens Playground: render-job. Start Claude Code headless met PLAYGROUND-RENDER.md.
# Vangnet: draait om 19:30 en herkanst om 22:30, 01:30 en 04:30 (zie register-task.ps1).
# Is de inbox leeg, dan stopt hij meteen (kost niets). Loopt het tegoed op, dan blijft de job in de inbox staan
# en pakt de volgende herkansing hem op (PLAYGROUND-RENDER.md gaat verder waar hij was, via progress.md).
$ErrorActionPreference = "Continue"
$project = "C:\Users\thijm\my-video"
$logDir  = "F:\temp\Playground\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$env:TEMP = "F:\temp\remotion-tmp"; $env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$log = Join-Path $logDir ("render-" + $stamp + ".log")

# 1. niets te doen? meteen klaar
$jobs = Get-ChildItem "F:\temp\Playground\inbox" -Directory | Where-Object { $_.Name -ne "_done" }
if (-not $jobs) { "Geen jobs in de inbox." | Out-File $log -Encoding utf8; exit 0 }

# 2. niet twee keer tegelijk (een lock ouder dan 3 uur is van een vastgelopen run en mag weg)
$lock = Join-Path $logDir "render.lock"
if (Test-Path $lock) {
  if ((Get-Item $lock).LastWriteTime -gt (Get-Date).AddHours(-3)) { "Er draait al een render-job; overgeslagen." | Out-File $log -Encoding utf8; exit 0 }
  Remove-Item $lock -Force
}
$stamp | Out-File $lock -Encoding utf8
try {
  Set-Location $project
  claude -p "Voer PLAYGROUND-RENDER.md uit." --allowedTools "Read,Write,Edit,Glob,Grep,Bash,Skill,Task" *>&1 | Out-File $log -Encoding utf8
  $code = $LASTEXITCODE
} finally {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}

# 3. tegoed op? noteer het; de volgende herkansing gaat verder
$text = Get-Content $log -Raw -ErrorAction SilentlyContinue
if ($text -match "(?i)(usage limit|rate limit|limit reached|limit will reset|out of (usage|credits)|5-hour limit|weekly limit)") {
  $left = (Get-ChildItem "F:\temp\Playground\inbox" -Directory | Where-Object { $_.Name -ne "_done" } | ForEach-Object Name) -join ", "
  "$stamp tegoed-limiet bereikt; herkansing volgt. Nog in de inbox: $left" | Out-File (Join-Path $logDir ("limit-" + $stamp + ".txt")) -Encoding utf8
  exit 2
}
exit $code
