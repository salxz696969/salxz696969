# Profile cards

The calendar combines GitLab and GitHub commits into one daily amount, following GitHub's calendar layout and current light/dark palettes. No platform breakdown appears in the image or data. The local portion counts unique authored commits reachable from the configured remote branches, including merges, using each commit's original author date. Set `includeLocalCommits` to include local branches before pushing. The GitHub portion uses the account's qualifying commit contributions. The destination profile repository is excluded, so generated card updates do not inflate the total. Repository identities are used privately for that filter; only dates and amounts are published. It is a separate README image, not GitHub's native contribution graph. Deleted branches can stop contributing unless their commits remain reachable elsewhere. Source repositories should not be mirrored to GitHub, which would count the same work on both platforms.

Only daily dates and totals leave the source computer. The public data file has three fields: `version`, `through`, and `days`. It contains no repository names, source code, paths, commit messages, commit hashes, identities, or credentials. The renderer and publisher only write explicitly allowed aggregate/image files and the marked README calendar block. Private source configuration lives outside this repository.

The README uses separate day images with native HTML `title` attributes, so hovering a day displays only its date and amount directly in the README. Shared SVG tiles keep image requests small. GitHub's Markdown renderer preserves these titles. This uses the browser's standard tooltip; it does not require scripts, a separate page, or a hosting service. On touch devices there is no mouse hover. The README's table scrolls horizontally on small screens.

The language card uses GitHub's language byte counts from **public, non-fork GitHub repositories only**. It shows six languages with percentages based on all detected languages. It does not measure private work or personal skill. Both cards are checked into this repository, so viewing the README does not depend on an external stats service.

## Refresh

Requires Node.js 22+, Git, and an authenticated GitHub CLI. Keep a private JSON config **outside this checkout**, with `repositories` (absolute source checkout paths), `emails` (your author email addresses), `timeZone`, `githubRepository` (`owner/name`), and `githubBranch`.

```powershell
# Prepare cards locally without publishing:
node scripts/sync.mjs --config <private-config-path>

# Refresh and publish only the whitelisted aggregate/card files and calendar block:
node scripts/sync.mjs --config <private-config-path> --publish

# Test counting, date boundaries, output validation, and rendering:
node --test scripts/calendar.test.mjs
```

The laptop's hidden scheduled check runs every five minutes. `scripts/refresh.mjs` compares a private fingerprint of local branch heads and skips expensive collection when nothing changed. It also checks GitHub activity at least every six hours while the laptop is running. With `onlyWhenCountsChange` enabled, it publishes only when the combined daily amounts change, preventing empty daily update commits. No Git hooks or company working files are modified.

The local scheduled refresh requires the laptop to be awake and online, the source checkouts to remain available, and Git/GitHub authentication to remain valid. Images remain readable when the laptop is offline. `through` records the published collection date. Public language totals are cached locally for one day. A failed source fetch aborts the refresh instead of publishing partial activity. No VPS service or web hosting is required.

Publishing uses an atomic GitHub commit with an expected branch head. The refresh reads the latest remote README and replaces only the block between its `COMMIT ACTIVITY` markers, preserving other edits. If the README changes concurrently, the refresh fails safely and can retry later. The refresh never changes source branches, stages source files, or uploads source repositories.
