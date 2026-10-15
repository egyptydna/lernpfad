import { spawnSync } from 'node:child_process';
for (const [command, args] of [['npm', ['ci']], [process.execPath, ['scripts/setup.mjs', '--no-prompt']]]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log('Vorbereitet. Start: npm run codespaces. Die KI benötigt einen separat konfigurierten Zugang.');
