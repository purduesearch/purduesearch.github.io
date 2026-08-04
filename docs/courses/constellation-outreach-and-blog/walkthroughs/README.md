# Outreach & the Blog — walkthrough outlines

These outlines track the shipped `.steps.json` beside them. When you change a step file, change the
table too — the check script compares ids, not prose, so this is the only thing keeping the outline
honest.

---

## `crm-and-campaigns` — 12 steps, 2 real API calls

Requires the training project so the created contact and campaign are scoped to something disposable.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `outreach.tab.contacts` | `click` | "Everyone the club talks to lives here — sponsors, alumni, faculty, schools." |
| 2 | `outreach.contact.new` | `click` | "Add one." |
| 3 | `outreach.contact.followup` | `next` | "Set a follow-up before you save. A date, not 'sometime.'" |
| 4 | `outreach.contact.form` | `api` POST `/api/outreach/contacts` | "Make someone up — this is your training space. Name, org, email." |
| 5 | `outreach.contact.card` | `click` | "Open a contact. The column it sits in is how warm they are." |
| 6 | `outreach.contact.timeline` | `click` | "Info is who they are. Timeline is what has actually happened." |
| 7 | `outreach.contact.history` | `next` | "Who spoke to them, when, and what was promised. That last one is what gets forgotten." |
| 8 | `outreach.tab.campaigns` | `click` | "Campaigns group contacts you're working through together." |
| 9 | `outreach.campaign.new` | `click` | "Create one." |
| 10 | `outreach.campaign.form` | `api` POST `/api/outreach/campaigns` | "Name it after the ask, not the season." |
| 11 | `outreach.tab.campaigns` | `next` | "Coverage at a glance: contacted, replied, untouched. That middle column is the one that matters." |
| 12 | `outreach.tab.campaigns` | `next` | "Overdue follow-ups DM you every weekday morning. You won't have to remember to come back here." |

**Design notes**

- **Ordering is load-bearing.** `outreach.contact.followup` only exists while the contact modal is
  open, so it has to come *before* the save that closes it; `outreach.contact.history` only exists
  inside an open drawer with the Timeline tab selected, so steps 5 and 6 exist to put it there. An
  earlier version of this tour targeted both from a screen where neither was mounted, and both steps
  degraded on every run.
- Step 9 is a plain `click` and step 10 is the `api`, rather than one combined step: the spotlight
  would otherwise stay on the button that opened the modal, leaving the modal itself under the dim
  and hard to read.
- The tour never sends a message. Composing is covered in V07; wiring a step to an outbound send is
  the one thing in this curriculum that could reach a real human by accident.

---

## `blog-editor` — 9 steps, 2 real API calls

Does **not** require the training project — blog posts are their own resource. The tour creates a
draft and deletes nothing; drafts are cheap and an abandoned training draft is harmless.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `outreach.tab.blog` | `click` | "Every post, draft and published." |
| 2 | `blog.new` | `api` POST `/api/blog/posts` | "Start a draft. Call it anything." |
| 3 | `blog.editor.body` | `next` | "Write a sentence. It's saving as you type." |
| 4 | `blog.editor.toolbar` | `next` | "Use these styles, not hand formatting. They're what the public site knows how to render." |
| 5 | `blog.editor.presence` | `next` | "If someone else opens this post, their cursor appears here and you both just write." |
| 6 | `blog.editor.aitoggle` | `click` | "Open the AI assistant. Nothing reads your draft in the background." |
| 7 | `blog.editor.ai` | `next` | "A second reader with opinions. Some good. It doesn't know which details matter to us." |
| 8 | `blog.editor.publish` | `next` | "**Don't press it.** This puts the post on the public internet under the club's name." |
| 9 | `blog.editor.save` | `api` PATCH `/api/blog/posts/:id` | "Save it as a draft instead — and note that it autosaves anyway, ~1.5s after you stop typing." |

**Design notes**

- **Step 8 is the only step in the entire curriculum that instructs a learner not to click the
  spotlit control.** That's deliberate: publishing is irreversible in the way that matters
  (it's public, and it may be cached or indexed within minutes), and a tour that walks someone
  through pressing it teaches that publishing is a step in a sequence rather than a decision.
- Step 5 will show no second cursor for a solo learner. Marked `optional`, and the copy is written to
  make sense with an empty presence row.
- Step 6 exists because `blog.editor.ai` renders nothing until the panel is opened. Step 9 targets
  the actual Save draft button rather than sharing an anchor with the publish control — the learner
  was being told to save while the spotlight sat on Publish, in the one tour whose central lesson is
  that those two are different.
