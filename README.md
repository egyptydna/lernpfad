# Lernpfad 1.3

Eine tatsächlich arbeitende KI-Lernplattform: private Konten, dauerhaft gespeicherte Originaldateien, gemeinsame Kurse aus mehreren Dokumenten, dokumentbasierter Tutor, zwölf Aufgabenkategorien, fünf Lernphasen, adaptive Folgeaufgaben, Prüfungen, Wiederholung, XP und Statistiken.

## Lernen mit deinem bestehenden ChatGPT-Abo, ohne API-Schlüssel

Version 1.3 enthält einen manuellen Dateiweg. Er verbindet diesen Chat nicht automatisch mit der Website.

1. In der Plattform anmelden und Unterlagen hochladen. Bei normalen Text-PDFs, TXT, DOCX und PPTX wird der Text auch ohne KI-Zugang ausgelesen. Der Status „Text bereit · Kurs ausstehend“ reicht für den Export.
2. Unter **Meine Dokumente → Mit ChatGPT lernen – ohne API-Schlüssel** die Unterlagen und einen Seitenbereich auswählen. Auf **1. Lernauftrag exportieren** tippen.
3. Die heruntergeladene Datei `ChatGPT-Lernauftrag.json` hier in ChatGPT anhängen und schreiben: **„Bitte erstelle daraus die angeforderte Kursdatei.“** Die Datei enthält den ausgewählten Text, die Quellenkennungen und das erforderliche Ausgabeformat. Es werden keine Passwörter, Antworten, Lernstatistiken oder Chatverläufe exportiert.
4. Die von ChatGPT erzeugte Datei `lernpfad-kurs.json` herunterladen. In der Plattform auf **2. Fertige Kursdatei importieren** tippen und die Datei auswählen.
5. Erklärungen und die importierten objektiven Aufgaben lernen. Ihre Bewertung, XP und Speicherung benötigen keinen API-Zugang. Der identische Kurs wird beim erneuten Import nicht doppelt angelegt.

Die Nutzung hier in ChatGPT unterliegt deinem bestehenden Abo und dessen Grenzen. Der Dateiweg löst selbst keine KI-API-Anfragen aus. Das Importieren prüft Quellen gegen deine gespeicherten Unterlagen und weist fremde Dokumente, unbelegbare Zitate, doppelte Fragen und unpassende Antwortoptionen ab. Eine inhaltliche Fehlerfreiheit von ChatGPT-Ausgaben kann diese formale Prüfung nicht garantieren.

Unterstützte automatische Aufgabenbewertungen für diesen Weg: Single-/Multiple-Choice, Richtig/Falsch, Lückentexte, Zuordnungen, Verbindungen und Reihenfolgen. Tutor-Chat auf der Website, automatisch neue Aufgaben, semantische Freitextbewertungen und OCR benötigen weiterhin einen eingerichteten KI-Zugang. Bilder und Scan-PDFs ohne vollständig ausgelesenen Text werden nicht stillschweigend als gelesene Unterlagen exportiert.

Die vorgeschlagene automatische ChatGPT-Sites-/Plugin-Verbindung ist **noch nicht gebaut oder veröffentlicht**. Die Sites-Einrichtungs- und Veröffentlichungsskripte fehlen in der aktuellen Arbeitsumgebung. Der hier beschriebene Dateiweg ist die tatsächlich implementierte Alternative.

## Einfach starten

Voraussetzung: **Node.js 24 LTS**. Im entpackten Projektordner:

```bash
npm run app
```

Das Startskript installiert fehlende Abhängigkeiten, bereitet die Konfiguration vor und startet die Anwendung auf **http://localhost:3000**. Unter Windows kannst du alternativ `Start-Lernpfad.bat`, unter macOS `Start-Lernpfad.command` starten.

Die lokale Datenbank und das Dateiverzeichnis werden automatisch eingerichtet. Für die KI kannst du jetzt **dein eigenes ChatGPT-Konto verbinden**, ohne einen API-Schlüssel einzugeben:

1. Die Anwendung lokal starten und ein Lernpfad-Konto anlegen oder anmelden.
2. Unter **Einstellungen → Mit deinem ChatGPT-Konto lernen → Continue with ChatGPT** die Anmeldung bei OpenAI öffnen.
3. Die angefragten Berechtigungen prüfen und die ChatGPT-Nutzung freigeben, sofern dein Konto dafür berechtigt ist.
4. Nach der Rückkehr unter Einstellungen ein verfügbares Modell auswählen und Dokumente hochladen. Bereits fehlgeschlagene Uploads über „Erneut versuchen“ starten.

Die Anmeldung erfolgt ausschließlich auf `auth.openai.com`. Lernpfad fragt nicht nach deinem ChatGPT-Passwort. Die Nutzung zählt zu deinem vorhandenen Kontingent und kann durch Tarif-, Modell- und Kontolimits eingeschränkt sein. Deine bisherigen ChatGPT-Unterhaltungen und Erinnerungen werden nicht übertragen. Eine fehlgeschlagene Anfrage über ChatGPT fällt nicht automatisch auf die separat abgerechnete API zurück.

Diese Integration folgt dem offiziellen [lokalen Sign-in-Verfahren](https://developers.openai.com/siwc/token-sharing-open-source). Sie benötigt einen HTTP-Loopback-Callback auf `127.0.0.1`; Browser und Anwendung müssen auf demselben Computer laufen. Ein Browser auf einem anderen iPad kann diesen lokalen Anmelde-Callback nicht übernehmen. Eine öffentlich gehostete Variante mit Nutzung von ChatGPT-Tarifen benötigt die entsprechende Freigabe durch OpenAI. Es wird keine generelle Verfügbarkeit für jedes Konto zugesichert.

Als Alternative bleibt `OPENAI_API_KEY` in `.env.local` möglich. Dafür `npm run setup -- --api-key` aufrufen (verdeckte Eingabe) oder die Datei lokal bearbeiten und neu starten. API-Nutzung wird separat abgerechnet. Wenn ein gültiges ChatGPT-Konto aktiv ist, hat diese Verbindung Vorrang; bei Fehlern wird nicht auf die API gewechselt. Ohne freigegebene ChatGPT-Verbindung und ohne API-Schlüssel werden keine KI-Ergebnisse simuliert.

Optional lassen sich Installation und Start getrennt ausführen:

```bash
npm ci
npm run setup
npm run dev
```

Zum Ausprobieren liegt ein kleines echtes Textdokument unter `public/beispiel-bilanz.txt`. Nach dem Start findest du es unter `/beispiel-bilanz.txt`. KI-Aufrufe werden über dein API-Konto abgerechnet.

## PostgreSQL und separater Hintergrunddienst

Mit installiertem Docker:

```bash
npm run docker
```

Das Skript verwendet dieselbe `.env.local`, erzeugt ein zufälliges Datenbankpasswort und startet die Webanwendung, PostgreSQL 17 und einen eigenen Worker. Die benannten Volumes `postgres` und `documents` speichern Daten unabhängig vom Containerneustart. Ohne Node-Startskript entspricht dies:

```bash
docker compose --env-file .env.local up --build -d
```

Vor einer Bereitstellung unter einer eigenen Domain `CHATGPT_LOCAL=false` setzen, einen serverseitigen API-Zugang konfigurieren und HTTPS einrichten und `COOKIE_SECURE=true` sowie `APP_ORIGIN=https://deine-domain.example` in `.env.local` setzen. Container nach Konfigurationsänderungen neu erstellen.

Für den normalen Node-Produktionsbetrieb:

```bash
npm run build
npm start
```

Ohne `DATABASE_URL` wird eine eingebettete PostgreSQL-Engine (PGlite) mit dauerhafter Speicherung unter `.data/postgres` verwendet. Dabei verarbeitet der Webserver die persistente Auftragsliste selbst. Die Verarbeitung benötigt keinen geöffneten Browser. Nach einem Neustart werden noch ausstehende oder verwaiste Aufträge wieder aufgenommen; bei einem abrupt beendeten Worker kann dafür zunächst die bestehende Lease von standardmäßig vier Minuten ablaufen müssen.

Mit `DATABASE_URL` kann der Worker als eigener Dienst laufen:

```bash
# Webserver: EXTERNAL_WORKER=true setzen
npm start
# Im zweiten Dienst, mit derselben DATABASE_URL und demselben DATA_DIR:
npm run worker
```

Der eigenständige Worker erfordert PostgreSQL. PGlite darf nicht gleichzeitig von zwei Prozessen geöffnet werden. Mehrere Worker verwenden Datenbank-Leases mit Heartbeat und `SKIP LOCKED`, um einen Auftrag jeweils einem Worker zuzuordnen. Generierte Kurse werden transaktional und gegen doppelte Übernahme geschützt gespeichert.

## GitHub und Veröffentlichung

GitHub kann den Quellcode und die automatisierten Prüfungen verwalten. GitHub Pages eignet sich nicht für diesen Node.js-Server mit Datenbank, Dateispeicher und Hintergrundjobs.

Mit installierter, angemeldeter GitHub CLI und Berechtigung zum Erstellen privater Repositories:

```bash
npm run github
# Optional ein anderer neuer Repository-Name:
npm run github -- mein-lernpfad
```

Der Helfer erstellt einen bereinigten temporären Checkout, schließt Zugangsdaten und Nutzerdaten aus und veröffentlicht ein **neues privates Repository**. Ein bereits bestehendes Repository wird nicht überschrieben. Der zugehörige GitHub-Workflow prüft Typen, Tests und Produktionsbuild. Die eigentliche Webanwendung benötigt weiterhin einen Node-/Docker-Host mit PostgreSQL und persistentem Dateispeicher, beispielsweise Render. Ein Hostingkonto wurde noch nicht verbunden; es wurde kein kostenpflichtiger Dienst angelegt.

## Konfiguration

Die Einrichtung erzeugt `.env.local`; bestehende Werte werden nicht überschrieben. Schlüssel gehören nur auf den Server.

| Variable            | Zweck                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`    | Alternative zur lokalen ChatGPT-Verbindung; nötig für den öffentlich gehosteten API-Betrieb.                                                                      |
| `OPENAI_MODEL`      | Standard `gpt-4.1-mini`; das Modell muss JSON-Ausgabe und Bildverständnis unterstützen.                                                                           |
| `DATABASE_URL`      | Optionaler PostgreSQL-Anschluss. Ohne diesen Wert wird PGlite eingerichtet.                                                                                       |
| `DATA_DIR`          | Standard `./.data`; persistentes, beschreibbares Verzeichnis für Dateien und gegebenenfalls PGlite.                                                               |
| `POSTGRES_PASSWORD` | Wird beim Setup zufällig erzeugt; Docker Compose verwendet diesen Wert.                                                                                           |
| `COOKIE_SECURE`     | Lokal `false`, unter HTTPS `true`.                                                                                                                                |
| `APP_ORIGIN`        | Exakter öffentlicher Ursprung hinter einem Reverse Proxy, beispielsweise `https://lernen.example.com`. Die Herkunftsprüfung berücksichtigt Schema, Host und Port. |
| `EXTERNAL_WORKER`   | Bei eigenem Worker `true`; Docker Compose setzt dies automatisch.                                                                                                 |
| `CHATGPT_LOCAL`     | `true` für den lokalen ChatGPT-Anmeldeweg. Auf öffentlichen Servern `false`.                                                                                      |
| `OPENAI_BASE_URL`   | Optional für einen eigenen vertrauenswürdigen OpenAI-kompatiblen Endpunkt. Standard `https://api.openai.com/v1`.                                                  |
| `JOB_LEASE_SECONDS` | Standard 240 Sekunden; während der Verarbeitung wird die Lease regelmäßig erneuert.                                                                               |

`.env.local`, Datenbank, Originaldateien, Abhängigkeiten und Buildverzeichnisse sind nicht Bestandteil des Quellcodepakets. Es werden keine API-Schlüssel oder OAuth-Tokens im Browser gespeichert. ChatGPT-Tokens liegen ausschließlich unter `DATA_DIR/chatgpt`, getrennt je Lernpfad-Konto, mit atomarem Schreiben und Dateirechten `0600` auf Unix. Das Verzeichnis ist vertraulich und gehört nicht in Git oder ein Quellcodepaket. Datenbank, Dateien und dieses Verzeichnis gemeinsam sichern. Bei separaten Workern muss derselbe Dateispeicher bereitstehen; Refreshes werden über prozessübergreifende Dateisperren serialisiert.

## Vollständiger Lernablauf

1. Konto erstellen und anmelden. Originaldateien und sämtliche Lerndaten gehören ausschließlich diesem Konto.
2. Bis zu zehn Dokumente gleichzeitig hochladen (PDF, DOCX, PPTX, TXT, PNG/JPG; je 25 MB). Mehrere Dateien eines Uploads ergeben einen gemeinsamen Kurs. Neue Dateien können einem bestehenden Kurs hinzugefügt werden.
3. Die gespeicherte Auftragsliste übernimmt Extraktion und Analyse. Scan-PDF-Seiten werden gerendert und mit dem Vision-Modell gelesen. Bereits extrahierte PDF-Seiten werden bei Wiederaufnahme verwendet. Große Texte werden abschnittsweise und gegebenenfalls hierarchisch zusammengefasst, statt einfach abgeschnitten zu werden.
4. Die KI strukturiert Kapitel und Unterkapitel/Levels. Jedes Level erhält Einführung, Erklärung, Beispiel, Definitionen, Zusammenfassung und unterschiedliche Übungen. Quellenzitate werden gegen gespeicherte Originalstellen geprüft.
5. Frei zwischen Verstehen, Grundlagen, Anwenden, Vertiefen und Abschlusstest wählen. Keine Phase sperrt andere Kapitel. Erklärungen lassen sich für vier Niveaus anpassen und werden je Niveau und Sprache gespeichert, ohne Aufgaben oder Fortschritt zu ersetzen. Lerninhalt kann das aktuelle Unterkapitel, der gesamte Kurs oder eine Kapitelauswahl sein.
6. Aufgabentyp, adaptive oder manuelle Schwierigkeit und Umfang bis 50 Fragen bestimmen. Zuordnungen funktionieren per Klick, Touch oder Drag-and-drop. Reihenfolgen lassen sich mit Tasten verschieben. Eigene Aufgaben erstellen und generierte Fragen bearbeiten oder entfernen.
7. Antworten werden serverseitig bewertet. Bei Fehlern wird im Hintergrund eine neue, belegte Folgeaufgabe erzeugt und gespeichert. Nach ihrer Fertigstellung führt „Nächste Aufgabe“ direkt zu ihr. Fehlerfeedback und Lernprofil bleiben erhalten.
8. XP, Level, Tagesziel, Lernzeit und Auszeichnungen verfolgen. Beherrschung und Wiederholungsdatum werden pro Kapitel und pro bearbeiteter Frage gespeichert. Die Schwierigkeit verwendet die konfigurierbaren Beherrschungsgrenzen.
9. Der Tutor sucht in einem persistenten Volltextindex. Konkrete Seiten-/Folienfragen werden bevorzugt berücksichtigt. Quellenzitate seiner Antwort werden validiert und angezeigt. Antworten ohne belegbare Quellen werden ausdrücklich gekennzeichnet.
10. Prüfungen aus Kapiteln, Fragetypen, Schwierigkeit, Umfang, Dauer und Bestehensgrenze erstellen. Antworten werden gespeichert, Lösungen bleiben bis zur Abgabe verborgen. Der Worker gibt abgelaufene Prüfungen auch ohne geöffneten Browser ab. Abgeschlossene Prüfungen lassen sich mit denselben Fragen erneut starten; der alte Versuch bleibt erhalten.
11. Notizen werden während des Schreibens gespeichert. Antwortentwurf, letztes Kapitel und Lernansicht werden wiederhergestellt. Statistiken und Prüfungsergebnisse lassen sich als JSON exportieren. Dokumente lassen sich umbenennen, durchsuchen, herunterladen und löschen.

## Speicherung und Betrieb

- Passwörter: scrypt mit individuellem Salt. Wiederherstellungscodes: 128 Bit Zufall, serverseitig nur gehasht und bei Verwendung rotiert. Sitzungen: zufällige Tokens, serverseitig nur als Hash gespeichert; HttpOnly-/SameSite-Cookies.
- Konten und Lernarbeitsbereiche: PostgreSQL/PGlite mit transaktionalen Änderungen. Jedes Lesen und Schreiben wird dem angemeldeten Eigentümer zugeordnet.
- Dateispeicherung: `DATA_DIR/files/<user-id>/<document-id>`; Dateinamen werden nicht als Speicherpfade verwendet.
- Hintergrundjobs: persistente Datenbanktabelle, Lease, Heartbeat, Status und Fehlermeldung. Die Datenbank stellt auch gemeinsame Rate Limits für mehrere Webprozesse bereit.
- Volltextindex: getrennte Dokumentabschnitte mit Eigentümer, Seitenzahl und PostgreSQL-Textsuchindex.
- Gesundheit des Dienstes: `GET /api/health`. Docker verwendet diesen Endpunkt für seinen Healthcheck.

Datenbank und Originaldateien gemeinsam sichern. Für PostgreSQL `pg_dump` plus Dateivolume sichern. Bei PGlite den Server stoppen und das gesamte `.data`-Verzeichnis kopieren. Für mehrere Server benötigen die Worker und Webserver denselben persistenten Dateispeicher; ein flüchtiges Serverless-Dateisystem eignet sich nicht. Ein öffentlich betriebener Dienst benötigt HTTPS und eine passende Hostingumgebung für Node.js sowie dauerhaft gespeicherte Daten.

## Bekannte Grenzen und externe Voraussetzungen

- **Echter KI-Zugang:** Eine persönliche ChatGPT-Freigabe/API-Verbindung ist noch nicht erfolgt. Der neue OAuth-Anmeldeweg ist mit signierten Test-Identitäten geprüft; eine Live-Anmeldung kann nur der Kontoinhaber selbst abschließen. Die Anwendung enthält die echte Integration; die automatisierten Tests verwenden einen isolierten Testanbieter. Fachliche Modellqualität und OCR-Erkennung lassen sich damit nicht garantieren.
- **Öffentliche Bereitstellung:** Noch nicht veröffentlicht. Die in dieser Umgebung verfügbaren Sites-Hostingmöglichkeiten passen nicht unverändert zum Node-/Dateispeicher-/Worker-Betrieb; die lokalen Sites-Veröffentlichungsskripte fehlen. Es wurde kein fremdes Hostingkonto angelegt und kein kostenpflichtiger Server gebucht.
- Die Bedienoberfläche ist Deutsch. Neu erzeugte KI-Lerninhalte können Deutsch oder Englisch sein; eine vollständige englische Übersetzung der Oberfläche und bestehender Kurse ist noch nicht umgesetzt.
- DOCX hat keine stabilen Druckseiten und wird daher als Seite 1 referenziert. PPTX verwendet die tatsächliche Präsentationsreihenfolge und berücksichtigt Sprechernotizen sowie gespeicherte Diagrammdaten; PDF verwendet echte Seitenzahlen. Tabellen, spezielle Formelzeichen und komplexe Diagramme können trotz Extraktion/OCR unvollständig erkannt werden. Unklare Originale müssen geprüft werden.
- Maximale Dateigröße 25 MB, maximal 1.000 PDF-Seiten/Folien; entpackte Office-Archive werden begrenzt. Große Scan-PDFs erfordern entsprechend viele Vision-Aufrufe und Verarbeitungszeit.
- Bei manueller Neugenerierung eines ganzen Kurses werden Kapitel ersetzt. Beim Hinzufügen von Dokumenten bleiben Kapitel-IDs bei unveränderten Titeln erhalten; bei geänderter Struktur kann die alte Zuordnung von Notizen und Beherrschung entfallen. Historische Antworten und Prüfungen bleiben gespeichert.
- Die Beherrschung ist eine nachvollziehbare Lernschätzung, keine wissenschaftliche Messung. KI-generierte Erklärungen und Bewertungen können Fehler enthalten; Quellen dienen zur Überprüfung.
- Bei der Registrierung wird ein persönlicher Wiederherstellungscode einmalig angezeigt. Mit diesem Code kann das Passwort ohne E-Mail-Dienst zurückgesetzt werden; dabei werden alte Sitzungen und der bisherige Code ungültig. Bestehende Konten können in den Einstellungen nach Passworteingabe einen Code erstellen. E-Mail-Verifizierung und Zwei-Faktor-Anmeldung sind nicht implementiert.

## Tests

```bash
npm run typecheck
npm test
npm run test:integration
npm run test:postgres
# Nach einem Docker-Build mit Tag lernpfad:validated:
node scripts/test-container.mjs
npm run build
```

`npm test` prüft Logik, Quellen und echte Office-/PDF-Parser einschließlich Scan-PDF-Rendering mit kontrollierter Vision-Testantwort. Der HTTP-Test startet isolierte Server auf freien lokalen Ports und verwendet ein temporäres Datenverzeichnis. Er prüft außerdem Wiederaufnahme nach einem Neustart während des Uploadprozesses, gemeinsame Kurse, Phasen, Folgeaufgaben, Prüfungswiederholung, Benutzertrennung und Quellenprüfung im Tutor. `test:postgres` benötigt Docker und prüft denselben Ablauf mit PostgreSQL 17 und einem eigenständigen Worker. Testdaten und Testcontainer werden anschließend entfernt.

Details und tatsächliche Prüfergebnisse: `VALIDATION.md`.

## Quellcode

- `app/platform.tsx`, `app/globals.css`: responsive Oberfläche und verbundene Lernabläufe.
- `app/api/[...path]/route.ts`: geschützte HTTP-Schnittstellen.
- `lib/db.ts`, `lib/auth.ts`, `lib/types.ts`: Speicherung, Sitzungen, Datenmodell.
- `lib/documents.ts`, `lib/retrieval.ts`: Extraktion, OCR, Kontextaufbereitung und Volltextsuche.
- `lib/chatgpt.ts`, `app/chatgpt-connection.tsx`: lokales OAuth mit PKCE/Nonce/Signaturprüfung, Kontowechsel, Tokenrotation, Widerruf und Responses-Streaming.
- `lib/ai.ts`, `lib/remediation.ts`: echte KI-Anbindung, Quellenprüfung und Folgeaufgaben.
- `lib/jobs.ts`, `scripts/worker.ts`, `instrumentation.ts`: dauerhafte Hintergrundverarbeitung.
- `lib/learning.ts`, `lib/exams.ts`: Beherrschung, Wiederholung, XP und Prüfungsbewertung.
- `scripts/setup.mjs`, `scripts/start.mjs`, `scripts/docker.mjs`: automatische Einrichtung und Start.

## Abhängigkeitsprüfung

Die beobachteten hohen Meldungen für PDF.js und PostCSS sowie die KaTeX-Meldung wurden durch eine passende PDF.js-Version, deaktivierte dynamische PDF-Auswertung und aktualisierte Abhängigkeiten behoben. Die Produktionsabhängigkeiten melden derzeit noch drei mittlere Einträge derselben `mammoth → argparse → sprintf-js`-Kette. Diese wird vom Mammoth-Kommandozeilenprogramm benötigt; die Anwendung verwendet ausschließlich die Bibliothek. Es wurde kein veralteter Parser-Downgrade zur bloßen Unterdrückung der Meldung vorgenommen.

## Auf dem iPad mit GitHub Codespaces ausprobieren

Das Projekt enthält eine `.devcontainer`-Konfiguration für einen Node.js-24-Codespace. Die neue Codespaces-Konfiguration wurde statisch geprüft, aber noch nicht auf GitHub gestartet; der Quellcode liegt auf GitHub; ein tatsächlicher Codespace-Start wurde in dieser Arbeitsumgebung nicht ferngeprüft.

1. Den bereinigten Projektinhalt in ein eigenes privates GitHub-Repository übernehmen und dieses für die ChatGPT-GitHub-Verbindung freigeben.
2. Im Repository unter **Code → Codespaces** einen Codespace erstellen. Die Einrichtung installiert die Abhängigkeiten und legt die lokale Datenbankkonfiguration an.
3. Im Codespace-Terminal `npm run codespaces` eingeben und den weitergeleiteten **Port 3000** öffnen. Seine Sichtbarkeit privat lassen.
4. Nach dem Lernen den Codespace stoppen. Vor einer Löschung den Inhalt von `.data` sichern; ein gelöschter Codespace ist kein dauerhafter Dokumentenspeicher.

Codespaces verbraucht Rechenzeit und Speicher aus dem jeweiligen GitHub-Kontingent. Es wird kein kostenpflichtiger Codespace durch dieses Paket angelegt. Ohne gültige Zahlungsmethode blockiert GitHub die Nutzung nach Verbrauch des kostenlosen Kontingents. Mit Zahlungsmethode können weitere Kosten entstehen; das Konto muss entsprechend begrenzt werden.

GitHub Pages allein führt diesen Server nicht aus. Codespaces ist eine Entwicklungsumgebung zum Ausprobieren, kein zugesagtes dauerhaft kostenloses Hosting. Die KI ist dort nicht automatisch enthalten: Der lokale Loopback-Login kann vom iPad aus nicht direkt zum entfernten Codespace zurückkehren. Die Codespaces-Konfiguration deaktiviert ihn deshalb ausdrücklich. Ohne separat geeigneten KI-Zugang funktionieren Konten und Speicherung, aber keine KI-Generierung. Es wurden keine API-Schlüssel ins Repository geschrieben.

Offizielle Hinweise: [Codespaces-Kontingente](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
