# C04 — What earns recognition, and what doesn't

> CONTENT section · Constellation 101 · M4 · ~3 min read
> Follows the rank-ladder deck and the rewards walkthrough. The deck is the reference table; this is
> the part that explains the design, including the bits that look unfair until you know why.
> **Deliberately contains no XP threshold numbers** — those live on S01, generated from the `Rank`
> enum, so there is exactly one place for them to go stale.

---

You've seen the ladder and you've been round quests, the shop, and your profile. Here's the part
nobody puts on a slide: what this system is actually measuring, and what it refuses to measure.

## Two currencies, and they don't mix

| | **XP** | **Doubloons** |
|---|---|---|
| What it is | A permanent record of contribution | A currency |
| Direction | Only ever goes up | Goes up when earned, down when spent |
| What it drives | Your rank | What's in your inventory |
| What it buys | Nothing. It isn't spendable | Cosmetics — frames, name styles, effects |
| Can you lose it? | No | Yes, by spending it, which is the point |

Spending doubloons never costs you rank. They're separate ledgers that happen to be earned by the
same actions.

## What actually earns XP

Every grant traces back to one of a small set of events:

| Event | Roughly when |
|---|---|
| **Task completed** | You finish a task — valued differently depending on whether you or an officer created it |
| **Time logged** | Per hour recorded against a task |
| **Milestone hit** | A milestone you contributed to lands |
| **Kudos received** | Somebody else recognises your work |
| **Blog post published** | A post you wrote goes live on the public site |
| **Early delivery** | Finishing meaningfully ahead of a due date |

Read that list again for what's missing. **Opening Constellation earns nothing. Reading a board
earns nothing. Being in the Slack channel earns nothing.** Attendance is not contribution, and a
system that pays for presence quickly fills up with presence.

> Officers can change what each event is worth. The numbers on your profile are configuration, not
> physics — but they're announced before they change, because members plan around them.

## The task-completion split

Finishing a task somebody else assigned you and finishing one you invented for yourself are recorded
as two different event types, and they aren't necessarily worth the same.

That isn't a judgement about which is more valuable. It's a defence: without the split, the fastest
route to a high XP number is to create ten trivial tasks and close them. With it, that route is
visible and it's worth less.

## The approval gate

Task-completion rewards and any time log over two hours in one entry don't pay out immediately. They
queue for an officer.

This surprises people, and the surprise usually reads as "the club doesn't trust me." It isn't that.

> **An XP number nobody can inflate is an XP number that means something.**

The reason to track contribution at all is so it's worth citing — in a leadership application, in a
recommendation letter, in a sponsorship report that says what the club actually built. A number that
anyone could have manufactured in an afternoon is worth nothing in all three places. The gate is what
makes the ledger a credential instead of a scoreboard.

The corollary is on the officers: a queue left sitting for three weeks converts a credibility feature
into a delay. If yours is slow, say so — that's a fixable process problem, not a fact of life.

## Quests, achievements, and streaks

**Quests** rotate — daily, weekly, monthly, refreshing at midnight UTC. Everyone gets the same set,
so they're never personalised pressure. Two things to know: they're small on purpose, and **you have
to claim them.** A completed quest sitting unclaimed pays nothing.

**Achievements** are one-off and permanent, and most are hidden until you trigger them. They exist
for the things nobody would sensibly set as a goal but everyone appreciates when it happens.

**Streaks** count consecutive days with real activity, and reset in the small hours. Opening the app
doesn't count. If a streak breaks because you had exams, that's the system working correctly — it's
a record of what happened, not a demand.

> **Never let a streak drive a decision.** If you find yourself logging fifteen minutes of nothing at
> 11:50pm to keep a number alive, the number has started costing more than it's worth. Drop it.

## Rank is recognition, not permission

The single most important sentence in this module:

> **A Nestling and a Celestial with the same role can do exactly the same things.**

Rank changes your badge and nothing else. What you're permitted to do is governed by your **role**
and by which **projects** you're a member of. There is no feature behind a rank wall, there never
will be, and the shop sells cosmetics only for the same reason — the moment currency or rank buys
capability, people start choosing work for the wrong reasons.

## Why any of this exists

Club work is volunteer work. Volunteer work that nobody notices is work that quietly stops
happening — not out of resentment, just entropy.

This system is the noticing. It's not there to rank you against your friends; it's there so that the
Tuesday night somebody spent debugging a power board is a thing the club can see, remember, and
point at later.

Use it honestly and it does that job. Game it and you've built yourself a very elaborate number.

The quiz is next — four questions, 75% to pass, unlimited attempts.
