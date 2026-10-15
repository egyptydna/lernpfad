import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
for (const name of [".env.local"]) {
  try {
    await access(name);
  } catch {
    let content = await readFile(".env.example", "utf8");
    content += "\nPOSTGRES_PASSWORD=" + randomBytes(32).toString("hex") + "\n";
    await writeFile(name, content, { mode: 0o600 });
  }
}
await mkdir(".data", { recursive: true, mode: 0o700 });
let config = await readFile(".env.local", "utf8");
if (!/^CHATGPT_LOCAL=/m.test(config)) {
  config += "\nCHATGPT_LOCAL=true\n";
  await writeFile(".env.local", config, { mode: 0o600 });
}
const hasKey =
  /^OPENAI_API_KEY=\S+/m.test(config) || Boolean(process.env.OPENAI_API_KEY);
console.log(
  "Lokale Datenbank, Speicherverzeichnis und Konfiguration sind vorbereitet.",
);
console.log(
  hasKey
    ? "KI-Schlüssel vorhanden."
    : "KI lokal unter Einstellungen mit ChatGPT verbinden. Alternativ OPENAI_API_KEY in .env.local eintragen.",
);
console.log("Start: npm run dev – anschließend http://localhost:3000");
if (!hasKey && process.stdin.isTTY && process.argv.includes("--api-key")) {
  process.stdout.write("OpenAI API-Schlüssel (verdeckt; Enter überspringt): ");
  const key = await new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") {
          finish();
          reject(new Error("Einrichtung abgebrochen."));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (value.length < 2000) value += char;
      }
    };
    process.stdin.on("data", onData);
  });
  if (key) {
    const contents = await readFile(".env.local", "utf8");
    await writeFile(
      ".env.local",
      contents.replace(
        /^OPENAI_API_KEY=.*$/m,
        "OPENAI_API_KEY=" + JSON.stringify(key),
      ),
      { mode: 0o600 },
    );
    console.log("KI-Schlüssel serverseitig gespeichert.");
  }
}
