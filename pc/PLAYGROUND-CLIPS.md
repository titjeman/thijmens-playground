# Thijmens Playground: clip-jobs (Clipjagers-eiland)

Wordt aangeroepen vanuit PLAYGROUND-RENDER.md voor elke map in `F:\temp\Playground\inbox\` met een `clipjob.json`.
Je werkt in `C:\Users\thijm\my-video`. Zet in elke shell `$env:TEMP="F:\temp\remotion-tmp"; $env:TMP=$env:TEMP`.
**Harde regel: we maken nooit zelf content.** Geen eigen beelden, animaties, AI-video of AI-stemmen. Clipjagers *knipt alleen highlights uit een bestaande, lange video of stream* (minimaal 15 minuten; `clipper.py` weigert kortere bronnen). Wat je wél mag toevoegen om de clip beter te maken: ondertitels, een korte hook-tekst bovenin, een punch-in zoom op het hoogtepunt (`zoomAt`), en later korte geluidseffecten. De inhoud zelf blijft altijd 100% uit de bron.

Doel: uit lange streams/video's waarvoor we **toestemming** hebben (een betaalde clipping-campagne of een maker die clippen expliciet toestaat) 3-6 sterke verticale clips maken die Thijmen kan posten en indienen.

## clipjob.json
`{"id": "<outputs-id>", "code": "<code>", "clipsWanted": 4, "maxSeconds": 59, "campaign": {"name", "url", "ratePer1k", "rules"}, "sources": [{"url": "...", "start": "01:10:00", "end": "02:10:00", "label": "<maker>", "layout": "gameplay|facecam-top", "facecam": {"x":0.75,"y":0.05,"w":0.22,"h":0.3}}], "notes": "..."}`
(`facecam` = waar de webcam in beeld staat, als fractie van breedte/hoogte. Weet je het niet: na stap 2 een frame bekijken.)

## Stappen (schrijf na elke stap een regel in `F:\temp\Playground\work\<code>\progress.md`)
1. Eenmalig: `python -m pip show yt-dlp` — ontbreekt het: `python -m pip install -U yt-dlp`. Werkt een download niet, eerst `python -m pip install -U yt-dlp` (sites veranderen vaak).
2. `python playground/clipper.py prepare F:\temp\Playground\inbox\<code>` → downloadt de stukken (max 90 min per bron), maakt `words<i>.json` en `candidates.json` in `F:\temp\Playground\work\<code>\`.
   Staat de facecam-positie niet in de job en is de layout facecam-top: haal een frame uit `src0.mp4` (`ffmpeg -ss 120 -i src0.mp4 -frames:v 1 f.jpg`), bekijk hem en vul de positie in clipjob.json in.
3. **Kies de momenten zelf.** Lees `candidates.json` (top 15 op volume/spraak) en de transcripten rond die momenten. Kies `clipsWanted` momenten die op zichzelf staan: een duidelijke opbouw en een payoff (reactie, chaos, grap) binnen 15-59 s. Begin 1-3 s vóór de opbouw, eindig vlak na de payoff. Volg de campagneregels (`campaign.rules`), en sla over: gekopieerde radio-/muziekstukken (claims), spoilers van verhaalmomenten als de campagne dat verbiedt, alles wat iemand belachelijk maakt om uiterlijk of afkomst.
   Schrijf `F:\temp\Playground\work\<code>\cuts.json`: `[{"source": 0, "start": <s>, "end": <s>, "zoomAt": <s, optioneel: moment van de payoff voor een korte punch-in zoom>, "hook": "<max 6 woorden, Engels, boven in beeld>", "caption": "<Engels, 1 zin + call to action>", "hashtags": ["#gta6", ...]}]`.
4. `python playground/clipper.py cut F:\temp\Playground\inbox\<code>` → `clip-01.mp4` … plus `preview-XX.mp4` en `done.json` in `F:\temp\Playground\videos\<code>\`.
5. Bekijk van elke clip 1 frame (`ffmpeg -ss 2 -i clip-01.mp4 -frames:v 1 chk.jpg`): ondertitels leesbaar, geen zwarte balken, facecam goed uitgesneden. Herstel en knip opnieuw (max 1 keer).
6. Verplaats de job-map naar `F:\temp\Playground\inbox\_done\<code>\`. Verwijder in `work\<code>\` de `src*.mp4` en `src*.wav` (grote bestanden; vraag het als verwijderen niet mag).

Onderbroken? Lees `progress.md` en ga verder bij de eerste stap die niet klaar is (bestaande downloads en transcripten worden hergebruikt).
Lukt het niet: `F:\temp\Playground\videos\<code>\error.txt` met de reden, job naar `_done`. Eindig met 2 regels: welke job, hoeveel clips.
