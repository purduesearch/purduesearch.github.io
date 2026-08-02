# Outreach & the Blog — walkthrough outlines

`.steps.json` authored in the final implementation phase. These outlines are complete specifications;
writing the JSON is transcription.

---

## `crm-and-campaigns` — 9 steps, 3 real API calls

Requires the training project so the created contact and campaign are scoped to something disposable.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `outreach.tab.contacts` | `click` | "Everyone the club talks to lives here — sponsors, alumni, faculty, schools." |
| 2 | `outreach.contact.new` | `click` | "Add one." |
| 3 | `outreach.contact.new` | `api` POST `/api/outreach/contacts` | "Make someone up — this is your training space. Name, org, email." |
| 4 | *(contact detail)* `outreach.tab.contacts` | `next` | "Interaction history. Who spoke to them, when, and what was promised. That last one is what gets forgotten." |
| 5 | *(follow-up field)* `outreach.tab.contacts` | `api` PATCH `/api/outreach/contacts/:id` | "Set a follow-up: a date and an owner. Not 'sometime.'" |
| 6 | `outreach.tab.campaigns` | `click` | "Campaigns group contacts you're working through together." |
| 7 | `outreach.campaign.new` | `api` POST `/api/outreach/campaigns` | "Create one and add your contact to it." |
| 8 | `outreach.tab.campaigns` | `next` | "Coverage at a glance: contacted, replied, untouched. That middle column is the one that matters." |
| 9 | `outreach.tab.campaigns` | `next` | "Overdue follow-ups DM you every weekday morning. You won't have to remember to come back here." |

**Design notes**

- Steps 4 and 5 need anchors that do not exist in `ANCHORS.md` yet (contact-detail history and the
  follow-up field). **Add them to the registry in the same commit as the steps** — the check script
  will otherwise fail the build, which is working as intended.
- The tour never sends a message. Composing is covered in V07; wiring a step to an outbound send is
  the one thing in this curriculum that could reach a real human by accident.

---

## `blog-editor` — 8 steps, 2 real API calls

Does **not** require the training project — blog posts are their own resource. The tour creates a
draft and deletes nothing; drafts are cheap and an abandoned training draft is harmless.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `outreach.tab.blog` | `click` | "Every post, draft and published." |
| 2 | *(new post button)* | `api` POST `/api/blog/posts` | "Start a draft. Call it anything." |
| 3 | `blog.editor.body` | `next` | "Write a sentence. It's saving as you type — there's no save button and you won't lose it." |
| 4 | `blog.editor.toolbar` | `next` | "Use these styles, not hand formatting. They're what the public site knows how to render." |
| 5 | `blog.editor.presence` | `next` | "If someone else opens this post, their cursor appears here and you both just write. No merging, no 'send me your version.'" |
| 6 | *(AI review panel)* | `next` | "A second reader with opinions. Some good. It doesn't know which details matter to us." |
| 7 | `blog.editor.publish` | `next` | "**Don't press it.** Read what it does: this puts the post on the public internet under the club's name. Scheduling is here too." |
| 8 | `outreach.tab.blog` | `api` PATCH `/api/blog/posts/:id` | "Save it as a draft instead. Drafts are free — publish when a human has read it end to end." |

**Design notes**

- **Step 7 is the only step in the entire curriculum that instructs a learner not to click the
  spotlit control.** That's deliberate: publishing is irreversible in the way that matters
  (it's public, and it may be cached or indexed within minutes), and a tour that walks someone
  through pressing it teaches that publishing is a step in a sequence rather than a decision.
- Step 5 will show no second cursor for a solo learner. Marked `optional`, and the copy is written to
  make sense with an empty presence row.
- Steps 2 and 6 need registry additions (`blog.new`, `blog.editor.ai`). Same rule as above: registry
  and steps land in one commit.
