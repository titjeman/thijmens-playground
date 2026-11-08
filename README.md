# Thijmens Playground

Een 3D-dorp van zwevende eilanden waar AI-agents (Claude) werk voorbereiden om geld te verdienen. Thijmen keurt goed; de agents leren van zijn feedback.

## Mappen
- `site/` — de Playground-pagina (Claude-artifact): `index.html` + `js/world.js` (three.js-wereld).
- `agents/` — de instructies van elke agent (bron van waarheid staat in de database `agents/<id>`; dit is de back-up), het gedeelde protocol en de ploeg-prompts.
- `pc/` — wat op de Windows-pc draait: render-instructies, clip-pijplijn (`clipper.py`) en de Taakplanner-scripts.
- `reports/` — onderzoeksrapporten (bouwvolgorde, idee-uitwerkingen).

## Dagschema
| Tijd | Taak | Wat |
|---|---|---|
| 07:42 | Ochtendploeg | research, video-script, clip-jobs, lespakketten (tegelijk als subagents) |
| 12:47 | Middagploeg | controle-toren + per dag studio, leads, marketing, werkplaats, GitHub-verkenner |
| 18:47 | Sync met pc | goedgekeurde jobs naar `F:\temp\Playground\inbox`, resultaten terug |
| 19:30 | Pc (Taakplanner) | render-video's en clips knippen met lokale Claude Code |
| za 13:17 | Ideeënlab | nieuwe verdienmodellen (ook via de knop) |

Geen geheimen (API-sleutels, wachtwoorden) in deze repo of in de database.
