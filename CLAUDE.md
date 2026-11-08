# Thijmens Playground — overdracht voor een nieuwe chat

Lees dit eerst; dan hoef je het lange oorspronkelijke gesprek niet. Antwoord in het Nederlands, eindig altijd met de volgende stap, en geef bij technische stappen concrete controles (wat Thijmen moet zien).

## Wat het is
Een 3D-dorp van zwevende eilanden (Claude-artifact) waarin AI-agents werk voorbereiden om geld te verdienen. Thijmen keurt goed; na 10 goedkeuringen op rij mag een eiland autonoom. Hij zit op **Claude Pro** (max 5 geplande runs/dag, één gedeelde pot tegoed met zijn chats) en is krap bij kas.

- Artifact: slug `b38fd073-d331-443c-a72c-d4f08ff96ed9` (https://claude.ai/artifact/PB39oQMH6L7bTy67zC1QBA). Bron: `site/index.html` + `site/js/world.js` (three.js 0.160).
- Database (artifact-db): `agents/<id>` (prompt, model, shift, days, talents — **bron van waarheid** voor agent-instructies), `config/protocol`, `config/roadmap` (lijst "Volgende stappen"), `islands/<id>`, `outputs/<id>`, `runs/<id>`, `expansions/<id>`, `series/bible`.
- Eilanden: tower, research, video, clips, school, studio, marketing (Reclamebureau), workshop (+ afdeling Verkenners), lab; ecom en trading zijn dicht.

## Geplande taken (Claude Code Remote)
| Taak | id | Wanneer | Wat |
|---|---|---|---|
| Ochtendploeg | trig_01Ca7ZJdv8QKpv4rnoSULykZ | 07:42 | research, video, clips, school als parallelle subagents |
| Middagploeg | trig_01WQ4Ku4vq7omSUbYyKxS5Y4 | 12:47 | tower + per dag studio/sales/growth/workshop/scout; haalt mislukte ochtend in |
| Sync met pc | trig_019jW6ez7MX7fbmsFYF9VGDi | 18:47 | jobs naar `F:\temp\Playground\inbox`, resultaten terug (vereist zijn pc; prompt-wijziging moet hij goedkeuren) |
| Ideeënlab | trig_01WXcAuYF8nfBM9cnDPFHP4G | za 13:17 + knop | nieuwe verdienmodellen |
| (uit) Video-studio, Werkplaats | trig_01VdRapCWJhdmymXGcNA43qR, trig_017AdbQ9wFXWv1mNTpkzGBEC | — | opgegaan in de ploegen |

Ploegleiders loggen per agent tokens/duur in `runs/ploeg-*` (`usage`), zichtbaar in de Playground onder "Verbruik".

## Pc (Windows, C: bijna vol, grote dingen op F:)
- `C:\Users\thijm\my-video` (skill cartoon-3d-short, Remotion). `PLAYGROUND-RENDER.md` (video-jobs, seriemodus, schone versie) en `PLAYGROUND-CLIPS.md` (clip-jobs).
- Taakplanner "Playground Render": 19:30 + herkansingen 22:30/01:30/04:30 → `playground/run-render.ps1` → `claude -p`.
- `playground/clipper.py` (yt-dlp, faster-whisper, 9:16, ondertitels, hook, punch-in zoom), `playground/audio/clean_mix.py` (schone versie: vloeken eruit knippen, zin opgerekt ≤12%), `playground/voice.py` (Kokoro bm_george).
- Uitvoer: `F:\temp\Playground\videos\<code>\` (final.mp4, final_clean.mp4, preview*.mp4, done.json). Device-bridge: alleen stage/commit (device_bash werkt niet: te weinig schijfruimte).

## Harde regels
- Geen geheimen in database of repo (API-sleutels blijven op de pc).
- Clipjagers knipt **alleen** highlights uit bestaande lange video's/streams (≥15 min) met toestemming (campagne); nooit zelf content maken. Geen gok/crypto/18+ campagnes.
- Shorts-serie: Engels, vaste stijl en The Keeper, "fucking" 2-4× als stijlmiddel (nooit in titels/tags); docentenversie zonder vloeken.
- Berry's (badparels) staat los van de Playground. Geen trading-advies.
- Werkplaats mag de Sync-taak niet aanpassen, geen taken verwijderen, geen duurder model zonder akkoord, max 5 runs/dag.

## Status (8 nov 2026)
Gebouwd: ploegen, 13 agents met talenten (zichtbaar als poppetjes), verbruikspagina, volgende-stappen-lijst, schone versie, clip-pijplijn (testjob NASA in de inbox). GTA 6 verschijnt 19 nov.
Volgende: YouTube-upload automatiseren (officiële API, sleutel op pc) → views automatisch ophalen → geluidseffecten (CC0) voor clips → ElevenLabs → TikTok/Instagram.
