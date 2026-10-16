# Skills rubric

This is the written rubric the weekly analysis and the scoring use. The wording the model sees lives in
`backend/src/services/skillPrompts.ts` (`RUBRIC`); keep the two in step and bump `RUBRIC_VERSION` (and
`PROMPT_VERSION`) when you change either. Levels are **advisory estimates**, not certifications.

## What the model labels (per artifact)

The model never picks a person's level. For each piece of work (a pull request, a CAD check-in, a finished task, a
review, a described activity) it returns only:

| Field | Meaning |
|---|---|
| skills | Which existing taxonomy skills the work shows (by short key), each with a fit from 0 to 1 |
| proposedSkills | Missing concepts with reusable definitions, valid broader placement and exact supporting quotes; validated policy can create provisional concepts, while ambiguity stays in review |
| contribution | AUTHORED, REVIEWED, LED or ASSISTED |
| complexity | 1 to 5, below |
| outcome | MERGED, SHIPPED, REWORKED, ABANDONED or NONE |
| summary | One sentence about the work, at most 240 characters |

### Complexity (how hard the work was, whoever did it)

1. **Trivial.** Typo, rename, config tweak, copying a template.
2. **Routine.** Small bug fix, a simple part, a standard task that follows an example.
3. **Solid.** A feature, a multi-part assembly, a bug that needed investigation.
4. **Hard.** Cross-cutting design, tight tolerances or real analysis, non-obvious debugging, several interacting parts.
5. **Exceptional.** A novel design or system, deep analysis with validation, work others will build on.

Commit counts, lines changed and file counts are weak signals and must not raise complexity.

## How levels are computed (no model involved)

`backend/src/services/skillScoringCore.ts`, `SCORING_VERSION = "1-contributions"` (the v1 arithmetic with canonical, deduplicated inputs).

Each evidence item contributes a weight for each skill it shows:

`weight = contribution × complexity × outcome × fit × recency`

| Contribution | × | Complexity | × | Outcome | × |
|---|---|---|---|---|---|
| AUTHORED | 1.0 | 1 | 0.4 | MERGED / SHIPPED | 1.0 |
| LED | 1.2 | 2 | 0.6 | NONE | 0.7 |
| REVIEWED | 0.6 | 3 | 0.8 | REWORKED | 0.6 |
| ASSISTED | 0.4 | 4 | 1.0 | ABANDONED | 0.15 |
| | | 5 | 1.25 | | |

Recency halves every 270 days and never drops below 0.25.

The total weight is saturated (`score = 1 − e^(−mass/2)`) and mapped to a level:

| Level | Name | Needs score of at least | Plus |
|---|---|---|---|
| 1 | Aware | 0.05 | some evidence |
| 2 | Beginner | 0.25 | |
| 3 | Competent | 0.50 | 2 items, one of complexity 2+ |
| 4 | Advanced | 0.75 | 3 items, one of complexity 3+ |
| 5 | Expert | 0.90 | 4 items, one of complexity 4+ |

Abandoned work never counts toward the item or complexity requirements.

Before the v1 arithmetic runs, the identity projection resolves equivalent concepts and deduplicates explicit
linked contribution groups per member/skill. A task, its linked PR and linked Vault change cannot multiply
credit for the same contribution. File extensions and line counts supply candidate hints, never forced tags.

## Confidence (separate from level)

Confidence answers "how sure are we", not "how good are they":

`0.5 × count + 0.2 × source diversity + 0.1 × project diversity + 0.2 × recency of the newest item`

Low below 0.40, medium to 0.70, high above. A single piece of work can never reach medium. A new member
with one item therefore shows "level 2, low confidence", not a low level.

## Trend

Weight in the last 90 days against the 180 days before (per 90): at least 1.5× is growing, at most 0.5× is fading,
anything with no work in the last 180 days is fading.

## Provenance

Four kinds of statement are stored on separate rows and never merged into one number: `AI_INFERRED`
(recomputed), `SELF_CLAIMED`, `PEER_ENDORSED`, `MANAGER_VERIFIED`. Self-entered manual work is capped at complexity 3.
