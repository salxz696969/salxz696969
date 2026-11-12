import { execFileSync } from 'node:child_process';
import { calendarStart, iso, addDays } from './calendar.mjs';

export function collectGithubCommits(owner, through) {
  const counts = {};
  const end = new Date(`${through}T00:00:00Z`);
  // Monthly windows stay below the 100 daily-contribution pagination limit.
  // Request only dates and amounts, never repository names or commit details.
  let start = calendarStart(through);
  while (start <= end) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const stop = addDays(next, -1) < end ? addDays(next, -1) : end;
    const query = 'query($owner:String!,$from:DateTime!,$to:DateTime!){user(login:$owner){contributionsCollection(from:$from,to:$to){commitContributionsByRepository(maxRepositories:100){contributions(first:100){nodes{occurredAt commitCount}pageInfo{hasNextPage}}}}}}';
    const response = JSON.parse(execFileSync('gh', ['api', 'graphql', '--input', '-'], {
      input: JSON.stringify({ query, variables: { owner, from: `${iso(start)}T00:00:00Z`, to: `${iso(stop)}T23:59:59Z` } }),
      encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    }));
    if (response.errors || !response.data?.user) throw new Error('GitHub commit counts unavailable');
    const repos = response.data.user.contributionsCollection.commitContributionsByRepository;
    if (repos.length >= 100) throw new Error('Repository contribution limit reached');
    for (const { contributions } of repos) {
      if (contributions.pageInfo.hasNextPage) throw new Error('Daily contribution limit reached');
      for (const { occurredAt, commitCount } of contributions.nodes) {
        const date = occurredAt.slice(0, 10);
        counts[date] = (counts[date] || 0) + commitCount;
      }
    }
    start = next;
  }
  return counts;
}

export function combineCounts(local, github) {
  const days = { ...local.days };
  for (const [date, count] of Object.entries(github)) days[date] = (days[date] || 0) + count;
  return { version: 1, through: local.through, days: Object.fromEntries(Object.entries(days).sort()) };
}
