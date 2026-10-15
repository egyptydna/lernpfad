import { startWorker } from "../lib/jobs";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Der separate Worker benötigt DATABASE_URL. Für die lokale PGlite-Installation übernimmt der Webserver die Hintergrundjobs automatisch.",
  );
startWorker(true);
console.log("Lernpfad-Worker gestartet.");
setInterval(() => {}, 60000);
