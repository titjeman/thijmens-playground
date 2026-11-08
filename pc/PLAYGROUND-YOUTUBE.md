# Thijmens Playground: YouTube-upload instellen

Kost **geen Claude-tegoed**: `playground/youtube_upload.py` is gewone Python die de officiële YouTube Data API v3 gebruikt.
Geheimen staan alleen in `F:\temp\Playground\secrets\` (nooit in de repo of database).

**Hoe het loopt:** render 's avonds → Taakplanner "Playground Upload" om 08:15/13:15 → oudste klare video gaat als *privé*
naar YouTube, ingepland op de eerstvolgende vrije dag om **17:00** (Amsterdam). Tot 17:00 kun je hem in YouTube Studio bekijken
of tegenhouden. De schone docentenversie gaat mee als *niet-openbaar* (link voor het Scholen-eiland). Resultaat komt in
`youtube.json` én in `done.json` (veld `youtube`), zodat de Sync het terugbrengt naar de Playground.

Tegenhouden vóór upload: zet een leeg bestand `skip-upload.txt` in `F:\temp\Playground\videos\<code>\`.

## Eenmalige setup (± 20 min)
1. **Google Cloud-project** op https://console.cloud.google.com (log in met het account van het YouTube-kanaal):
   - Nieuw project "Thijmens Playground" → *APIs & Services → Library* → **YouTube Data API v3** → Enable.
   - *OAuth consent screen* (Google Auth Platform): type **External**, app-naam "Thijmens Playground", jouw e-mail. Voeg jezelf toe als test user.
   - **Belangrijk:** zet de app daarna op **In production** (Publish app). In "Testing" verloopt je login elke 7 dagen en stopt de upload stilletjes. Het scherm "Google heeft deze app niet geverifieerd" is bij eigen gebruik normaal: klik *Geavanceerd → doorgaan*.
   - *Credentials → Create credentials → OAuth client ID* → type **Desktop app** → Download JSON.
   - Sla dat bestand op als `F:\temp\Playground\secrets\client_secret.json`.
2. **Pakketten** (klein, mag op C:): `pip install google-api-python-client google-auth-oauthlib tzdata`
3. **Inloggen:** `cd C:\Users\thijm\my-video` en `python playground\youtube_upload.py auth`
   - Controle: de browser opent, je kiest het kanaal-account, en in de terminal staat `OK: ingelogd als kanaal '<jouw kanaal>'`.
4. **Proef zonder uploaden:** `python playground\youtube_upload.py status` en daarna `python playground\youtube_upload.py upload --dry-run`
   - Controle: per video zie je `klaar` of een reden; bij dry-run de titel, tags en `publiceert: <dag> 17:00`.
5. **Eerste echte upload met de hand:** `python playground\youtube_upload.py upload`
   - Controle: regel `OK: https://youtube.com/shorts/...`. Open YouTube Studio → Content: de video staat er als *Ingepland*.
   - Staat er `LET OP: publishAt is weg`: Google heeft hem vergrendeld op privé omdat je project niet geaudit is. Zet hem dan zelf
     op *Openbaar* in Studio (1 klik), of vraag de gratis audit aan (formulier "YouTube API Services – Audit and Quota Extension").
6. **Automatisch maken:** `powershell -ExecutionPolicy Bypass -File C:\Users\thijm\my-video\playground\register-upload-task.ps1`
   - Controle: er staan 2 tijden (08:15 en 13:15). Logs: `F:\temp\Playground\logs\upload-*.log`.

## Als er iets misgaat
- `F:\temp\Playground\logs\youtube-auth-needed.txt` bestaat → login verlopen: herhaal stap 3.
- `upload_error.txt` in een videomap → bijv. geen YouTube-titel gevonden of een vloek in de platformtekst. Herstel `platform-texts.md`, verwijder `upload_error.txt`; de volgende run pakt hem op.
- Quotum: standaard 100 uploads per dag per project, ruim genoeg. Bij "quota" stopt hij en gaat de volgende dag verder.
- Andere publicatietijd: `upload --publish-time 19:00`. Meteen openbaar: `upload --now`.
