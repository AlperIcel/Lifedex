# LifeDex — Privacy Policy / Datenschutzerklärung

> **Status:** Draft prepared for Play Store submission. Written to match the
> actual behaviour of the app as of this version (v1, single-player — see
> `STATUS.md`). Placeholders that the app owner must fill in before publishing
> are marked **[PLACEHOLDER]**.
>
> This file contains the complete policy in **English** first, then the
> complete policy in **Deutsch**. Both describe the same practices; if the two
> ever disagree, the English version governs.
>
> **Suggested hosting:** publish this as a single static page (e.g. a GitHub
> Pages page, a Notion public page, or a simple page on your own domain) and
> put that URL into the Play Console's "Privacy policy" field. Plain text/
> Markdown rendered as a web page is sufficient — no special format required.

---

## English

**Last updated:** [PLACEHOLDER — set to the date you publish this page, e.g. "28 July 2026"]
**Contact:** alperfayke@gmail.com

### 1. Who this is

LifeDex is developed and operated by an independent developer, not a
registered company. For any privacy question, request, or concern, contact
**alperfayke@gmail.com**. This person is the "data controller" (in GDPR terms)
for the data described below.

### 2. What LifeDex is

LifeDex is a mobile app for identifying real animals, plants, trees, and
mushrooms from a photo you take. You take a live photo, the app identifies the
species, and you get a collectible card with facts about it. This version of
LifeDex is **single-player**: there is no account system, no public feed, and
nothing you capture is shown to other users.

### 3. Data that stays on your device

| Data | Why | Where it lives |
|---|---|---|
| The original photo you take | To detect the species and generate your card | Stored only on your device (`file://` camera storage). To identify the species it is sent to the recognition service(s) in §4; it is never stored on a LifeDex server and never shown to other users. |
| Your collection (species found, cards, XP, rarity, timestamps) | So your progress survives closing/restarting the app | Local device storage only (`AsyncStorage`) |
| A **fuzzed**, approximate location per sighting | To show roughly where you found something, and to power the "already found nearby" check | Local device storage only. **The precise GPS coordinate is read once, used in memory to compute the fuzzed value, and is discarded — it is never written to storage, on-device or otherwise.** |
| App settings (units, haptics on/off, language) | Your preferences | Local device storage only |

We (the developer) never see any of this. We operate no server that stores your
photos, your collection, or your location. The only time your photo leaves the
device is the species-recognition request described in §4 (to third-party
services, optionally via a relay that just forwards it) — and even then it is
not stored by us.

### 4. Data sent to other services, and why

To identify a species, your photo has to be analyzed somewhere — a phone alone
can't reliably tell a fern from a similar-looking species. LifeDex sends the
**photo only** to one or more specialized recognition services. None of these
calls include your location, your name, an account ID (there are no
accounts), or any other data about you — just the image.

| Service | Used for | What is sent | What is never sent |
|---|---|---|---|
| **iNaturalist** (Computer Vision API, run by iNaturalist.org) | Identifying animals, fungi, and (as a first pass) plants | The photo | Location, device ID, personal data |
| **Pl@ntNet** (identify API, run by the Pl@ntNet research consortium) | A second opinion specifically for plant identification, used when it's more confident than the first pass | The photo | Location, device ID, personal data |
| **Google Cloud Vision** (Google Ireland Ltd. / Google LLC) | (a) Checking a photo for faces, people, or license plates **before** anything is saved, so those never end up in your collection or on a card; (b) as a fallback for species recognition in some app configurations | The photo | Location, device ID, personal data |

Because content moderation has to inspect the photo to know whether it
contains a face or license plate, that check necessarily happens on the raw
photo before any decision is made. If a photo is rejected by this check
(because it shows a person, a face, or a plate), it is discarded immediately —
it is not saved, not added to your collection, and not sent anywhere else.

Depending on how the app is configured, this photo upload may go through a
relay server operated by the LifeDex developer (to keep API credentials off
the device) rather than reaching the recognition service directly. This does
not change what is sent or who ultimately processes it — it only changes the
network path.

These services are independent providers with their own privacy practices.
They process the photo on our behalf to answer "what species is this," and we
ask them to handle it accordingly; we don't control their internal systems, so
we encourage you to review their own privacy information if you'd like more
detail (inaturalist.org, plantnet.org, and Google's privacy policy at
policies.google.com, respectively).

**When none of these services are configured or reachable, LifeDex falls back
to an offline, simulated identification so the app still works — no photo
leaves the device in that case.**

### 5. Species facts (Wikipedia) and rarity (iNaturalist)

The background information shown about a species (its "About" section) is
fetched from Wikipedia's public API. Only the species' common or scientific
name is sent — for example "Boston fern" — never your photo, your location, or
anything else about you. This is cached on your device so the same species
isn't looked up twice.

How rare a find is scored partly from how often that species has been recorded
worldwide. LifeDex reads that number from iNaturalist's public catalogue. The
request contains **one number: the species' catalogue ID** (for example
`taxa/48662`) — no photo, no location, no device or user identifier, and no
login. It says "how common is species 48662," and nothing about who is asking.
It is cached on your device, is refreshed at most about once a month, and is
entirely optional: if it fails or you are offline, the app scores the find with
a simpler estimate instead. It never delays or blocks a capture.

### 6. Location

LifeDex asks for location permission to:
- show roughly how far away a sighting was, and
- avoid crediting the same species twice if you photograph it again in the
  same spot within about a kilometer (so you're encouraged to explore rather
  than photograph the same backyard bird ten times).

The **exact** coordinate from your device's GPS is used for a moment, in
memory, to calculate an intentionally imprecise value, and then it is gone —
it is not written to storage and not sent to any server (not ours, not any
recognition provider's). What's actually kept (locally, on your device only)
is a deliberately fuzzed location:

| Species sensitivity | Approximate precision shown/stored | Notes |
|---|---|---|
| Common species | ~175 m | A general neighbourhood-level area |
| Common wildlife | ~500 m | A rough area |
| Rare species | ~2,000 m | City-district level only |
| Protected / endangered species | ~10,000 m, and the exact spot is hidden entirely | No pin at all — only a wide shaded circle, even for you |

This version of LifeDex does not publish sightings anywhere, so this fuzzed
location is only ever shown back to you, inside your own app — it is not
shared with other people or services.

### 7. No accounts, no public sharing, in this version

- There is no sign-up, login, username/password, email verification, or
  social login anywhere in this version of the app.
- There is no public feed, shared map, or leaderboard showing your discoveries
  to other users. Everything you capture stays in your own local collection.
- LifeDex's code includes an optional backend connection (Supabase) intended
  for a future community feature. **In this version it is switched off by
  default: no account or session is created, and no sighting, photo, or
  location is ever transmitted to it.** If a future update turns this on, this
  policy will be updated first, and the update will describe exactly what
  becomes shared and how it can be turned off.

### 8. What LifeDex does not do

- No advertising, and no advertising SDKs of any kind.
- No analytics, tracking, or crash-reporting SDKs are included in this
  version. If that changes in a future update (for example, to add crash
  diagnostics), this policy will be updated to disclose it before that update
  ships.
- No selling, renting, or trading of your data — we don't have a copy of it
  to begin with.
- No gallery/photo-library import — only a photo taken live, in the app, with
  the camera, can become a sighting.

### 9. How long data is kept, and how to delete or export it

Your data lives on your device for as long as you keep the app installed, or
until you remove it yourself. In **Settings → Privacy & data** you can, at any
time:
- **Export my data** — creates a JSON copy of your profile and captures (with
  the private photo reference removed) and opens your device's normal share
  sheet so you can save or send it wherever you like. Nothing is uploaded by
  this action — it is a local file handed to your own device's share menu.
- **Delete all my data** — immediately and irreversibly clears your local
  collection, profile, and streak data from the device, and returns you to the
  first-run screen. If a backend connection happens to be configured, this
  also removes any rows tied to your device's session and signs that session
  out — but in the current default configuration (see §7) there is nothing
  there to remove.
- Uninstalling the app also removes everything, since all of it lives in the
  app's local storage.

There is no separate account to close and no separate deletion request to
file by email — deleting your data in Settings **is** the complete deletion
process for this version of the app.

### 10. Your rights

Because LifeDex (in this version) does not transmit your photos, collection,
or location to us, most data-subject rights (access, correction, deletion,
portability) are things you can already exercise directly, instantly, and
without asking us, using the Export and Delete options in §9. If you still
have a question about your rights under GDPR, UK GDPR, CCPA/CPRA, or another
privacy law that applies to you, contact **alperfayke@gmail.com** and we'll
help. If you're in the EU/EEA, you also have the right to lodge a complaint
with your local data protection authority.

### 11. Children

LifeDex is not directed at children and doesn't knowingly collect personal
information from anyone. There is no account creation, so we have no way to
know a user's age, and we don't ask for it. If you believe a child has
submitted a photo that shows personal information and would like it removed
from a recognition provider's systems, contact us at
**alperfayke@gmail.com** and we will help direct that request; on-device data
can be deleted instantly at any time via §9 regardless of age.

### 12. Security

Your photos and collection are protected the same way as any other app data
on your device (your OS's app sandbox); there is no separate encryption layer
on top of that. Network requests to the recognition services described in §4
use HTTPS. No API keys or credentials are stored in a readable form inside
this policy or the app's public listing.

### 13. Changes to this policy

If how LifeDex handles data changes — for example, if the community feature
mentioned in §7 is ever switched on, or a crash-reporting tool is added — we
will update this page and change the "Last updated" date at the top before
that change ships in an update.

### 14. Contact

Questions, requests, or concerns about privacy: **alperfayke@gmail.com**

---
---

## Deutsch

**Zuletzt aktualisiert:** [PLATZHALTER — Datum der Veröffentlichung eintragen, z. B. „28. Juli 2026"]
**Kontakt:** alperfayke@gmail.com

### 1. Wer das hier betreibt

LifeDex wird von einem unabhängigen Entwickler betrieben, nicht von einer
eingetragenen Firma. Bei Fragen, Anliegen oder Anfragen zum Datenschutz
erreichst du uns unter **alperfayke@gmail.com**. Diese Person ist im Sinne der
DSGVO der „Verantwortliche" für die unten beschriebenen Daten.

### 2. Was LifeDex ist

LifeDex ist eine App, mit der du echte Tiere, Pflanzen, Bäume und Pilze anhand
eines Fotos bestimmen kannst. Du machst ein Live-Foto, die App erkennt die Art,
und du bekommst eine Sammelkarte mit Fakten dazu. Diese Version von LifeDex ist
**Singleplayer**: Es gibt kein Konto-System, keinen öffentlichen Feed, und
nichts, was du fängst, wird anderen Nutzer:innen gezeigt.

### 3. Daten, die auf deinem Gerät bleiben

| Daten | Wofür | Wo sie liegen |
|---|---|---|
| Das Originalfoto, das du aufnimmst | Um die Art zu erkennen und deine Karte zu erstellen | Nur auf deinem Gerät gespeichert (Kamera-Speicher, `file://`). Zur Artbestimmung wird es an die Erkennungsdienste aus §4 gesendet; es wird nie auf einem LifeDex-Server gespeichert und nie anderen Nutzern gezeigt. |
| Deine Sammlung (gefundene Arten, Karten, XP, Seltenheit, Zeitstempel) | Damit dein Fortschritt einen Neustart der App übersteht | Nur lokaler Gerätespeicher (`AsyncStorage`) |
| Ein **unscharf gemachter**, ungefährer Standort pro Fund | Um grob zu zeigen, wo du etwas gefunden hast, und für die „schon in der Nähe gefunden"-Prüfung | Nur lokaler Gerätespeicher. **Die genaue GPS-Koordinate wird einmal kurz im Arbeitsspeicher gelesen, um daraus den unscharfen Wert zu berechnen, und danach verworfen — sie wird nie gespeichert, weder lokal noch anderswo.** |
| App-Einstellungen (Einheiten, Haptik an/aus, Sprache) | Deine Präferenzen | Nur lokaler Gerätespeicher |

Wir (der Entwickler) bekommen nichts davon zu sehen. Wir betreiben keinen Server,
der deine Fotos, deine Sammlung oder deinen Standort speichert. Dein Foto
verlässt das Gerät nur für die Arterkennung aus §4 (an Drittdienste, optional
über einen Relay-Server, der es nur weiterleitet) — und auch dann wird es nicht
von uns gespeichert.

### 4. Daten, die an andere Dienste gesendet werden, und warum

Um eine Art zu bestimmen, muss dein Foto irgendwo analysiert werden — ein
Smartphone allein kann einen Farn nicht zuverlässig von einer ähnlichen Art
unterscheiden. LifeDex sendet **ausschließlich das Foto** an ein oder mehrere
spezialisierte Erkennungsdienste. Keiner dieser Aufrufe enthält deinen
Standort, deinen Namen, eine Konto-ID (es gibt keine Konten) oder sonstige
Daten über dich — nur das Bild.

| Dienst | Wofür genutzt | Was gesendet wird | Was nie gesendet wird |
|---|---|---|---|
| **iNaturalist** (Computer Vision API, betrieben von iNaturalist.org) | Erkennung von Tieren, Pilzen und (als erster Versuch) Pflanzen | Das Foto | Standort, Geräte-ID, persönliche Daten |
| **Pl@ntNet** (Identify-API, betrieben vom Pl@ntNet-Forschungskonsortium) | Eine zweite Meinung speziell zur Pflanzenbestimmung, genutzt wenn sie sicherer ist als der erste Versuch | Das Foto | Standort, Geräte-ID, persönliche Daten |
| **Google Cloud Vision** (Google Ireland Ltd. / Google LLC) | (a) Prüfung eines Fotos auf Gesichter, Personen oder Kennzeichen, **bevor** irgendetwas gespeichert wird, damit so etwas nie in deiner Sammlung oder auf einer Karte landet; (b) in manchen App-Konfigurationen als Ausweich-Lösung zur Arterkennung | Das Foto | Standort, Geräte-ID, persönliche Daten |

Da die Inhaltsprüfung das Foto ansehen muss, um zu wissen, ob ein Gesicht oder
Kennzeichen zu sehen ist, passiert diese Prüfung zwangsläufig am unbearbeiteten
Foto, bevor irgendeine Entscheidung getroffen wird. Wird ein Foto durch diese
Prüfung abgelehnt (weil eine Person, ein Gesicht oder ein Kennzeichen zu sehen
ist), wird es sofort verworfen — es wird nicht gespeichert, nicht deiner
Sammlung hinzugefügt und nicht anderweitig weitergeleitet.

Je nach Konfiguration der App kann dieser Foto-Upload über einen Relay-Server
des LifeDex-Entwicklers laufen (damit API-Zugangsdaten nicht auf dem Gerät
liegen), statt den Erkennungsdienst direkt zu erreichen. Das ändert nichts
daran, was gesendet wird oder wer es am Ende verarbeitet — nur den
Netzwerkweg.

Diese Dienste sind eigenständige Anbieter mit eigenen Datenschutzpraktiken.
Sie verarbeiten das Foto in unserem Auftrag, um die Frage „welche Art ist
das" zu beantworten (**Auftragsverarbeiter**); wir kontrollieren ihre internen
Systeme nicht und empfehlen dir, bei Bedarf deren eigene Datenschutzhinweise
zu lesen (inaturalist.org, plantnet.org, sowie Googles Datenschutzerklärung
unter policies.google.com).

**Wenn keiner dieser Dienste konfiguriert oder erreichbar ist, weicht LifeDex
auf eine simulierte Offline-Erkennung aus, damit die App trotzdem
funktioniert — in diesem Fall verlässt kein Foto das Gerät.**

### 5. Artenwissen (Wikipedia) und Seltenheit (iNaturalist)

Die Hintergrundinformationen zu einer Art (der „Über"-Abschnitt) werden über
die öffentliche API von Wikipedia abgerufen. Gesendet wird ausschließlich der
deutsche/wissenschaftliche oder gebräuchliche Artname — zum Beispiel „Boston-
Schwertfarn" — nie dein Foto, dein Standort oder sonst etwas über dich. Das
Ergebnis wird auf deinem Gerät zwischengespeichert, damit dieselbe Art nicht
zweimal abgefragt wird.

Wie selten ein Fund ist, ergibt sich unter anderem daraus, wie oft diese Art
weltweit dokumentiert wurde. LifeDex liest diese Zahl aus dem öffentlichen
Artenkatalog von iNaturalist. Die Anfrage enthält **eine einzige Zahl: die
Katalog-ID der Art** (zum Beispiel `taxa/48662`) — kein Foto, keinen Standort,
keine Geräte- oder Nutzerkennung und keinen Login. Sie fragt „wie häufig ist
Art 48662" und sagt nichts darüber aus, wer fragt. Sie wird auf deinem Gerät
zwischengespeichert, höchstens etwa monatlich aufgefrischt und ist vollständig
optional: schlägt sie fehl oder bist du offline, bewertet die App den Fund mit
einer einfacheren Schätzung. Ein Fang wird dadurch nie verzögert oder
verhindert.

### 6. Standort

LifeDex fragt nach der Standort-Berechtigung, um:
- ungefähr anzuzeigen, wie weit ein Fund entfernt war, und
- zu verhindern, dass dieselbe Art zweimal gutgeschrieben wird, wenn du sie am
  selben Ort (im Umkreis von etwa einem Kilometer) erneut fotografierst — so
  wirst du eher zum Erkunden ermuntert, statt denselben Gartenvogel zehnmal zu
  fotografieren.

Die **genaue** Koordinate von deinem GPS wird kurz im Arbeitsspeicher genutzt,
um daraus einen bewusst ungenauen Wert zu berechnen, und ist dann weg — sie
wird nicht gespeichert und an keinen Server gesendet (weder an uns noch an
einen Erkennungsdienst). Tatsächlich aufbewahrt wird (nur lokal, auf deinem
Gerät) ein bewusst unscharf gemachter Standort:

| Empfindlichkeit der Art | Ungefähre Genauigkeit (angezeigt/gespeichert) | Hinweis |
|---|---|---|
| Häufige Art | ~175 m | Ungefähr stadtteilgenau |
| Häufige Wildtiere | ~500 m | Grober Bereich |
| Seltene Art | ~2.000 m | Nur stadtbezirksgenau |
| Geschützte / gefährdete Art | ~10.000 m, und der genaue Ort wird komplett ausgeblendet | Keine Nadel — nur ein breiter, schattierter Kreis, auch für dich selbst |

Diese Version von LifeDex veröffentlicht Funde nirgendwo, daher wird dieser
unscharfe Standort ausschließlich dir selbst, innerhalb deiner eigenen App,
angezeigt — er wird nicht mit anderen Personen oder Diensten geteilt.

### 7. Keine Konten, kein öffentliches Teilen — in dieser Version

- Es gibt in dieser Version keine Registrierung, keinen Login, keinen
  Benutzernamen/Passwort, keine E-Mail-Bestätigung und keinen Social-Login.
- Es gibt keinen öffentlichen Feed, keine geteilte Karte und keine
  Bestenliste, die deine Funde anderen Nutzer:innen zeigt. Alles, was du
  fängst, bleibt in deiner eigenen, lokalen Sammlung.
- Der Code von LifeDex enthält eine optionale Backend-Anbindung (Supabase) für
  ein mögliches zukünftiges Community-Feature. **In dieser Version ist sie
  standardmäßig ausgeschaltet: Es wird kein Konto oder Sitzung erstellt, und
  kein Fund, Foto oder Standort wird jemals dorthin übertragen.** Sollte ein
  zukünftiges Update das aktivieren, wird diese Datenschutzerklärung vorher
  aktualisiert und beschreibt dann genau, was geteilt wird und wie du das
  abschalten kannst.

### 8. Was LifeDex nicht tut

- Keine Werbung und keinerlei Werbe-SDKs.
- Keine Analyse-, Tracking- oder Absturzbericht-SDKs sind in dieser Version
  enthalten. Sollte sich das in einem zukünftigen Update ändern (z. B. um
  Absturzdiagnosen zu ergänzen), wird diese Erklärung vorher aktualisiert, um
  das offenzulegen.
- Kein Verkauf, keine Vermietung, kein Tausch deiner Daten — wir haben davon
  ohnehin keine Kopie.
- Kein Import aus der Fotogalerie — nur ein Foto, das live in der App mit der
  Kamera aufgenommen wird, kann zu einem Fund werden.

### 9. Wie lange Daten aufbewahrt werden, und wie du sie löschst oder exportierst

Deine Daten bleiben auf deinem Gerät, solange du die App installiert lässt,
oder bis du sie selbst entfernst. Unter **Einstellungen → Privatsphäre &
Daten** kannst du jederzeit:
- **Daten exportieren** — erstellt eine JSON-Kopie deines Profils und deiner
  Funde (ohne den privaten Foto-Verweis) und öffnet das normale Teilen-Menü
  deines Geräts, damit du sie speichern oder verschicken kannst, wohin du
  willst. Dabei wird nichts hochgeladen — es ist eine lokale Datei, die an das
  Teilen-Menü deines eigenen Geräts übergeben wird.
- **Alle meine Daten löschen** — löscht sofort und unwiderruflich deine
  lokale Sammlung, dein Profil und deine Serien-Daten vom Gerät und bringt
  dich zurück zum Erst-Start-Bildschirm. Falls zufällig eine Backend-Anbindung
  konfiguriert ist, werden dabei auch alle mit der Sitzung deines Geräts
  verknüpften Zeilen entfernt und die Sitzung abgemeldet — in der aktuellen
  Standardkonfiguration (siehe Abschnitt 7) gibt es dort aber nichts zu
  entfernen.
- Auch das Deinstallieren der App entfernt alles, da sämtliche Daten im
  lokalen Speicher der App liegen.

Es gibt kein separates Konto, das gekündigt werden müsste, und keinen
gesonderten Löschantrag per E-Mail — das Löschen deiner Daten in den
Einstellungen **ist** der vollständige Löschvorgang für diese Version der App.

### 10. Deine Rechte

Da LifeDex (in dieser Version) deine Fotos, deine Sammlung oder deinen
Standort nicht an uns überträgt, kannst du die meisten Betroffenenrechte
(Auskunft, Berichtigung, Löschung, Datenübertragbarkeit) bereits direkt,
sofort und ohne uns zu fragen über die Export- und Löschen-Funktionen in
Abschnitt 9 wahrnehmen. Solltest du dennoch eine Frage zu deinen Rechten nach
der DSGVO, der UK-GDPR, dem CCPA/CPRA oder einem anderen für dich geltenden
Datenschutzgesetz haben, wende dich an **alperfayke@gmail.com** — wir helfen
dir. Innerhalb der EU/des EWR hast du außerdem das Recht, dich bei deiner
zuständigen Datenschutzaufsichtsbehörde zu beschweren.

### 11. Kinder

LifeDex richtet sich nicht gezielt an Kinder und sammelt wissentlich keine
persönlichen Daten von irgendjemandem. Da es keine Kontoerstellung gibt,
haben wir keine Möglichkeit, das Alter einer Person zu kennen, und fragen
auch nicht danach. Solltest du glauben, dass ein Kind ein Foto mit
persönlichen Informationen eingereicht hat, und möchtest, dass es aus den
Systemen eines Erkennungsdienstes entfernt wird, kontaktiere uns unter
**alperfayke@gmail.com** — wir helfen, das weiterzuleiten; lokal gespeicherte
Daten kannst du unabhängig vom Alter jederzeit sofort über Abschnitt 9 löschen.

### 12. Sicherheit

Deine Fotos und deine Sammlung sind so geschützt wie jede andere App auf
deinem Gerät (Sandbox deines Betriebssystems); es gibt keine zusätzliche
Verschlüsselungsebene obendrauf. Netzwerkanfragen an die in Abschnitt 4
beschriebenen Erkennungsdienste laufen über HTTPS. In dieser Erklärung oder
im öffentlichen Store-Eintrag der App sind keine API-Schlüssel oder
Zugangsdaten im Klartext enthalten.

### 13. Änderungen dieser Erklärung

Wenn sich ändert, wie LifeDex mit Daten umgeht — zum Beispiel, falls das in
Abschnitt 7 erwähnte Community-Feature jemals aktiviert wird, oder ein
Absturzbericht-Tool hinzukommt —, aktualisieren wir diese Seite und das
Datum „Zuletzt aktualisiert" oben, bevor diese Änderung mit einem Update
ausgeliefert wird.

### 14. Kontakt

Fragen, Anfragen oder Anliegen zum Datenschutz: **alperfayke@gmail.com**

---

## Owner notes (not part of the published policy)

- **Fill in the two "Last updated" placeholders** (§ header of each language)
  with the actual publish date before hosting this page.
- **Host it somewhere public** and put that URL into Play Console → Policy →
  App content → Privacy policy, and into the Data safety section.
- **Verify the processor characterization before relying on it legally.** This
  policy calls iNaturalist, Pl@ntNet, and Google Cloud Vision data processors
  acting on our behalf (per the task brief). That's accurate to how the code
  calls them (photo in, species/moderation result out, no independent use by
  us) — but whether each of these providers' own terms of service treat
  themselves as a GDPR Art. 28 processor or as an independent controller
  (e.g. if they reserve the right to use submitted images to improve their own
  models) is worth confirming against their current ToS, and formalizing with
  a DPA if you want a belt-and-suspenders posture. None of this changes what
  the app actually sends (photo only, no location/identity) — only the legal
  label.
- **If Sentry, analytics, or ads are added later** (Sentry is on the roadmap
  per `STATUS.md` step 6), §8/§13 (EN) and §8/§13 (DE) must be updated *before*
  that release ships, and the Play "Data safety" form must be revised to match.
- **If `features.communitySharing` is ever flipped to `true`** (v1.1+), §7 in
  both languages needs a rewrite describing exactly what becomes public
  (fuzzed location, processed card image, category/rarity) — the groundwork
  for that language is already sketched in `SECURITY_AND_PRIVACY.md` §2–§4 if
  that day comes.
