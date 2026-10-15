# Validierung – Lernpfad 1.3.1

Stand: 15. Oktober 2026.

## Upload großer Dokumente (1.3.1)

`npm run test:upload` überträgt eine synthetische PDF mit 106 Seiten und rund 20 MB in 1-MB-Teilstücken. Geprüft werden bytegleiche Originalspeicherung, alle 106 ausgelesenen Seiten, Export der Seiten 100–106, wiederholte Teilstücke und idempotenter Abschluss, Ablehnung unvollständiger Uploads und Kontentrennung. Zusätzlich besteht der echte Upload derselben 20-MB-PDF über das Formular in Chromium mit Touch-Bedienung und Tablet-Viewport (1024 × 768), ohne JavaScript-Seitenfehler. Alle 27 bisherigen Tests, TypeScript-Prüfung und Produktions-Build bestehen. Das beweist den lokalen Verarbeitungspfad; die konkrete Safari-/Codespaces-Verbindung des Nutzers kann hier nicht ferngesteuert geprüft werden.

## Manueller ChatGPT-Dateiweg (1.3)

Der HTTP-/Browserdurchlauf mit ausdrücklich leerem API-Schlüssel besteht: Upload und Textextraktion, Export, Import, Antwortbewertung und XP, Neustart mit erhaltenem Kurs und Antworten sowie Isolation zwischen zwei Konten. Im mobilen Chromium wurden der tatsächliche Dateidownload und Import über das Formular, die Navigation zum Kurs, fehlender horizontaler Überlauf und ausbleibende JavaScript-Seitenfehler geprüft.

Neue Tests prüfen den Export ausgewählter eigener Seiten ohne Lernprofil, den belegten Kursimport, seine Idempotenz, lokal bewertbare Aufgaben und die Ablehnung fremder Quellen, erfundener Zitate und ungültiger Aufgaben. Der Import vergibt eigene IDs und verändert keine alten Antworten oder XP. Für diesen Weg wird kein API-Schlüssel benötigt.

Die automatische ChatGPT-Sites-/Plugin-Verbindung ist weiterhin nicht eingerichtet. Insbesondere ist dies kein Nachweis einer automatischen Übertragung zwischen Website und Chat.

## Automatisierte Logik- und Parsertests

27 Tests bestehen, einschließlich fünf Tests zur Codespaces-Ursprungsprüfung und drei Tests zum Dateiweg. Der bisherige Bestand umfasst 15 Tests für Lernlogik, Passwortprüfung, Quellenvalidierung, objektive Bewertung, Zuordnungen, konfigurierbare Beherrschungsgrenzen, TXT, DOCX, PDF und PPTX sowie mathematische Darstellung. Dazu kommt ein eigener Hintergrundtest für abgelaufene Prüfungen und die idempotente Übernahme verwaister Job-Leases.

PDF-Seiten ohne Textebene werden im Test tatsächlich gerendert und an einen kontrollierten Vision-Testanbieter übergeben. Bereits gelesene Seiten werden wiederverwendet. Ein PPTX-Test prüft eine vom Dateinamen abweichende Präsentationsreihenfolge einschließlich Sprechernotizen und Diagrammdaten. KaTeX wird sowohl direkt als auch durch die tatsächliche Markdown-/Remark-/Rehype-Pipeline geprüft.

## ChatGPT-Verbindung (1.2)

Geprüft mit lokal generierten, kryptografisch signierten Test-Identitäten und einem ausschließlich im Test ersetzten HTTP-Transport:

- PKCE-S256, zufälliger State und Nonce, unveränderter Loopback-Callback.
- Signatur, Aussteller, Zielgruppe und Nonce des ID-Tokens; Ablehnung eines falschen Nonce und erneut verwendeter Callbacks.
- Verwendung der dynamisch ausgegebenen Client-ID; Wiederverwendung für erneute Anmeldung.
- Trennung der ChatGPT-Verbindungen je Lernpfad-Konto; öffentliche Statusantworten enthalten keine Tokens.
- Responses mit `store:false`, `stream:true`, Umwandlung von Systemanweisungen und Vision-Inhalten.
- Erfolg erst nach `response.completed`; unvollständige Streams und verspätete Kontingentfehler werden abgewiesen.
- Serialisierte Tokenrotation bei gleichzeitigen Anfragen und Dateirechte `0600` auf Unix.
- Widerruf und lokale Löschung der Tokens beim Trennen; Erhalt der Registrierung für erneutes Verbinden.
- Neuer Produktionsbuild erfolgreich.
- Erneuter vollständiger HTTP- und Browserdurchlauf gegen Version 1.2 erfolgreich. Die mobile Einstellungsansicht und der Browserwechsel zur offiziellen OpenAI-Autorisierungsadresse wurden geprüft; die tatsächliche Login-Seite wurde im Browsertest abgefangen, ohne eine echte Kontofreigabe vorzutäuschen.

Eine Live-Anmeldung wurde nicht durchgeführt: Der Kontoinhaber muss die persönliche Berechtigung bei OpenAI selbst bestätigen. Die Tests belegen die implementierte Protokollverarbeitung, nicht die Berechtigung eines konkreten ChatGPT-Tarifs.

## HTTP-Durchlauftest mit Produktionsbuild

Erfolgreich geprüft:

- Registrierung, Anmeldung und privater Arbeitsbereich.
- Neue ChatGPT-Endpunkte: Anmeldung vor Statuszugriff erforderlich, dynamische Client-Registrierung mit PKCE und korrektem Callback sowie Ablehnung ungültiger Callbacks.
- Wiederherstellungscode, Passwortzurücksetzung, Rotation des Codes und Ungültigkeit alter Sitzungen.
- Upload von mehreren Dokumenten und gemeinsame Kursgenerierung mit überprüften Quellen.
- Neustart direkt nach dem Upload: ausstehende Verarbeitung wird ohne einen auslösenden Dashboard-Aufruf wieder aufgenommen.
- Serverseitige Antwortbewertung und idempotente Wiederholung derselben Antwortanfrage.
- Speicherung von Notizen, Antwortentwurf, Kapitelwahl, Lernmodus und eigener Fragenanzahl über einen Prozessneustart.
- Anpassung einer Erklärung an ein gewähltes Niveau und Speicherung der Variante.
- Quellengeprüfter Tutor, Lernphasen und automatische neue Folgeaufgabe nach einer falschen Antwort.
- Prüfungserstellung, Antwortspeicherung, Auswertung, wiederholte Abgabe ohne doppelte Fortschrittsbuchung und erneuter Prüfungsversuch.
- Ein zweites Konto kann fremde Dokumente weder lesen noch fremde Aufgaben beantworten.
- Fremder Ursprung und ein Ursprung mit anderem URL-Schema werden abgewiesen.
- Originaldateien bleiben nach dem Neustart unverändert abrufbar.

Der gleiche grundlegende Durchlauf wurde auch gegen einen echten PostgreSQL-17-Server mit einem eigenständigen Worker durchgeführt. Die beim Test angelegten Daten und Container wurden anschließend entfernt.

## Browserprüfung

Mit Chromium geprüft: Registrierung über das Formular, einmalige Anzeige des Wiederherstellungscodes, Passwortzurücksetzung und erneute Anmeldung; anschließend Lernphasen, Zuordnungen per Klick, serverseitige Auswertung, Desktop-, Tablet- und Smartphone-Ansichten sowie Dark Mode. Keine JavaScript-Seitenfehler und kein horizontaler Überlauf.

Dabei wurden eine überschriebene Navigation während der Wiederaufnahme, eine falsche Darstellung eigener Fragenzahlen und eine Überlagerung auf schmalen Bildschirmen korrigiert. Gemeinsame Fehlermeldungen werden zusätzlich als sichtbarer Hinweis angezeigt, auch bei geöffnetem Tutor.

## Docker-Produktionsbetrieb (Version 1.1)

Das Linux-Image wurde erfolgreich gebaut. Mit PostgreSQL 17 und einem separaten Worker wurden gleichzeitiger Dienststart, Registrierung, mehrteiliger Upload, native PDF-Rasterisierung bis zur echten Vision-Konfigurationsprüfung, verständlicher Fehler bei fehlendem API-Schlüssel, Neustart des Webcontainers, dauerhafte Originaldateien sowie Passwortzurücksetzung mit Sitzungswiderruf geprüft. Der Test berücksichtigt wechselnde zufällige Testports nach einem Containerneustart.

Die abschließende mobile Browserprüfung gegen dieses Produktionsimage besteht ebenfalls: sichtbarer Fehlerhinweis bei ungültigen Einstellungen, kein horizontaler Überlauf und keine JavaScript-Seitenfehler. Die temporären Container, Volumes und das Testnetzwerk wurden anschließend entfernt.

Ein erster Lauf erreichte das Speicherlimit der Testumgebung; anschließend wurden eigene alte Build-Artefakte entfernt und der Test mit ausreichend freiem Speicher wiederholt.

## Abhängigkeiten

Die beim Audit beobachteten hohen Einträge für PDF.js und PostCSS und der niedrige KaTeX-Eintrag wurden behoben. Aktuell verbleiben drei mittlere Meldungen einer einzigen Kette `mammoth → argparse → sprintf-js`. `argparse` wird vom Mammoth-Kommandozeilenprogramm verwendet; dieser Einstiegspunkt wird von der Anwendung nicht aufgerufen. Es wurde kein unsicherer Rückbau auf einen veralteten DOCX-Parser zur Unterdrückung des Audits vorgenommen.

## Grenzen der Verifikation

Kein echter OpenAI-Schlüssel und keine persönliche ChatGPT-OAuth-Freigabe sind verbunden. Die Integrationstests verwenden einen isolierten OpenAI-kompatiblen Testanbieter; sie sind kein Nachweis für die fachliche Qualität realer Modellantworten oder die reale OCR-Erkennungsqualität. Die Anwendung selbst enthält keine entsprechenden Testantworten oder simulierte KI-Funktionen.

Eine öffentliche Bereitstellung und Tests unter einer eigenen HTTPS-Domain sind mangels verbundenem Hostingkonto noch nicht erfolgt. Weitere Funktions- und Betriebsgrenzen stehen in der README.

