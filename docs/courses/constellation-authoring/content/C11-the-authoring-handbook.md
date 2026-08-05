# C11 — The authoring handbook

> CONTENT section · Authoring Courses & Content · M1 · ~4 min read
> Follows V10 and the authoring walkthrough. You've now seen the editor and built a draft course.
> This is the reference you keep — how to choose a section kind, how to write each one, and the two
> things about this system that will surprise you if nobody says them out loud.

---

You're going to write training material that someone takes seriously, once, on a Tuesday evening,
when they'd rather be doing something else. Everything below is in service of that.

## Choosing a section kind

Most authoring mistakes are this one decision, made backwards.

| Kind | Use it for | Cost to make | Cost to change |
|---|---|---|---|
| **CONTENT** | The "why". Prose read once. Reference tables | Low | Low |
| **QUIZ** | Retrieval — making it stick | Low | Low |
| **SLIDES** | Reference the learner will come *back* to | Medium | Medium |
| **VIDEO** | Anything where watching beats reading | **High** | **High** |
| **WALKTHROUGH** | Doing it, in the real product | Medium | Medium — and it's a code change |

### The decision, as questions

1. **Will they need to look this up again?** → SLIDES. A seven-row threshold table stays scannable in
   a deck; the same table in a video is buried in a timeline nobody wants to scrub.
2. **Do they need to see a person do it?** → VIDEO. Only for things that won't move next semester —
   re-recording is a whole afternoon.
3. **Do they need to *have done* it?** → WALKTHROUGH. Nothing else produces a habit.
4. **Is it context, reasoning, or a field-by-field reference?** → CONTENT.
5. **Have they just been told three things you want them to still know next week?** → QUIZ.

> **The classic error is a reference table in a video and a narrative in a slide deck.** Both feel
> fine while you're making them and both are useless to the learner six weeks later.

## Two things that will surprise you

### You can't author walkthroughs in the editor

Walkthrough steps target UI elements by **anchor id**. Those ids live in the code, so the steps live
in the repo beside them — as files, reviewed in a pull request.

This is not an oversight, and it isn't about permissions:

> If steps lived in the database, renaming a nav link would produce a clean pull request and a tour
> that breaks silently in production. Because they live in files, a build-time check fails the build
> and **names the step that broke.**

So the editor shows walkthrough steps read-only. Authoring one means editing a `.steps.json` file,
updating the anchor registry, and opening a PR — and the same commit has to carry all three, or the
check rejects it. That's the system working.

### Prose goes stale silently, and nothing catches it

The build check verifies anchors. It cannot read English. If a tab gets renamed, every video script,
content page, and quiz question that names the old label is now quietly wrong, and nobody finds out
until a learner does.

Which means: **when the UI changes, search the course directory for the old label.** That's a manual
habit, and it is the one this curriculum most depends on.

## Writing each kind well

### CONTENT

- **Lead with the thing they need, not the throat-clearing.** No "in this section we will explore."
- **Tables for anything with more than three parallel items.** Prose lists are unreadable at speed.
- **Give the reason, not just the rule.** A member who thinks a rule is pointless routes around it,
  and the routing-around is invisible to you.
- **Say the failure mode out loud.** "A board where everything is CRITICAL sorts identically to a
  board with no priorities" teaches more than three paragraphs of guidance.
- **End by pointing at what's next.** Momentum is cheap to provide.

### QUIZ

- **Every question carries an explanation, shown after grading.** A question that only says "wrong"
  is a filter; one that explains gets a second attempt at teaching the thing the learner just
  demonstrated they didn't know.
- **Write distractors that a reasonable person would pick.** Obviously-wrong options test reading
  speed, not understanding.
- **Test the confusion, not the vocabulary.** "What's the difference between a subtask and a
  dependency" is worth five questions about definitions.
- Pass thresholds around 75% for module quizzes, higher for a final. Leave attempts unlimited unless
  there's a real reason — a locked-out learner just messages a friend for the answers, and now
  they've learned nothing and you've lost the signal too.

### VIDEO

- **Write it word for word.** Improvising against a live UI is how a 2:30 explainer becomes 5:00 and
  how the quiz after it stops matching what was said.
- **Write the pauses in.** They're the difference between narration and a rushed reading.
- Roughly 150 words per minute. Overrunning? Cut a sentence — never speed up.
- **Record from a seeded demo account.** No real names, no real handles, no real contact records.

### SLIDES

- One idea per slide. The reference table gets its own slide with nothing else on it — that's the one
  people screenshot.
- Anything derived from code (thresholds, enum values) is a **generated** slide, not a typed one.
  Typed constants are how a course starts lying.

### WALKTHROUGH

- **Every `api` step must name a call that step actually causes** — never one the learner makes
  incidentally, or the tour skips ahead on its own.
- **Never wire `api` to a request you expect to fail.** Use a manual advance and describe the failure.
- Mark a step `optional` if it can't be guaranteed to render — an empty widget, an admin-only control,
  a quest that may not exist today. A required step some learners physically cannot complete is a
  broken tour.
- **Crossing from one component to another needs an explicit click step in between.** The most common
  way these files break is a step that silently assumes a modal is already open.

## The AI generator: what it's for

It proposes an outline from a prompt, you edit the outline, and it drafts the section bodies. For
structure and first drafts it's genuinely good, and it will save you an evening.

Two hard limits:

- **It cannot write walkthrough steps.** It has no knowledge of the anchor registry or what's on
  screen. Anything it produces there is invented.
- **It will state things about Constellation confidently and incorrectly**, because it's writing from
  your prompt rather than from the product.

> **Generate the skeleton. Verify every factual claim yourself.**

There's also a shared daily budget on the complex model. Generating a course is a reasonable use of
it; regenerating one nine times to nudge a heading is not.

## Gating, publishing, assigning

- **Default modules to sequential.** Teaching has an order, and later sections assume earlier ones. If
  the order genuinely doesn't matter, that's a signal you've written a reference document rather than
  a course — and it may belong somewhere other than the course system.
- **Preview your own course before assigning it.** Preview opens the learner view with everything
  unlocked and nothing recorded. Reading your own material as a learner catches the section that made
  sense only because you wrote it.
- **A draft is invisible to everyone but you.** Leave things in draft freely.
- **Assignment is on the catalog page, not in the editor** — because it's a decision about people
  rather than about content. Assign with a due date; members get notified.

## The standard to hold yourself to

Someone is going to spend forty-five minutes of their volunteer evening on what you wrote. The
material earns that time or it wastes it, and the difference is almost never production value —
it's whether you told them the *reason*, named the failure mode, and were honest about what the tool
doesn't do.

Write it the way you'd want it written for you, in your first week, when you didn't know what to ask.

Next, the quiz — five questions, 75% to pass, unlimited attempts.
