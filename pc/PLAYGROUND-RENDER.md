# Thijmens Playground: dagelijkse render-job (seriemodus)

Wordt elke avond automatisch gestart door `playground/run-render.ps1`. Je mag hem ook met de hand starten met:
"Voer PLAYGROUND-RENDER.md uit."

Je werkt in `C:\Users\thijm\my-video` met de skill `cartoon-3d-short`. Lees PLAYGROUND-BIBLE.md. Daar staan de vaste stem,
The Keeper en de regels. **Seriemodus** betekent: de look is al vastgelegd in `src/videos/_series/template/` en
`src/videos/_series/keeper.ts`. Je verandert nooit iets aan lights.ts, shade.ts, ink.ts, lensblur.ts, grade.ts,
cardshade.ts, Bridge.tsx of keeper.ts. Per aflevering schrijf je alleen story.ts, cast.ts (rollen), build.ts (de set) en
de geluidstijdlijn. Sla de look-match-loop en de sandbox-agents uit de skill over (die zijn alleen voor look-ontwikkeling).
Zo blijft elke aflevering hetzelfde en blijft het tegoedverbruik laag.

## Twee soorten jobs
- Map met `job.json` = **video-job** (hieronder, maximaal 1 per run).
- Map met `clipjob.json` = **clip-job**: voer daarvoor `PLAYGROUND-CLIPS.md` uit (maximaal 2 per run, ná de video-job).

## Per video-job in `F:\temp\Playground\inbox\<code>\` (oudste eerst, maximaal 1 per run)
Een job bevat `job.json`, `SCRIPT.md`, `episode.md` (shotplan, cast, world, sound cues) en `platform-texts.md`.
1. Zet in elke render-shell `$env:TEMP="F:\temp\remotion-tmp"; $env:TMP=$env:TEMP`.
2. Stem: `playground/voice.py` met de tekst uit SCRIPT.md → `F:\temp\Playground\work\<code>\voice.wav` + `words.json`.
   Controleer de woordtijden kort en herstel duidelijke fouten.
3. Kopieer `src/videos/_series/template/` naar `src/videos/ep_<code>/`. Schrijf story.ts (SHOTS/CAMS/DOF timed op words.json),
   cast.ts-rollen en build.ts-set volgens episode.md. The Keeper komt uit keeper.ts in de hook en het einde.
   Registreer compositie `Ep<YYYYMMDD>` in src/Root.tsx. Controle: `npx tsc --noEmit` is schoon.
4. Stills: `node scripts/bridge-stills.mjs` op 3 momenten (hook, snap, einde) op 0.5. Bekijk ze zelf.
   Herstel alleen echte fouten (lege beelden, camera in een gebouw, onleesbare props, zie "Readability traps" in de skill).
5. Geluid: de skill-audio-scripts in `playground/audio/` → `mix.wav` (muziek +3 dB, SFX -6 dB, stem ongewijzigd, ~-14 LUFS),
   inclusief de Keeper-thump aan het eind.
6. Render: `npx remotion render src/index.ts Ep<YYYYMMDD> F:/temp/Playground/work/<code>/video.mp4 --codec h264 --crf 16 --scale 1.3333333333333333 --gl=angle --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"`,
   dan muxen met mix.wav (`-map 0:v:0 -map 1:a:0`) → `F:\temp\Playground\videos\<code>\final.mp4`.
7. QA: `python scripts/short_qa.py final.mp4 ...` Bij fouten: herstel en render opnieuw (maximaal 1 keer).
8. Lever op in `F:\temp\Playground\videos\<code>\`:
   - `final.mp4` (1440x2560): dit upload je naar de platforms,
   - `preview.mp4`: `ffmpeg -i final.mp4 -vf scale=720:1280 -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 96k preview.mp4` (moet < 18 MB zijn, anders crf 30),
   - `cover.jpg` (een sterk frame, 1080x1920),
   - `platform-texts.md` (kopie uit de job),
   - **Schone versie voor docenten** (zelfde beeld; elke vloek is uit de zin geknipt en de rest van die zin een paar procent opgerekt, zodat alles synchroon blijft):
     1. Zorg dat `stem_voice.wav`, `stem_music.wav` en `stem_sfx.wav` (op mixgain, zoals `warp_mix.py` ze schrijft) en `words.json` in `F:\temp\Playground\work\<code>\` staan.
     2. `python playground/audio/clean_mix.py F:\temp\Playground\work\<code>` → `mix_clean.wav` + `clean_report.json`.
        Controle: het aantal `replaced` in clean_report.json is gelijk aan het aantal keer "fucking" in SCRIPT.md, elke `sentences[].applied` ≤ 1.12, `lufs` ≈ -14 en `true_peak` ≤ -1. Luister de zinnen uit `sentences` kort na in final_clean.mp4.
     3. `ffmpeg -i final.mp4 -i F:/temp/Playground/work/<code>/mix_clean.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k final_clean.mp4`
     4. `preview_clean.mp4`: zoals preview.mp4 maar van final_clean.mp4 (< 18 MB).
   - `done.json`: `{"id": "<outputs-id uit job.json>", "code": "<code>", "seconds": <duur>, "renderedAt": "<ISO>", "qa": "ok|<probleem>", "voice": "<stem>", "clean": {"file": "final_clean.mp4", "preview": "preview_clean.mp4", "replaced": <aantal>}}` (lukt de schone versie niet: `"clean": null` en de reden in `qa`).
9. Verplaats de job-map naar `F:\temp\Playground\inbox\_done\<code>\` en ruim `F:\temp\remotion-tmp\remotion-webpack-bundle-*` op (vraag het als verwijderen niet mag).

## Onderbroken? Zo ga je verder
Een render-job kan halverwege stoppen (tegoed op, pc uit). Daarom:
- Schrijf na elke afgeronde stap één regel in `F:\temp\Playground\work\<code>\progress.md` (bijv. "2 stem klaar", "3 project klaar, tsc ok", "6 final.mp4 klaar").
- Een job blijft in de inbox tot stap 9, dus de volgende run pakt hem vanzelf weer op. Lees dan eerst `progress.md` en ga verder bij de eerste stap die nog niet klaar is (voice.wav, words.json, ep_<code> en video.mp4 die al bestaan hergebruik je).
- Stop een job na 3 mislukte runs: zet `error.txt` met de reden in `F:\temp\Playground\videos\<code>\` en verplaats de job naar `inbox\_done\`.

Lukt iets niet: schrijf `F:\temp\Playground\videos\<code>\error.txt` met wat er misging en stop. Niet gokken, en geen look-waarden veranderen.
Eindig met 3 regels per job: welke job, resultaat, duur.
