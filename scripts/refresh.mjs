import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './sync.mjs';

export function needsRefresh(previous, signature, now) {
  return !previous || !Number.isFinite(previous.checkedAt) || previous.signature !== signature || now - previous.checkedAt >= 6 * 60 * 60 * 1000;
}

export function refresh(args = process.argv.slice(2)) {
  const index = args.indexOf('--config');
  if (index < 0 || !args[index + 1]) throw new Error('Private config is required');
  const configPath = resolve(args[index + 1]);
  const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  const statePath = resolve(configPath, '..', 'refresh-state.json');
  const signature = () => {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(config));
    for (const repo of config.repositories) {
      hash.update(execFileSync('git', ['-C', repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes/origin'], { windowsHide: true, timeout: 15000 }));
    }
    return hash.digest('hex');
  };
  let previous;
  try { previous = JSON.parse(readFileSync(statePath, 'utf8')); } catch { /* First refresh. */ }
  const now = Date.now();
  if (!args.includes('--force') && !needsRefresh(previous, signature(), now)) {
    console.log('No new local commits; refresh skipped.');
    return;
  }
  main(['--config', configPath, '--publish']);
  writeFileSync(statePath, JSON.stringify({ signature: signature(), checkedAt: now }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { refresh(); } catch { console.error('Profile refresh failed; it will retry on the next scheduled check.'); process.exitCode = 1; }
}
