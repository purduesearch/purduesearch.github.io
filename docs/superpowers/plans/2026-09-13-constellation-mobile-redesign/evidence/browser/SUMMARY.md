# Production baseline measurements (fixture API)

Generated 2026-09-14T01:50:34.170Z from `metrics.json`; extras 2026-09-14T01:52:22.368Z. Production React components served by `npm start`; API answered by `scripts/fixture-api.mjs` (fixture data, not a real account). Chrome headless, device emulation (mobile viewport + touch for phone/landscape; mouse for desktop). **Emulation, not a device test.**

"Layout width" is `innerWidth` after load (the layout viewport). When it exceeds the device width, content is wider than the phone: at the initial scale of 1 the extra width sits off-screen to the right and the page pans sideways (verified on Tasks at 390: visual viewport 390, scale 1, scrollWidth 463).

| Capture | URL after load | Layout width (device) | Controls <44px in view | Observations |
| --- | --- | --- | --- | --- |
| [d1440-home](d1440-home.png) | `/clubpm/` | 1440 (1440) | 51 / 55 |  |
| [d1440-tasks](d1440-tasks.png) | `/clubpm/projects/p1` | 1440 (1440) | 48 / 56 | project main 1096px; assignee panel 280px |
| [d1440-chatlist](d1440-chatlist.png) | `/clubpm/chat/C_FIX_GENERAL` | 1440 (1440) | 21 / 29 | composer top at 751px (viewport 900px) |
| [d1440-conversation](d1440-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 1440 (1440) | 21 / 29 | composer top at 751px (viewport 900px) |
| [d1440-members](d1440-members.png) | `/clubpm/members` | 1440 (1440) | 31 / 40 |  |
| [d1440-calendar](d1440-calendar.png) | `/clubpm/calendar` | 1440 (1440) | 35 / 39 |  |
| [d1440-notifications](d1440-notifications.png) | `/clubpm/notifications` | 1440 (1440) | 22 / 26 |  |
| [d1280-home](d1280-home.png) | `/clubpm/` | 1280 (1280) | 50 / 54 |  |
| [d1280-tasks](d1280-tasks.png) | `/clubpm/projects/p1` | 1280 (1280) | 42 / 50 | project main 936px; assignee panel 280px |
| [d1280-chatlist](d1280-chatlist.png) | `/clubpm/chat/C_FIX_GENERAL` | 1280 (1280) | 20 / 28 | composer top at 651px (viewport 800px) |
| [d1280-conversation](d1280-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 1280 (1280) | 20 / 28 | composer top at 651px (viewport 800px) |
| [d1280-members](d1280-members.png) | `/clubpm/members` | 1280 (1280) | 30 / 39 |  |
| [d1280-calendar](d1280-calendar.png) | `/clubpm/calendar` | 1280 (1280) | 35 / 39 |  |
| [d1280-notifications](d1280-notifications.png) | `/clubpm/notifications` | 1280 (1280) | 22 / 26 |  |
| [p390-home](p390-home.png) | `/clubpm/` | 431 (390) | 29 / 33 | controls past right edge: Notifications, 1 unread |
| [p390-tasks](p390-tasks.png) | `/clubpm/projects/p1` | 463 (390) | 33 / 41 | project main 46px; assignee panel 280px; controls past right edge: Notifications, 1 unread; Newest |
| [p390-chatlist](p390-chatlist.png) | `/clubpm/chat/C_FIX_GENERAL` | 434 (390) | 18 / 25 | composer top at 2220px (viewport 940px); controls past right edge: Notifications, 1 unread |
| [p390-conversation](p390-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 434 (390) | 18 / 25 | composer top at 2220px (viewport 940px); controls past right edge: Notifications, 1 unread |
| [p390-members](p390-members.png) | `/clubpm/members` | 465 (390) | 17 / 23 | controls past right edge: Notifications, 1 unread |
| [p390-calendar](p390-calendar.png) | `/clubpm/calendar` | 462 (390) | 32 / 36 | controls past right edge: Notifications, 1 unread; Month; Agenda |
| [p390-notifications](p390-notifications.png) | `/clubpm/notifications` | 427 (390) | 19 / 26 |  |
| [p320-home](p320-home.png) | `/clubpm/` | 431 (320) | 26 / 30 | controls past right edge: 4-day streak. 0 freezes available. Last ; Notifications, 1 unread; Week |
| [p320-tasks](p320-tasks.png) | `/clubpm/projects/p1` | 463 (320) | 29 / 37 | project main 0px; assignee panel 280px; controls past right edge: Quests and achievements; 4-day streak. 0 freezes available. Last ; Notifications, 1 unread; Today |
| [p320-chatlist](p320-chatlist.png) | `/clubpm/chat/C_FIX_GENERAL` | 434 (320) | 15 / 23 | composer top at 2814px (viewport 868px); controls past right edge: 4-day streak. 0 freezes available. Last ; Notifications, 1 unread |
| [p320-conversation](p320-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 434 (320) | 15 / 23 | composer top at 2814px (viewport 868px); controls past right edge: 4-day streak. 0 freezes available. Last ; Notifications, 1 unread |
| [p320-members](p320-members.png) | `/clubpm/members` | 464 (320) | 15 / 20 | controls past right edge: Quests and achievements; 4-day streak. 0 freezes available. Last ; Notifications, 1 unread |
| [p320-calendar](p320-calendar.png) | `/clubpm/calendar` | 462 (320) | 29 / 33 | controls past right edge: Quests and achievements; 4-day streak. 0 freezes available. Last ; Notifications, 1 unread; Week |
| [p320-notifications](p320-notifications.png) | `/clubpm/notifications` | 427 (320) | 15 / 24 | controls past right edge: 4-day streak. 0 freezes available. Last ; Notifications, 1 unread |
| [l844-home](l844-home.png) | `/clubpm/` | 844 (844) | 35 / 39 |  |
| [l844-tasks](l844-tasks.png) | `/clubpm/projects/p1` | 844 (844) | 25 / 32 | project main 500px; assignee panel 280px |
| [l844-conversation](l844-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 844 (844) | 18 / 25 | composer top at 1524px (viewport 390px) |
| [p390-task-modal-deeplink](p390-task-modal-deeplink.png) | `/clubpm/projects/p1?task=t3` | 463 (390) | 44 / 53 | ?task= deep link opens TaskModal; project main 46px; assignee panel 280px; task modal 374px wide; controls past right edge: Notifications, 1 unread; Newest; Critical; input |
| [p390-project-insights-ai](p390-project-insights-ai.png) | `/clubpm/projects/p1?tab=insights&view=ai` | 463 (390) | 20 / 35 | legacy/current Insights AI deep link; project main 326px; controls past right edge: Notifications, 1 unread |
| [p390-project-files](p390-project-files.png) | `/clubpm/projects/p1?tab=files` | 463 (390) | 20 / 28 | Files tab; project main 326px; controls past right edge: Notifications, 1 unread |
| [p390-project-empty](p390-project-empty.png) | `/clubpm/projects/p4` | 463 (390) | 34 / 42 | Project with no tasks; project main 46px; assignee panel 280px; controls past right edge: Notifications, 1 unread |
| [p320-task-modal-deeplink](p320-task-modal-deeplink.png) | `/clubpm/projects/p1?task=t3` | 463 (320) | 35 / 44 | ?task= deep link at 320px; project main 0px; assignee panel 280px; task modal 307px wide; controls past right edge: Quests and achievements; 4-day streak. 0 freezes available. Last ; Notifications, 1 unread; Today |
| [p390-home-after-tap-social](p390-home-after-tap-social.png) | `/clubpm/` | 431 (390) | 32 / 36 | Tapped the Social group icon in the 64px rail; controls past right edge: Notifications, 1 unread |
| [p390-home-admin-manyprojects](p390-home-admin-manyprojects.png) | `/clubpm/` | 431 (390) | 46 / 51 | Admin persona, 26 projects; controls past right edge: Notifications, 1 unread |
| [d1440-home-admin-manyprojects](d1440-home-admin-manyprojects.png) | `/clubpm/` | 1440 (1440) | 67 / 72 | Admin persona, 26 projects |
| [p390-home-noprojects](p390-home-noprojects.png) | `/clubpm/` | 431 (390) | 25 / 29 | Member with no projects; controls past right edge: Notifications, 1 unread |
| [p390-conversation-keyboard-proxy](p390-conversation-keyboard-proxy.png) | `/clubpm/chat/C_FIX_GENERAL` | 434 (390) | 11 / 15 | Viewport height 460px approximates an open software keyboard; NOT a device test; composer top at 779px (viewport 512px); controls past right edge: Notifications, 1 unread |
| [p320-login](p320-login.png) | `/clubpm/login` | 320 (320) | 2 / 3 | Signed out (fixture /auth/me → 401) |
| [p390-login](p390-login.png) | `/clubpm/login` | 390 (390) | 2 / 3 | Signed out (fixture /auth/me → 401) |
| [d1280-login](d1280-login.png) | `/clubpm/login` | 1280 (1280) | 12 / 13 | Signed out (fixture /auth/me → 401) |

## Supplementary captures (`capture-extras.mjs`)

| Capture | URL | Layout width (device) | Sidebar px | Project main px | Note |
| --- | --- | --- | --- | --- | --- |
| [x767-mouse-home](x767-mouse-home.png) | `/clubpm/` | 767 (767) | 64 | — | 767x1024 mouse |
| [x767-mouse-tasks](x767-mouse-tasks.png) | `/clubpm/projects/p1` | 767 (767) | 64 | 423 | 767x1024 mouse |
| [x767-mouse-conversation](x767-mouse-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 767 (767) | 64 | — | 767x1024 mouse |
| [x768-tablet-home](x768-tablet-home.png) | `/clubpm/` | 768 (768) | 64 | — | 768x1024 touch |
| [x768-tablet-tasks](x768-tablet-tasks.png) | `/clubpm/projects/p1` | 768 (768) | 64 | 424 | 768x1024 touch |
| [x768-tablet-conversation](x768-tablet-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 768 (768) | 64 | — | 768x1024 touch |
| [x1024-tablet-home](x1024-tablet-home.png) | `/clubpm/` | 1024 (1024) | 64 | — | 1024x768 touch |
| [x1024-tablet-tasks](x1024-tablet-tasks.png) | `/clubpm/projects/p1` | 1024 (1024) | 64 | 680 | 1024x768 touch |
| [x1024-tablet-conversation](x1024-tablet-conversation.png) | `/clubpm/chat/C_FIX_GENERAL` | 1024 (1024) | 64 | — | 1024x768 touch |
| [x1440-admin-rankup-celebration](x1440-admin-rankup-celebration.png) | `/clubpm/` | 1440 (1440) | 64 | — | RankUpModal after persona switch (reward overlay evidence) |
| [x1440-admin-sidebar-hover-other](x1440-admin-sidebar-hover-other.png) | `/clubpm/` | 1440 (1440) | 220 | — | Mouse hover expands the rail to 220px; Other › Admin with badges |
| [x390-admin-rankup-celebration](x390-admin-rankup-celebration.png) | `/clubpm/` | 431 (390) | 64 | — | RankUpModal after persona switch (reward overlay evidence) |
| [x390-admin-sidebar-after-tap-other](x390-admin-sidebar-after-tap-other.png) | `/clubpm/` | 431 (390) | 220 | — | Tap on the collapsed rail: sticky :hover expands it over content; Other group opens |

## Navigation, history and request probes

```json
{
  "history": {
    "beforeTab": "/clubpm/projects/p1",
    "afterTab": "/clubpm/projects/p1?tab=insights (history.length=50)",
    "afterBack": "/clubpm/",
    "withModal": "/clubpm/projects/p1?tab=insights&view=activity&task=t3 modal=false",
    "afterClose": "/clubpm/projects/p1?tab=insights&view=activity&task=t3 activeTabInsights=false",
    "signedOutDeepLink": "/clubpm/login"
  },
  "navigationRequests": {
    "sidebarDashboardToChat": {
      "state": {
        "persona": "member",
        "projects": "few"
      },
      "sse": {
        "opened": 1,
        "open": 42
      },
      "log": {
        "GET /api/chat/conversations": 4,
        "GET /api/chat/conversations/C_FIX_GENERAL": 2,
        "GET /api/chat/conversations/C_FIX_GENERAL/messages": 2,
        "GET /api/members": 1,
        "GET /api/members/cosmetic-styles": 4,
        "GET /api/members/m1/profile": 4,
        "GET /api/members/me/celebration": 4,
        "GET /api/notifications": 4,
        "GET /api/notifications/stream": 1,
        "GET /api/projects": 4
      }
    },
    "projectTabToFiles": {
      "state": {
        "persona": "member",
        "projects": "few"
      },
      "sse": {
        "opened": 0,
        "open": 43
      },
      "log": {}
    }
  }
}
```

Console errors seen during the run (fixture gaps included):

- `Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.`
- `%o`
- `[ClubPM ErrorBoundary]`
