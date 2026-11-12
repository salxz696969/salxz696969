import { readFileSync } from 'node:fs';
import { themes, escapeXml, calendarStart, addDays, iso, validateCounts } from './calendar.mjs';

// Geometry copied from GitHub's own contribution graph (measured on the
// profile page): a 1px rounded box, 10px cells on a 13px pitch, labels in
// Mona Sans 12px, the legend's squares on a 14px pitch.
const PITCH = 13;
const LEFT = 46; // box edge to the first column
const RIGHT = 12; // last column to the box edge
const TOP = 35; // box edge to the first row
const BOTTOM = 35; // last row to the box edge
const HEADING = 32; // 24px heading line + 8px gap above the box
const MAX_MONTHS = 14;

const fontData = name => readFileSync(new URL(`../assets/fonts/${name}`, import.meta.url)).toString('base64');
let fonts;
const fontFace = kind => {
  fonts ||= { label: fontData('mona-sans-label.woff2'), heading: fontData('mona-sans-heading.woff2') };
  return `@font-face{font-family:M;src:url(data:font/woff2;base64,${fonts[kind]}) format("woff2")}text{font-family:M,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}`;
};

const cellBorder = { light: 'rgba(31,35,40,.05)', dark: 'rgba(1,4,9,.05)' };
const vars = theme => `--fg:${themes[theme].foreground};--muted:${themes[theme].muted};--border:${themes[theme].border};--cell-border:${cellBorder[theme]};${themes[theme].cells.map((c, i) => `--c${i}:${c}`).join(';')}`;

function svg(width, height, content, font) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>:root{${vars('light')}}@media(prefers-color-scheme:dark){:root{${vars('dark')}}}${font ? fontFace(font) : ''}</style>${content}</svg>\n`;
}

const cell = (x, y, level) => `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="var(--c${level})"/><rect x="${x + 0.5}" y="${y + 0.5}" width="9" height="9" rx="1.5" fill="none" stroke="var(--cell-border)"/>`;
const line = d => `<path d="${d}" fill="none" stroke="var(--border)"/>`;
const label = (x, y, text, color = 'fg') => `<text x="${x}" y="${y}" fill="var(--${color})" font-size="12">${escapeXml(text)}</text>`;

const file = name => `assets/calendar/${name}.svg`;
export const hoverAssetPaths = [
  ...[0, 1, 2, 3, 4].map(level => file(`day-${level}`)), file('blank'), file('heading'),
  file('top-left'), file('top-right'), ...Array.from({ length: MAX_MONTHS }, (_, i) => file(`month-${i}`)),
  file('row-left'), file('row-left-mon'), file('row-left-wed'), file('row-left-fri'), file('row-right'),
  file('bottom-left'), file('bottom'), file('legend'), file('bottom-right'),
];

function layout(input) {
  const data = validateCounts(input);
  const start = calendarStart(data.through);
  const days = Math.round((Date.parse(data.through) - start) / 86400000) + 1;
  const weeks = Math.ceil(days / 7);
  const values = Object.values(data.days).filter(n => n > 0).sort((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75].map(q => values[Math.max(0, Math.ceil(values.length * q) - 1)] || 1);
  // Like GitHub: a month owns the weeks whose Sunday falls in it, and its
  // label shows only when it spans at least two weeks.
  const monthFormat = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
  const months = [];
  for (let week = 0; week < weeks; week++) {
    const month = addDays(start, week * 7).getUTCMonth();
    if (months.at(-1)?.month === month) months.at(-1).span++;
    else months.push({ month, span: 1, name: monthFormat.format(addDays(start, week * 7)) });
  }
  if (months.length > MAX_MONTHS) throw new Error('Too many month segments');
  const total = Object.values(data.days).reduce((sum, n) => sum + n, 0);
  return { data, start, days, weeks, thresholds, months, legendWeeks: 12, heading: `${total.toLocaleString('en-US')} commits in the last year (GitHub + GitLab)` };
}

export function renderHoverAssets(input) {
  const { weeks, months, legendWeeks, heading } = layout(input);
  const width = LEFT + weeks * PITCH + RIGHT;
  const assets = {};
  for (let level = 0; level < 5; level++) assets[file(`day-${level}`)] = svg(PITCH, PITCH, cell(0, 0, level));
  assets[file('blank')] = svg(PITCH, PITCH, '');
  assets[file('heading')] = svg(headingWidth(heading, width), HEADING, `<text x="0" y="18" fill="var(--fg)" font-size="16">${escapeXml(heading)}</text>`, 'heading');
  // Box top: rounded corners, then month labels whose baseline sits 30px down.
  assets[file('top-left')] = svg(LEFT, TOP, line(`M.5 ${TOP}V6A5.5 5.5 0 0 1 6 .5H${LEFT}`));
  assets[file('top-right')] = svg(RIGHT, TOP, line(`M0 .5H6A5.5 5.5 0 0 1 11.5 6V${TOP}`));
  for (let i = 0; i < MAX_MONTHS; i++) {
    const segment = months[i];
    const w = (segment?.span || 1) * PITCH;
    assets[file(`month-${i}`)] = svg(w, TOP, line(`M0 .5H${w}`) + (segment && segment.span >= 2 ? label(0, 30, segment.name) : ''), segment?.span >= 2 ? 'label' : undefined);
  }
  // Day rows: Mon/Wed/Fri labels 15px from the edge, baseline 9px below the cell top.
  assets[file('row-left')] = svg(LEFT, PITCH, line(`M.5 0V${PITCH}`));
  for (const day of ['Mon', 'Wed', 'Fri']) assets[file(`row-left-${day.toLowerCase()}`)] = svg(LEFT, PITCH, line(`M.5 0V${PITCH}`) + label(15, 9, day), 'label');
  assets[file('row-right')] = svg(RIGHT, PITCH, line(`M11.5 0V${PITCH}`));
  // Box bottom: legend squares 8px below the last row, on a 14px pitch.
  assets[file('bottom-left')] = svg(LEFT, BOTTOM, line(`M.5 0V29A5.5 5.5 0 0 0 6 34.5H${LEFT}`));
  assets[file('bottom')] = svg(PITCH, BOTTOM, line(`M0 34.5H${PITCH}`));
  const legendWidth = legendWeeks * PITCH;
  const squares = [0, 1, 2, 3, 4].map(level => cell(29 + level * 14, 8, level)).join('');
  assets[file('legend')] = svg(legendWidth, BOTTOM, line(`M0 34.5H${legendWidth}`) + label(2.7, 18, 'Less', 'muted') + squares + label(98.7, 18, 'More', 'muted'), 'label');
  assets[file('bottom-right')] = svg(RIGHT, BOTTOM, line(`M0 34.5H6A5.5 5.5 0 0 0 11.5 29V0`));
  return assets;
}

// Generous estimate of Mona Sans 16px text width, so the heading never clips.
const headingWidth = (text, max) => Math.min(max, Math.ceil(text.length * 8.5) + 8);

export function renderHoverCalendar(input) {
  const { data, start, days, weeks, thresholds, months, legendWeeks, heading } = layout(input);
  const width = LEFT + weeks * PITCH + RIGHT;
  const dayFormat = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' });
  // GitHub's README sanitizer drops <a> without href and wraps bare <img> in a
  // link to the image, so <picture> stops the auto-link and a <span title>
  // carries the native tooltip without making the day clickable.
  const image = (name, w, h, alt = '') => `<picture><img src="./${file(name)}" width="${w}" height="${h}" align="top" alt="${escapeXml(alt)}"></picture>`;
  // Word joiners stop rows from wrapping on narrow screens.
  const join = parts => parts.join('&#8288;');
  const lines = [image('heading', headingWidth(heading, width), HEADING, heading)];
  lines.push(join([image('top-left', LEFT, TOP), ...months.map((m, i) => image(`month-${i}`, m.span * PITCH, TOP)), image('top-right', RIGHT, TOP)]));
  for (let day = 0; day < 7; day++) {
    const parts = [image({ 1: 'row-left-mon', 3: 'row-left-wed', 5: 'row-left-fri' }[day] || 'row-left', LEFT, PITCH)];
    for (let week = 0; week < weeks; week++) {
      const offset = week * 7 + day;
      if (offset >= days) { parts.push(image('blank', PITCH, PITCH)); continue; }
      const date = addDays(start, offset);
      const count = data.days[iso(date)] || 0;
      const level = count === 0 ? 0 : 1 + thresholds.filter(n => count > n).length;
      parts.push(`<span title="${escapeXml(dayTitle(count, date, dayFormat))}">${image(`day-${level}`, PITCH, PITCH)}</span>`);
    }
    parts.push(image('row-right', RIGHT, PITCH));
    lines.push(join(parts));
  }
  lines.push(join([image('bottom-left', LEFT, BOTTOM), ...Array.from({ length: weeks - legendWeeks }, () => image('bottom', PITCH, BOTTOM)), image('legend', legendWeeks * PITCH, BOTTOM, 'Less to more commits'), image('bottom-right', RIGHT, BOTTOM)]));
  // <sub> sets line-height: 0 in GitHub's stylesheet; the inner <div> inherits
  // it, so every line is exactly as tall as its images and rows sit 13px apart.
  return `<!-- BEGIN COMMIT ACTIVITY -->\n<div><sub><div><a name="commit-calendar"></a>\n${lines.join('<br>\n')}\n</div></sub></div>\n<!-- END COMMIT ACTIVITY -->`;
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
