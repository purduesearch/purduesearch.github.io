# S01 — The rank ladder (deck outline)

| | |
|---|---|
| **Course / section** | Constellation 101 · M4 · "The rank ladder" |
| **Kind** | SLIDES — built as a deck, exported to PDF, imported through the slides workbench |
| **Slides** | 11 |
| **Narration** | Optional. If recorded, sync per-slide start times in the workbench. |
| **Overlay questions** | 2 (slides 5 and 9) |
| **Built** | ☐ |

## Why a deck and not a video

The rank ladder is a **reference table** — seven tiers with thresholds people will come back to look
up. A video makes that un-scannable. A deck keeps it as an image the learner can page back to, and
the slides workbench extracts the text, so the thresholds stay searchable.

## Slides

### 1 · Title
"How Constellation keeps score." Rank badge artwork, no body text.

### 2 · Two currencies, one sentence each
- **XP** — a permanent record of contribution. Only ever goes up. Drives your rank.
- **Doubloons** — a currency you spend in the shop on cosmetics.

Deliberately side by side. Confusing these is the #1 misconception and Q04 tests it.

### 3 · The ladder
Full-width table, the slide people will screenshot:

| Rank | XP |
|---|---|
| Nestling | 0 |
| Fledgling | 250 |
| Cadet | 1,000 |
| Specialist | 3,000 |
| Pioneer | 7,000 |
| Cosmonaut | 13,000 |
| Celestial | 21,000 |

> Thresholds must be read off the `Rank` enum in `schema.prisma` at build time, not from this file.
> If the enum changes and this slide doesn't, the course starts lying.

### 4 · What earns XP
Icon list, one line each: completing a task · logging time · hitting a milestone · receiving kudos ·
publishing a blog post · early delivery.

Closing line: **opening the app earns nothing.** Attendance is not contribution.

### 5 · Rank is recognition, not permission
Single sentence, large. A Nestling and a Celestial with the same role can do exactly the same things.

**Overlay question (SINGLE):** *Does reaching Cosmonaut unlock features a Cadet can't use?*
→ No — rank changes nothing about what you're allowed to do.
*Rewind to slide 5 on a wrong answer.*

### 6 · The approval gate
Task-completion rewards and time logs over two hours queue for an officer.

Framed as credibility, not suspicion: an XP number nobody can inflate is an XP number that means
something in a recommendation letter.

### 7 · Quests
Daily, weekly, monthly. Rotate at midnight UTC. Same set for everyone. **You claim them** — they
aren't paid automatically.

### 8 · Achievements
One-off and permanent. Mostly hidden until triggered. For the things nobody would set as a goal but
everyone appreciates.

### 9 · The shop
Cosmetics only — frames, name styles, effects. Nothing functional, ever.

**Overlay question (SINGLE):** *Can doubloons buy anything that changes what you can do in
Constellation?*
→ No — the moment currency buys capability, people start picking work for the wrong reasons.
*Rewind to slide 9 on a wrong answer.*

### 10 · Streaks
Consecutive days with real activity. Reset at 02:00. Opening the app doesn't count.

### 11 · The point
Closing slide: club work is volunteer work, and volunteer work nobody notices is work that stops
happening. This system is the noticing.

## Production notes

- Build in Google Slides at 16:9, using the ClubPM dark palette (`--pm-bg-base`, `--pm-accent-teal`,
  `--pm-accent-amber`). Export to PDF and import via the slides workbench.
- Slide 3 is the one people screenshot. Give it room — no footer, no decoration.
- Speaker notes are typed per slide in the workbench after import; PDF export doesn't carry them.
- If narration is recorded, the two overlay questions still gate advancing. Don't duplicate their
  content in the VO or the answer becomes free.
