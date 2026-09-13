# Superpowers Plans and Specifications Status

Status reviewed on 2026-09-13 from the current tree, implementation commits, and merge history.
An old `Status:` line inside a design document is historical and does not override later merged
work. Files remain in place as design/implementation records.

## Active

| Initiative | Artifacts | Evidence / remaining work |
|---|---|---|
| purduesearch.org migration cleanup | [spec](specs/2026-08-05-purduesearch-org-migration-design.md) | The migration merged in PR #28 and cutover completed 2026-08-05. Phase 8 rollback cleanup was deferred about two weeks and is now overdue; `CORS_EXTRA_ORIGINS`, the DuckDNS nginx vhost/cert, and old Slack/GitHub OAuth redirects still require a dedicated cleanup. |

## Completed

| Initiative | Artifacts | Merge / implementation evidence |
|---|---|---|
| Timeline centering and tags | [spec](specs/2026-05-15-timeline-centering-and-tags-design.md), [plan](plans/2026-05-15-timeline-centering-and-tags.md) | Implemented in the tag/timeline commit series ending at `c8d49edc`. |
| Constellation blog editor | [spec](specs/2026-07-01-constellation-blog-editor-design.md), [plan](plans/2026-07-01-constellation-blog-editor.md), [continuation](plans/2026-07-01-constellation-blog-editor-CONTINUE.md) | Epic implementation commits landed before later blog upgrades; the continuation file is superseded historical guidance. |
| ClubPM Drive and multi-repo | [spec](specs/2026-07-06-clubpm-drive-multirepo-design.md) | Merged in PR #13 (`02258fa8`). |
| Meeting scheduler | [spec](specs/2026-07-20-meeting-scheduler-design.md) | Merged through PRs #14–#15, with follow-up fixes in #16–#18. |
| Press-kit editor | [spec](specs/2026-07-20-press-kit-editor-design.md), [plan](plans/2026-07-20-press-kit-editor.md), [execution prompt](plans/2026-07-20-press-kit-editor-EXECUTION-PROMPT.md) | Merged in PR #19. |
| Blog / Press Kit v2 | [spec](specs/2026-07-22-blog-presskit-v2-design.md), [section-builder plan](plans/2026-07-22-blog-presskit-section-builder.md), [fix plan](plans/2026-07-22-blog-presskit-v2-fixes.md), [execution prompt](plans/2026-07-22-blog-presskit-v2-EXECUTION-PROMPT.md) | Merged in PR #20. |
| Blog editor layout/carousel/typography | [spec](specs/2026-07-23-blog-editor-layout-carousel-typography-design.md), [plan](plans/2026-07-23-blog-editor-overhaul.md) | Merged in PR #21. |
| Public image optimization | [spec](specs/2026-07-25-image-optimization-design.md), [plan](plans/2026-07-25-image-optimization.md) | Merged in PR #23. |
| Blog AI review layer | [spec](specs/2026-07-26-blog-ai-review-layer-design.md), [plan](plans/2026-07-26-blog-ai-review-layer.md), [execution prompt](plans/2026-07-26-blog-ai-review-layer-EXECUTION-PROMPT.md) | Merged in PR #26. |
| Blog image replacement | [plan](plans/2026-07-27-blog-image-replace.md) | Implemented by `f7a19794` with styling in `6ba7eaf4`. |
| Course video/quiz editors | [spec](specs/2026-07-29-course-video-quiz-editors-design.md) | Merged with the course-kind editor work in PR #27. |
| Course AI generation | [spec](specs/2026-07-31-course-ai-generation-design.md), [plan](plans/2026-07-31-course-ai-generation.md) | Implemented by the `CourseGenJob` and generation-modal commit series. |
| Course modules | [spec](specs/2026-07-31-course-modules-design.md), [plan](plans/2026-07-31-course-modules.md) | Implemented by the module CRUD, editor-tree, and module-settings commits. |
| Course slides | [spec](specs/2026-07-31-course-slides-design.md), [plan](plans/2026-07-31-course-slides.md) | Implemented by the slide storage, import, workbench, and learner-player commits. |
| Constellation walkthrough course | [spec](specs/2026-08-02-constellation-walkthrough-course-design.md), [plan](plans/2026-08-02-constellation-walkthroughs.md) | Walkthrough schema, player, editor, training project, and anchor checker are present; `5bb291bd` records the anchor check passing. |
| Collaborative editing upgrade | [spec](specs/2026-08-05-collaborative-editing-upgrade-design.md), [plan](plans/2026-08-05-collaborative-editing-upgrade.md) | Merged through PRs #29–#32. |
| ARES public subteam page | [spec](specs/2026-08-22-ares-public-subteam-page-design.md), [plan](plans/2026-08-22-ares-public-page.md) | Implemented by the ARES route/component series; `4b078943` records the verification pass. |
| Course assignment sections | [spec](specs/2026-08-23-course-assignment-sections-design.md), [plan](plans/2026-08-23-course-assignment-sections.md), [sessions](plans/2026-08-23-course-assignment-sections-SESSIONS.md) | Merged at `98743cfe`. |
| Lab training certifications | [spec](specs/2026-08-25-lab-training-certifications-design.md), [plan](plans/2026-08-25-lab-training-certifications.md) | Implemented by the training registry/certificate commit series. |
| Bring-your-own AI provider | [spec](specs/2026-09-02-byo-ai-provider-design.md) | Implemented and merged in PR #33, then deliberately removed/superseded by the clipboard-planning lane in PR #34; retained as historical design. |
| Reports tab overhaul | [spec](specs/2026-09-06-reports-tab-overhaul-design.md) | Merged at `d3b59f6b`. |
| Calendar refinement and ICS import | [spec](specs/2026-09-08-calendar-refinement-ics-import-design.md) | Implemented by the ICS parsing/feed/import and calendar UI commit series. |
| Slack chat archive | [spec](specs/2026-09-09-slack-chat-archive-design.md), [plan](plans/2026-09-09-slack-chat-archive.md), [sessions](plans/2026-09-09-slack-chat-archive-SESSIONS.md) | Merged through PRs #37–#38. |
| Slack portal | [plan](plans/2026-09-10-slack-portal.md), [phases](plans/2026-09-10-slack-portal-PHASES.md), [sessions](plans/2026-09-10-slack-portal-SESSIONS.md) | Merged in PR #41. |
| Public events calendar | [spec](specs/2026-09-11-public-events-calendar-design.md), [plan](plans/2026-09-11-public-events-calendar.md) | Merged in PR #40. |

## Unknown

| Initiative | Artifacts | Why status is uncertain |
|---|---|---|
| ARES 101 curriculum and lit-review section | [spec](specs/2026-08-07-ares-course-design.md), [curriculum plan](plans/2026-08-07-ares-101-curriculum.md), [lit-review plan](plans/2026-08-07-lit-review-section-kind.md) | The LIT_REVIEW feature and substantial M1–M11 curriculum work are present, but the branch history includes explicit deck/reference blockers and no clear completion merge for the curriculum as a whole. |
