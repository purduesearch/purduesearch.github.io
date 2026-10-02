# Constellation patch notes

Members see patch notes at `/clubpm/patch-notes`. To open the page, use **Other → What's new** in the
sidebar, or **More → Help → What's new** on a phone. The notes come from git history.
Nobody writes them by hand.

## How it works

1. **Each morning, the release workflow runs.** `.github/workflows/patch-notes.yml` runs at
   10:00 UTC (6 a.m. Eastern in summer, 5 a.m. in winter). It runs
   `node scripts/patch-notes.mjs release`. That command reads the commits on `main` since the last
   `constellation-v*` tag. If any of them are member-facing, it tags `main` as the next version,
   pushes the tag, and starts the Pages deploy. If none are member-facing, it makes no tag.
2. **The version is the tag.** Each release is an annotated tag named `constellation-vX.Y.Z`. The
   tag message holds that release's notes, so `git show constellation-v1.4.0` prints them. No
   file, database row, or counter stores a version.
3. **Every build turns tags into notes.** The `prebuild` and `prestart` scripts run
   `node scripts/patch-notes.mjs generate`. It writes `public/constellation-patch-notes.json`
   (gitignored). A release's notes are the member-facing commits between its tag and the
   previous tag. Because the notes are rebuilt from history on every build, fixing a rule or a
   label also fixes old releases. Versions never change, because tags never move.

## What counts as a member-facing commit

All the rules are in `CONFIG` at the top of `scripts/patch-notes.core.mjs`.

- The commit uses the [Conventional Commits](https://www.conventionalcommits.org/) type
  `feat` (listed under **New**), `perf` (**Improved**), or `fix` (**Fixed**). Other types, such as
  `refactor`, `chore`, `docs`, `test`, and `ci`, are left out. Commits that do not follow the
  convention are also left out, and so are merge commits.
- The commit touches Constellation code: `backend/`, `src/pages/ClubPM/`,
  `src/components/clubpm/`, `src/clubpm/`, `src/api/clubPmClient.js`, or
  `public/clubpm-theme.css`. Test files and Markdown files in those paths do not count. A
  public-site-only `feat` is left out.
- The note text is the subject after the colon, with the first letter capitalized. The scope
  becomes a small label: `feat(lab): …` shows as **Lab**.

## Writing commits that read well

The subject is what members read, so describe the change from the member's point of view:

```
feat(lab): check in to the lab by scanning the QR code on the door
fix(chat): keep the composer above the phone keyboard
```

To change the note without changing the subject, add a `Patch-Note` trailer as the last
paragraph of the commit message:

```
feat(lab): LabVisit model, TimeLog.labVisitId, and pure visit core

Patch-Note: Lab time now logs itself when you check out
```

| Trailer | Effect |
|---|---|
| `Patch-Note: <text>` | Uses `<text>` as the note. The trailer also forces a note for a commit that the rules would leave out. A non-`feat`/`perf`/`fix` commit forced this way goes under **Improved**. |
| `Patch-Note: skip` | Leaves the commit out, even if it is a member-facing `feat` or `fix`. |

For a squash-merged pull request, put the trailer in the squash commit message. For a commit
that is already pushed, use `CONFIG.overrides` instead (see **Everyday tasks**).

## Version numbers

- If a release has at least one **New** item, the minor version goes up (`1.4.2` → `1.5.0`).
  Otherwise, the patch version goes up (`1.4.2` → `1.4.3`).
- The first run makes the `1.0.0` baseline tag. That release has no notes, and the notes start
  after it.
- Major versions are never automatic. To make one, tag `main` by hand before the next morning
  run. The next release continues from your tag:

  ```bash
  git tag -a constellation-v2.0.0 -m "Constellation 2.0.0" origin/main
  git push origin constellation-v2.0.0
  ```

## Everyday tasks

| Task | How |
|---|---|
| See what tomorrow's release will contain | `npm run patch-notes:preview`, or run the workflow with **dry run** checked |
| Release now instead of waiting for morning | Actions → **Constellation Patch Notes** → Run workflow |
| Fix the wording of a past note, or hide it | Add `'<sha>': 'New wording'` (or `'skip'`) to `CONFIG.overrides` in `scripts/patch-notes.core.mjs`. The page shows the change after the next deploy. Each note's short SHA is in the generated JSON. |
| Change which paths or types count | Edit `CONFIG` in `scripts/patch-notes.core.mjs`, then run `npm run test:scripts` |
| Change the release time | Edit the `cron` line in `.github/workflows/patch-notes.yml` (the time is UTC) |
| Remove a bad release | `git push origin :refs/tags/constellation-vX.Y.Z`, then run the Pages deploy again. Its commits move into the next release. |

## Requirements that keep this working

- **`deploy.yml` checks out with `fetch-depth: 0`.** A shallow clone has no tags. In that case,
  `generate` writes an empty file and logs a warning; it does not fail the build.
- **The release workflow needs `contents: write` and `actions: write`.** A tag push made with
  `GITHUB_TOKEN` does not trigger other workflows, so the workflow starts the deploy with
  `gh workflow run deploy.yml`. If a tag ruleset ever blocks `constellation-v*` for
  `github-actions[bot]`, the push step fails and is visible in the Actions tab.
- **Never move or rewrite a published tag.** Members' "New to you" markers compare version
  numbers, which they store in `localStorage` under `cpm.patchNotes.seen`.
