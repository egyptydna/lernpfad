import { spawn } from 'node:child_process';
const name = process.env.CODESPACE_NAME;
const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
if (!name || !/^[a-z0-9-]+$/i.test(name) || !/^[a-z0-9.-]+$/i.test(domain)) {
  console.error('Dieser Startbefehl ist für GitHub Codespaces bestimmt. Lokal: npm run app.');
  process.exit(1);
}
const origin = `https://${name}-3000.${domain}`;
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '0.0.0.0'], {
  stdio: 'inherit', env: { ...process.env, APP_ORIGIN: origin, CHATGPT_LOCAL: 'false', COOKIE_SECURE: 'true' }
});
child.on('error', () => { console.error('Start fehlgeschlagen. Bitte die Einrichtung des Codespaces abschließen.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
console.log('Privaten weitergeleiteten Port 3000 im Browser öffnen. Nach dem Lernen den Codespace stoppen.');
