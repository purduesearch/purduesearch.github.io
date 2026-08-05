# Officer & Admin Tools — walkthrough outline

This outline tracks the shipped `.steps.json` beside it. Keep them in step when you edit either.

## `admin-tour` — 8 steps, **0 real API calls**

**This is the only fully read-only hands-on tour in the curriculum, and that is a deliberate safety
decision.** Every action on the admin surface is real and club-wide: approving a reward mints XP,
changing reward config changes what work is worth for everyone, and role changes alter permissions.
There is no sandbox for any of it — a training project cannot contain a club-level setting.

So the tour points, explains, and never clicks anything that writes.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `nav.admin` | `click` | "Only officers see this link. Everything behind it is club-wide and real — this tour won't have you change anything." |
| 2 | `admin.rewards.pending` | `next` | "Task completions and time logs over two hours wait here. Clearing this often is the single most useful thing you do as an officer." |
| 3 | `admin.rewards.pending` | `next` | "Approve, or reject **with a reason**. A silent rejection teaches someone to stop logging time, and then the club loses the data." |
| 4 | `admin.rewards.config` | `next` | "What every event type is worth. Change these rarely, and announce it first — members plan around these numbers." |
| 5 | `admin.integrations` | `next` | "Google Drive, and the connections that let files and meeting notes flow in. Set once, then left alone." |
| 6 | `admin.members` | `next` | "Roles, project membership, and GitHub logins. Role is what governs permissions — rank never does." |
| 7 | `nav.projects` | `next` | "Officers also see every project, including ones they aren't a member of. Use that to unstick things, not to browse." |
| 8 | `admin.rewards.pending` | `next` | "Two things to remember: clear the queue often, and change the numbers rarely and in public." |

**Design notes**

- Steps 2 and 3 both anchor on the pending queue on purpose. The first says what it is; the second
  says how to use it. Splitting them means the rejection guidance gets its own beat instead of being
  the tail of a longer card.
- Step 1's copy promises the tour won't change anything. **That promise is load-bearing** — an officer
  who thinks a training tour might approve a real reward will quit the tour, and rightly.
- If the launch card is opened by a non-admin, it renders as a locked explanation rather than a
  launch button. The gate checks the same permission `/clubpm/admin` does, so the tour cannot start
  and then dead-end on step 1.
- Deliberately **no** step for GitHub app installation or Slack workspace configuration. Those are
  one-time setup performed by one person, and a walkthrough is the wrong medium for something done
  once every four years.
