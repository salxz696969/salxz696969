import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLogs } from './sync.mjs';
import { calendarStart, iso, renderCalendar, validateCounts } from './calendar.mjs';
import { renderLanguages } from './languages.mjs';
import { combineCounts } from './github-commits.mjs';
import { renderHoverCalendar, renderHoverAssets, replaceCalendarBlock, hoverAssetPaths } from './hover-calendar.mjs';
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
  assert.ok(html.includes('title="23 commits on November 12, 2026"'));
  assert.ok(html.includes('title="1 commit on November 11, 2026"'));
  assert.ok(!html.includes('November 13, 2026'));
  assert.ok(!/<script|<a\s|onclick|style=/.test(html));
  const assets = renderHoverAssets(data);
  assert.deepEqual(Object.keys(assets).sort(), [...hoverAssetPaths].sort());
  assert.ok(Object.values(assets).every(svg => !svg.includes('undefined')));
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
