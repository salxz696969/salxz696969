import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLogs } from './sync.mjs';
import { calendarStart, iso, renderCalendar, validateCounts } from './calendar.mjs';
import { renderLanguages } from './languages.mjs';
import { combineCounts } from './github-commits.mjs';
import { renderHoverCalendar, renderHoverAssets, replaceCalendarBlock, hoverAssetPaths, dayTitle } from './hover-calendar.mjs';
import { needsRefresh } from './refresh.mjs';

const sha = n => String(n).padStart(40, '0');
const line = (n, email, date) => `${sha(n)}\t${email}\t${date}\n`;

test('counts only matching authors, deduplicates branches/repos, preserves author day', () => {
  const own = line(1, 'me@example.test', '2026-11-12T00:30:00+07:00');
  const data = aggregateLogs([own + line(2, 'someone@example.test', '2026-11-12T00:00:00Z'), own + line(3, 'alias@example.test', '2026-11-11T10:00:00Z') + line(4, 'me@example.test', '2020-01-01T00:00:00Z')], ['ME@example.test', 'alias@example.test'], '2026-11-12');
  assert.deepEqual(data.days, { '2026-11-11': 1, '2026-11-12': 1 });
  assert.deepEqual(Object.keys(data).sort(), ['days', 'through', 'version']);
});

test('matches Sunday-aligned GitHub range and omits future days', () => {
  assert.equal(iso(calendarStart('2026-11-12')), '2025-11-09');
  assert.equal(calendarStart('2024-02-29').getUTCDay(), 0);
  const svg = renderCalendar({ version: 1, through: '2026-11-12', days: {} });
  assert.equal((svg.match(/<title>0 commits on/g) || []).length, 369);
  assert.ok(!svg.includes('2026-11-13'));
});

test('rejects metadata or malformed aggregate values before publishing', () => {
  for (const data of [
    { version: 1, through: '2026-11-12', days: {}, repository: 'private' },
    { version: 1, through: '2026-11-12', days: { '2026-11-12': -1 } },
    { version: 1, through: '2026-11-12', days: { '2026-02-30': 1 } },
    { version: 1, through: '2026-11-12', days: { '2026-11-13': 1 } },
  ]) assert.throws(() => validateCounts(data));
});

test('renders both themes and safely escapes language labels', () => {
  for (const theme of ['light', 'dark']) {
    const svg = renderCalendar({ version: 1, through: '2026-11-12', days: { '2026-11-12': 3 } }, theme);
    assert.match(svg, /3 commits in the last year/);
    assert.ok(!svg.includes('undefined'));
    const languages = renderLanguages([{ name: '<script>', bytes: 10 }], theme);
    assert.ok(!languages.includes('<script>'));
    assert.ok(languages.includes('&lt;script&gt;'));
    assert.ok(!languages.includes('NaN'));
  }
});

test('combines GitHub and GitLab daily counts without retaining source details', () => {
  const data = combineCounts({ version: 1, through: '2026-11-12', days: { '2026-11-12': 4 } }, { '2026-11-11': 2, '2026-11-12': 3 });
  assert.deepEqual(data, { version: 1, through: '2026-11-12', days: { '2026-11-11': 2, '2026-11-12': 7 } });
  const svg = renderCalendar(data);
  assert.match(svg, /9 commits in the last year/);
  assert.ok(!svg.includes('GitLab'));
  assert.ok(!svg.includes('GitHub'));
});

test('README day images expose only dates and amounts through native hover titles', () => {
  const data = { version: 1, through: '2026-11-12', days: { '2026-11-12': 23, '2026-11-11': 1 } };
  const html = renderHoverCalendar(data);
  assert.equal((html.match(/ title="/g) || []).length, 369);
  assert.ok(html.includes('<span title="23 commits on November 12th.">'));
  assert.ok(html.includes('<span title="1 commit on November 11th.">'));
  assert.ok(html.includes('<span title="No commits on November 9th.">'));
  assert.equal([...html.matchAll(/title="([^"]+)"/g)].at(-1)[1], 'No commits on November 7th.');
  assert.equal(html.match(/November 13th/g)?.length, 1); // 2025 only, not the future 2026 day
  assert.ok(!/<script|onclick|style=/.test(html));
  // Hover only: no clickable links, and every image sits in <picture> so
  // GitHub does not auto-link it to the raw SVG.
  assert.ok(!/<a [^>]*href=/.test(html));
  assert.equal((html.match(/<img /g) || []).length, (html.match(/<picture><img /g) || []).length);
  assert.ok(html.includes('<div><sub><div>'));
  assert.ok(html.includes('alt="24 commits in the last year (GitHub + GitLab)"'));
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(d => dayTitle(0, new Date(Date.UTC(2026, 0, d))).split(' ')[4]), ['1st.', '2nd.', '3rd.', '4th.', '11th.', '12th.', '13th.', '21st.', '22nd.', '23rd.', '31st.']);
  // Every line spans the same width (GitHub's 747px box for 53 weeks), so the
  // drawn border lines up; rows are joined so they never wrap.
  const lines = html.split('<br>\n').slice(1);
  assert.equal(lines.length, 9);
  for (const l of lines) assert.equal([...l.matchAll(/width="(\d+)"/g)].reduce((s, m) => s + Number(m[1]), 0), 747);
  assert.ok(lines.every(l => !/><picture|><span/.test(l.replace(/<span title="[^"]*"><picture>/g, '<picture>'))));
  const assets = renderHoverAssets(data);
  assert.deepEqual(Object.keys(assets).sort(), [...hoverAssetPaths].sort());
  assert.ok(Object.values(assets).every(svg => !svg.includes('undefined') && !svg.includes('NaN')));
  assert.match(assets['assets/calendar/heading.svg'], />24 commits in the last year \(GitHub \+ GitLab\)</);
  assert.match(assets['assets/calendar/month-0.svg'], />Nov</);
  assert.match(assets['assets/calendar/month-12.svg'], />Nov</); // final two weeks, as on GitHub
  assert.ok(!assets['assets/calendar/month-13.svg'].includes('<text'));
  assert.ok(!assets['assets/calendar/row-left.svg'].includes('font-face'));
});

test('refresh replaces only its marked README block and refuses missing/duplicate markers', () => {
  const block = '<!-- BEGIN COMMIT ACTIVITY -->old<!-- END COMMIT ACTIVITY -->';
  const replacement = '<!-- BEGIN COMMIT ACTIVITY -->new<!-- END COMMIT ACTIVITY -->';
  assert.equal(replaceCalendarBlock(`before\n${block}\nafter`, replacement), `before\n${replacement}\nafter`);
  assert.throws(() => replaceCalendarBlock('unmarked README', replacement));
  assert.throws(() => replaceCalendarBlock(block + block, replacement));
});

test('background checks skip unchanged history and retry periodically for GitHub activity', () => {
  assert.equal(needsRefresh(null, 'a', 1), true);
  assert.equal(needsRefresh({ signature: 'a', checkedAt: 0 }, 'a', 1000), false);
  assert.equal(needsRefresh({ signature: 'a', checkedAt: 0 }, 'b', 1000), true);
  assert.equal(needsRefresh({ signature: 'a', checkedAt: 0 }, 'a', 21600000), true);
});
