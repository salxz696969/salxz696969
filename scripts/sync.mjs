import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calendarStart, iso, renderCalendar, validateCounts } from './calendar.mjs';
import { collectLanguages, renderLanguages } from './languages.mjs';
import { collectGithubCommits, combineCounts } from './github-commits.mjs';
import { hoverAssetPaths, renderHoverAssets, renderHoverCalendar, replaceCalendarBlock } from './hover-calendar.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, ...options });

export function aggregateLogs(logs, emails, through) {
  const allowed = new Set(emails.map(email => email.toLowerCase()));
  const seen = new Set();
  const counts = {};
  const start = iso(calendarStart(through));
  for (const log of logs) {
    for (const line of log.trim().split('\n')) {
      if (!line) continue;
      const [sha, email, authoredAt] = line.trim().split('\t');
      if (!/^[a-f0-9]{40,64}$/.test(sha) || !authoredAt || !email) throw new Error('Unexpected git log format');
      const date = authoredAt.slice(0, 10);
      if (!allowed.has(email.toLowerCase()) || seen.has(sha) || date < start || date > through) continue;
      seen.add(sha);
      counts[date] = (counts[date] || 0) + 1;
    }
  }
  return validateCounts({ version: 1, through, days: Object.fromEntries(Object.entries(counts).sort()) });
}

// A strict output whitelist is also used for publishing. Never add source paths,
// author identities, commit hashes/messages, credentials, or raw git logs here.
const publishPaths = ['data/daily-commits.json', 'assets/commits-light.svg', 'assets/commits-dark.svg', 'assets/top-languages-light.svg', 'assets/top-languages-dark.svg', ...hoverAssetPaths, 'README.md'];

export function publish(config, files) {
  const api = args => JSON.parse(run('gh', ['api', ...args]));
  const target = config.githubRepository;
  const branch = config.githubBranch;
  if (!/^[\w.-]+\/[\w.-]+$/.test(target) || !/^[\w./-]+$/.test(branch)) throw new Error('Invalid GitHub destination');
  const [owner, name] = target.split('/');
  // Read the expected head first. Concurrent changes make the atomic mutation
  // fail rather than overwrite somebody else's README or code.
  const expectedHeadOid = api([`repos/${target}/git/ref/heads/${branch}`]).object.sha;
  const changes = [];
  for (const path of publishPaths) {
    let oldContent = null;
    try {
      const current = api([`repos/${target}/contents/${path}?ref=${encodeURIComponent(branch)}`]);
      oldContent = Buffer.from(current.content, 'base64').toString('utf8');
    } catch (error) {
      if (!String(error.stderr).includes('404')) throw error;
    }
    const content = path === 'README.md' ? replaceCalendarBlock(oldContent || '', files[path]) : files[path];
    if (oldContent !== content) changes.push({ path, contents: Buffer.from(content).toString('base64') });
  }
  if (!changes.length) { console.log('Profile cards are already current.'); return; }
  const query = 'mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{url}}}';
  const input = { branch: { repositoryNameWithOwner: `${owner}/${name}`, branchName: branch }, expectedHeadOid, message: { headline: 'Refresh profile activity cards' }, fileChanges: { additions: changes } };
  const response = JSON.parse(run('gh', ['api', 'graphql', '--input', '-'], { input: JSON.stringify({ query, variables: { input } }) }));
  if (response.errors) throw new Error('GitHub rejected the profile update');
  console.log(`Updated ${changes.length} aggregate card files: ${response.data.createCommitOnBranch.commit.url}`);
}

export function main(args = process.argv.slice(2)) {
  const configIndex = args.indexOf('--config');
  if (configIndex < 0 || !args[configIndex + 1]) throw new Error('Provide --config with a private local config file');
  const configPath = resolve(args[configIndex + 1]);
  const configRelative = relative(root, configPath);
  if (!configRelative.startsWith('..') && !isAbsolute(configRelative)) throw new Error('Keep the private config outside the public profile checkout');
  const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(config.repositories) || !config.repositories.length || !Array.isArray(config.emails) || !config.emails.length) throw new Error('Configure source checkouts and author emails');
  const through = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const logs = config.repositories.map(repo => {
    if (run('git', ['-C', repo, 'rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error('Complete history is required');
    if (!args.includes('--no-fetch')) run('git', ['-C', repo, 'fetch', '--quiet', 'origin']);
    // Only remote-tracking refs: unpushed local work never counts. No code,
    // filenames, commit messages, or diffs are requested from Git.
    return run('git', ['-C', repo, 'log', '--remotes=origin', '--format=%H%x09%ae%x09%aI']);
  });
  const githubCounts = collectGithubCommits(config.githubRepository.split('/')[0], through);
  const counts = validateCounts(combineCounts(aggregateLogs(logs, config.emails, through), githubCounts));
  const files = { 'data/daily-commits.json': JSON.stringify(counts, null, 2) + '\n' };
  Object.assign(files, renderHoverAssets(counts));
  files['README.md'] = renderHoverCalendar(counts);
  for (const theme of ['light', 'dark']) files[`assets/commits-${theme}.svg`] = renderCalendar(counts, theme);
  const cachePath = resolve(configPath, '..', 'public-languages-cache.json');
  let cache;
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { /* First run. */ }
  if (!cache || cache.date !== through) {
    cache = { date: through, languages: collectLanguages(config.githubRepository.split('/')[0]) };
    writeFileSync(cachePath, JSON.stringify(cache));
  }
  for (const theme of ['light', 'dark']) files[`assets/top-languages-${theme}.svg`] = renderLanguages(cache.languages, theme);
  if (!args.includes('--publish')) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(resolve(root, path, '..'), { recursive: true });
      writeFileSync(resolve(root, path), path === 'README.md' ? replaceCalendarBlock(readFileSync(resolve(root, path), 'utf8'), content) : content);
    }
  }
  console.log(`Prepared ${Object.values(counts.days).reduce((a, b) => a + b, 0)} commits across ${Object.keys(counts.days).length} active days through ${through}.`);
  if (args.includes('--publish')) publish(config, files);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { console.error('Profile refresh failed. No raw source data was published. Check authentication, connectivity, and private configuration.'); process.exitCode = 1; }
}
