import { execFileSync } from 'node:child_process';
import { themes, escapeXml } from './calendar.mjs';

function ghJson(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }));
}

export function collectLanguages(owner) {
  if (!/^[a-zA-Z0-9-]+$/.test(owner)) throw new Error('Invalid GitHub owner');
  // This endpoint is public-only even when gh is signed in. No private code is read.
  const pages = ghJson([`users/${owner}/repos?type=owner&per_page=100`, '--paginate', '--slurp']);
  const totals = {};
  for (const repo of pages.flat()) {
    if (repo.private || repo.fork) continue;
    const languages = ghJson([`repos/${owner}/${repo.name}/languages`]);
    for (const [language, bytes] of Object.entries(languages)) totals[language] = (totals[language] || 0) + bytes;
  }
  return Object.entries(totals).map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
}

const colors = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Dart: '#00b4ab', Vue: '#41b883', Shell: '#89e051', 'Jupyter Notebook': '#da5b0b', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', Kotlin: '#a97bff', Swift: '#f05138', Ruby: '#701516' };

export function renderLanguages(languages, theme = 'light') {
  const t = themes[theme];
  const top = languages.slice(0, 6);
  const total = languages.reduce((sum, lang) => sum + lang.bytes, 0);
  let offset = 0;
  const bars = top.map(lang => {
    const width = lang.bytes / total * 350;
    const svg = `<rect x="${25 + offset}" y="53" width="${width.toFixed(3)}" height="8" fill="${colors[lang.name] || '#8b949e'}"/>`;
    offset += width;
    return svg;
  });
  const labels = top.map((lang, i) => {
    const x = 25 + (i % 2) * 177;
    const y = 87 + Math.floor(i / 2) * 24;
    return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${colors[lang.name] || '#8b949e'}"/><text x="${x + 17}" y="${y}">${escapeXml(lang.name)} <tspan fill="${t.muted}">${(lang.bytes / total * 100).toFixed(1)}%</tspan></text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="176" viewBox="0 0 400 176" role="img" aria-labelledby="title desc">
<title id="title">Most used languages</title><desc id="desc">Language share by code bytes in public, non-fork GitHub repositories. Private work is excluded. Top six languages shown; percentages use all languages.</desc>
<rect x=".5" y=".5" width="399" height="175" rx="6" fill="${t.background}" stroke="${t.border}"/>
<g fill="${t.foreground}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans,Helvetica,Arial,sans-serif" font-size="12">
<text x="25" y="31" font-size="16" font-weight="600">Most used languages</text>
<defs><clipPath id="bar"><rect x="25" y="53" width="350" height="8" rx="4"/></clipPath></defs>
<g clip-path="url(#bar)"><rect x="25" y="53" width="350" height="8" fill="${t.border}"/>${bars.join('')}</g>${labels.join('')}
<text x="25" y="158" font-size="11" fill="${t.muted}">Public GitHub repositories · by code size</text>
</g></svg>\n`;
}
