import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const themes = {
  light: { background: '#ffffff', foreground: '#1f2328', muted: '#59636e', border: '#d1d9e0', cells: ['#eff2f5', '#aceebb', '#4ac26b', '#2da44e', '#116329'] },
  dark: { background: '#0d1117', foreground: '#f0f6fc', muted: '#9198a1', border: '#3d444d', cells: ['#151b23', '#033a16', '#196c2e', '#2ea043', '#56d364'] },
};
export const escapeXml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
export const iso = date => date.toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(date.getTime() + n * 86400000);

export function calendarStart(endDate) {
  const end = new Date(`${endDate}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return addDays(start, -start.getUTCDay());
}

export function validateCounts(data) {
  if (Object.keys(data).sort().join(',') !== 'days,through,version' || data.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.through) || !Number.isFinite(Date.parse(data.through)) || iso(new Date(data.through)) !== data.through) throw new Error('Invalid aggregate data');
  if (!data.days || Array.isArray(data.days) || typeof data.days !== 'object') throw new Error('Invalid day counts');
  const start = iso(calendarStart(data.through));
  for (const [date, count] of Object.entries(data.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || iso(new Date(date)) !== date || date < start || date > data.through || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid daily count');
  }
  return data;
}

export function renderCalendar(input, theme = 'light') {
  const data = validateCounts(input);
  const t = themes[theme];
  if (!t) throw new Error('Unknown theme');
  const start = calendarStart(data.through);
  const end = new Date(`${data.through}T00:00:00Z`);
  const dayCount = Math.round((end - start) / 86400000) + 1;
  const weeks = Math.ceil(dayCount / 7);
  const width = 66 + weeks * 13;
  const total = Object.values(data.days).reduce((a, b) => a + b, 0);
  // Quartiles of non-zero days keep unusually busy days from flattening the graph.
  const values = Object.values(data.days).filter(n => n > 0).sort((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75].map(q => values[Math.max(0, Math.ceil(values.length * q) - 1)] || 1);
  const parts = [];
  const text = (x, y, value, extra = '') => `<text x="${x}" y="${y}" ${extra}>${escapeXml(value)}</text>`;
  const monthFormat = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
  let lastMonth = -1;
  for (let week = 0; week < weeks; week++) {
    const date = addDays(start, week * 7);
    if (date.getUTCMonth() !== lastMonth && week < weeks - 1) {
      parts.push(text(44 + week * 13, 58, monthFormat.format(date)));
      lastMonth = date.getUTCMonth();
    }
  }
  for (const [day, label] of [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]) parts.push(text(13, 77 + day * 13, label));
  for (let i = 0; i < dayCount; i++) {
    const date = iso(addDays(start, i));
    const count = data.days[date] || 0;
    const level = count === 0 ? 0 : 1 + thresholds.filter(n => count > n).length;
    parts.push(`<rect x="${44 + Math.floor(i / 7) * 13}" y="${68 + (i % 7) * 13}" width="10" height="10" rx="2" fill="${t.cells[level]}" stroke="${t.foreground}" stroke-opacity=".05"><title>${count} ${count === 1 ? 'commit' : 'commits'} on ${date}</title></rect>`);
  }
  parts.push(text(width - 139, 183, 'Less', `fill="${t.muted}"`));
  for (let i = 0; i < 5; i++) parts.push(`<rect x="${width - 108 + i * 13}" y="174" width="10" height="10" rx="2" fill="${t.cells[i]}" stroke="${t.foreground}" stroke-opacity=".05"/>`);
  parts.push(text(width - 38, 183, 'More', `fill="${t.muted}"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="201" viewBox="0 0 ${width} 201" role="img" aria-labelledby="title desc">
<title id="title">${total.toLocaleString('en-US')} commits in the last year</title>
<desc id="desc">Daily commit totals from ${iso(start)} through ${data.through}.</desc>
<rect width="${width}" height="201" fill="${t.background}"/>
<g fill="${t.foreground}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans,Helvetica,Arial,sans-serif" font-size="12">
${text(0, 19, `${total.toLocaleString('en-US')} commits in the last year`, 'font-size="16"')}
<rect x=".5" y="32.5" width="${width - 1}" height="168" rx="6" fill="none" stroke="${t.border}"/>
${parts.join('\n')}
</g>
</svg>\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(readFileSync(process.argv[2] || 'data/daily-commits.json', 'utf8'));
  mkdirSync('assets', { recursive: true });
  for (const theme of Object.keys(themes)) writeFileSync(`assets/commits-${theme}.svg`, renderCalendar(data, theme));
}
