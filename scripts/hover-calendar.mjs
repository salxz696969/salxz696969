import { themes, escapeXml, calendarStart, addDays, iso, validateCounts } from './calendar.mjs';

export const hoverAssetPaths = [
  ...Array.from({ length: 5 }, (_, level) => `assets/calendar/day-${level}.svg`),
  'assets/calendar/blank.svg',
  'assets/calendar/mon.svg', 'assets/calendar/wed.svg', 'assets/calendar/fri.svg',
  'assets/calendar/months.svg', 'assets/calendar/legend.svg',
];

function themedSvg(width, height, content, extraStyles = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>:root{--fg:${themes.light.foreground};--muted:${themes.light.muted};${themes.light.cells.map((c, i) => `--c${i}:${c}`).join(';')}}@media(prefers-color-scheme:dark){:root{--fg:${themes.dark.foreground};--muted:${themes.dark.muted};${themes.dark.cells.map((c, i) => `--c${i}:${c}`).join(';')}}}${extraStyles}</style>${content}</svg>\n`;
}

export function renderHoverAssets(input) {
  const data = validateCounts(input);
  const start = calendarStart(data.through);
  const weeks = Math.ceil(((Date.parse(data.through) - start) / 86400000 + 1) / 7);
  const width = 30 + weeks * 13;
  const assets = {};
  for (let level = 0; level < 5; level++) assets[`assets/calendar/day-${level}.svg`] = themedSvg(13, 13, `<rect x="0" y="0" width="10" height="10" rx="2" fill="var(--c${level})" stroke="var(--fg)" stroke-opacity=".05"/>`);
  assets['assets/calendar/blank.svg'] = themedSvg(13, 13, '');
  for (const day of ['mon', 'wed', 'fri']) assets[`assets/calendar/${day}.svg`] = themedSvg(30, 13, `<text y="10" fill="var(--fg)" font-size="12" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">${day[0].toUpperCase() + day.slice(1)}</text>`);
  let lastMonth = -1;
  const months = [];
  const monthFormat = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
  for (let week = 0; week < weeks; week++) {
    const date = addDays(start, week * 7);
    if (date.getUTCMonth() !== lastMonth && week < weeks - 1) {
      months.push(`<text x="${30 + week * 13}" y="12">${monthFormat.format(date)}</text>`);
      lastMonth = date.getUTCMonth();
    }
  }
  assets['assets/calendar/months.svg'] = themedSvg(width, 18, `<g fill="var(--fg)" font-size="12" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">${months.join('')}</g>`);
  const legend = [`<text x="${width - 139}" y="15">Less</text>`];
  for (let i = 0; i < 5; i++) legend.push(`<rect x="${width - 108 + i * 13}" y="6" width="10" height="10" rx="2" fill="var(--c${i})"/>`);
  legend.push(`<text x="${width - 38}" y="15">More</text>`);
  assets['assets/calendar/legend.svg'] = themedSvg(width, 22, `<g fill="var(--muted)" font-size="12" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">${legend.join('')}</g>`);
  return assets;
}

export function renderHoverCalendar(input) {
  const data = validateCounts(input);
  const start = calendarStart(data.through);
  const days = Math.round((Date.parse(data.through) - start) / 86400000) + 1;
  const weeks = Math.ceil(days / 7);
  const width = 30 + weeks * 13;
  const values = Object.values(data.days).filter(n => n > 0).sort((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75].map(q => values[Math.max(0, Math.ceil(values.length * q) - 1)] || 1);
  const monthFormat = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' });
  // GitHub's README sanitizer drops <a> without href and wraps bare <img> in a
  // link to the image, so: <picture> stops the auto-link, and a <span title>
  // carries the native tooltip without making the day clickable. align="top"
  // keeps each row exactly as tall as its images.
  const image = (file, w, h, alt = '') => `<picture><img src="./assets/calendar/${file}.svg" width="${w}" height="${h}" align="top" alt="${escapeXml(alt)}"></picture>`;
  const rows = [image('months', width, 18, 'Months')];
  for (let day = 0; day < 7; day++) {
    const weekday = { 1: 'mon', 3: 'wed', 5: 'fri' }[day];
    let row = image(weekday || 'blank', 30, 13, weekday || '');
    for (let week = 0; week < weeks; week++) {
      const offset = week * 7 + day;
      if (offset >= days) { row += image('blank', 13, 13); continue; }
      const date = addDays(start, offset);
      const count = data.days[iso(date)] || 0;
      const level = count === 0 ? 0 : 1 + thresholds.filter(n => count > n).length;
      row += `<span title="${escapeXml(dayTitle(count, date, monthFormat))}">${image(`day-${level}`, 13, 13)}</span>`;
    }
    rows.push(row);
  }
  rows.push(image('legend', width, 22, 'Less to more commits'));
  const total = Object.values(data.days).reduce((sum, n) => sum + n, 0).toLocaleString('en-US');
  // GitHub styles <kbd> with a 10px line height, so 13px day images sit 13px
  // apart like the real contribution graph. The table cell's nowrap keeps rows
  // intact on narrow screens; the table scrolls instead.
  return `<!-- BEGIN COMMIT ACTIVITY -->\n<a name="commit-calendar"></a>\n<p>${total} commits in the last year (GitHub + GitLab)</p>\n<table><tr><td nowrap><kbd>\n${rows.join('<br>\n')}\n</kbd></td></tr></table>\n<!-- END COMMIT ACTIVITY -->`;
}

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

// Same wording as GitHub's own graph, e.g. "No commits on November 9th."
export function dayTitle(count, date, monthFormat = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })) {
  const amount = count === 0 ? 'No commits' : `${count.toLocaleString('en-US')} ${count === 1 ? 'commit' : 'commits'}`;
  return `${amount} on ${monthFormat.format(date)} ${ordinal(date.getUTCDate())}.`;
}

export function replaceCalendarBlock(readme, calendar) {
  const pattern = /<!-- BEGIN COMMIT ACTIVITY -->[\s\S]*?<!-- END COMMIT ACTIVITY -->/g;
  const matches = readme.match(pattern);
  if (matches?.length !== 1) throw new Error('Expected exactly one marked calendar block');
  return readme.replace(pattern, () => calendar);
}
