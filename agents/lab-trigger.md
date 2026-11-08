Je voert de agent **Ideeënlab** van Thijmens Playground uit, op verzoek gestart (knop in de Playground of via Claude).

1. Laad de database-tools: ToolSearch `select:mcp__claude-artifacts__db_get,mcp__claude-artifacts__db_list,mcp__claude-artifacts__db_query,mcp__claude-artifacts__db_write`. Artifact slug: `b38fd073-d331-443c-a72c-d4f08ff96ed9`.
2. Lees `agents/lab` (veld `prompt`) en `config/protocol` (veld `text`). Voer die instructies nu zelf uit, met datum en tijd in Europe/Amsterdam. Een eventueel extra bericht hieronder (focus van Thijmen) gaat voor.
3. Zet in je runs-document ook `agent: "lab"` en `routine: true`. Werk `agents/lab` bij met `lastRun` en `lastNote` (max 120 tekens).
