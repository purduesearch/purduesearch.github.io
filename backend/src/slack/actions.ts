import type { App } from "@slack/bolt";
import { getTask, updateTask } from "../services/taskService.js";
import { isAdminBySlackId } from "../services/memberService.js";
import { resolveSlackMember } from "../services/memberService.js";
import { openAddNoteModal, openNewTaskModal, openSnoozeModal, openSubtaskModal, openStandupModal, openImageTaskModal } from "./modals.js";
import { prisma } from "../db/prisma.js";
import { retrieveAiTask } from "../utils/aiTaskCache.js";
import { refreshAppHome } from "./home.js";

// ── Action Registration ──────────────────────────────────────

export function registerActions(app: App): void {
  // ── Add Note ─────────────────────────────────────────────
  app.action("add_note", async ({ action, ack, body, client }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;

      if ("trigger_id" in body && body.trigger_id) {
        await openAddNoteModal(client, body.trigger_id, taskId);
      }
    } catch (error) {
      console.error("add_note error:", error);
    }
  });

  // ── Reassign ─────────────────────────────────────────────
  app.action("reassign", async ({ action, ack, client, body }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;

      if ("trigger_id" in body && body.trigger_id) {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: "modal",
            callback_id: "reassign_submit",
            private_metadata: taskId,
            title: { type: "plain_text", text: "Reassign Task" },
            submit: { type: "plain_text", text: "Reassign" },
            blocks: [
              {
                type: "input",
                block_id: "user_block",
                label: { type: "plain_text", text: "Assign to" },
                element: {
                  type: "users_select",
                  action_id: "selected_user",
                  placeholder: {
                    type: "plain_text",
                    text: "Select a team member",
                  },
                },
              },
            ],
          },
        });
      }
    } catch (error) {
      console.error("reassign error:", error);
    }
  });

  // ── View Dashboard (link button — no handler needed) ─────
  app.action("view_dashboard", async ({ ack }) => {
    await ack();
    // The button has a `url` property, Slack handles the redirect
  });

  // ── Create Task from Message (TODO auto-detect) ──────────
  app.action(
    "create_task_from_message",
    async ({ action, ack, respond, body, client }) => {
      await ack();

      try {
        if (!("value" in action) || !action.value) return;

        // Strip TODO: or ACTION: prefix for use as modal pre-fill
        const initialTitle = action.value
          .replace(/^(TODO|ACTION):\s*/i, "")
          .trim()
          .slice(0, 200);

        const channelId =
          "channel" in body && body.channel
            ? (body.channel as { id: string }).id
            : "";

        const isAdminUser = await isAdminBySlackId(body.user.id);

        if ("trigger_id" in body && body.trigger_id) {
          await openNewTaskModal(client, body.trigger_id, channelId, initialTitle, undefined, undefined, undefined, undefined, isAdminUser);
          await respond({ delete_original: true });
        }
      } catch (error) {
        console.error("create_task_from_message error:", error);
        await respond({
          text: "❌ Failed to open task modal. Please try again.",
          response_type: "ephemeral",
        });
      }
    }
  );

  // ── Dismiss TODO prompt ──────────────────────────────────
  app.action("dismiss_todo_prompt", async ({ ack, respond }) => {
    await ack();
    await respond({
      delete_original: true,
    });
  });

  // ── Open Task Modal from Reaction ──────────────────────────
  app.action(
    "open_task_modal_from_reaction",
    async ({ action, ack, body, client, respond }) => {
      await ack();
      try {
        if (!("value" in action) || !action.value) return;

        // Value is JSON-encoded: { text, channel }
        let initialTitle = action.value;
        let channelId: string | undefined;
        try {
          const parsed = JSON.parse(action.value);
          initialTitle = parsed.text ?? action.value;
          channelId = parsed.channel;
        } catch {
          // Plain string fallback
        }

        // Fallback to body.channel if JSON parse didn't give a channel
        if (!channelId) {
          channelId = "channel" in body && body.channel
            ? (body.channel as { id: string }).id
            : undefined;
        }

        if ("trigger_id" in body && body.trigger_id) {
          const isAdmin = await isAdminBySlackId(body.user.id);
          await openNewTaskModal(client, body.trigger_id, channelId ?? "", initialTitle, undefined, undefined, undefined, undefined, isAdmin);
          await respond({ delete_original: true });
        }
      } catch (error) {
        console.error("open_task_modal_from_reaction error:", error);
      }
    }
  );

  // ── Snooze Task ────────────────────────────────────────────
  app.action("snooze_task", async ({ action, ack, body, client }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;

      if ("trigger_id" in body && body.trigger_id) {
        await openSnoozeModal(client, body.trigger_id, taskId);
      }
    } catch (error) {
      console.error("snooze_task error:", error);
    }
  });

  // ── Home: Create Task ──────────────────────────────────────
  app.action("home_create_task", async ({ ack, body, client }) => {
    await ack();
    try {
      if ("trigger_id" in body && body.trigger_id) {
        const isAdmin = await isAdminBySlackId(body.user.id);
        await openNewTaskModal(client, body.trigger_id, "", undefined, undefined, undefined, undefined, undefined, isAdmin);
      }
    } catch (error) {
      console.error("home_create_task error:", error);
    }
  });

  // ── Home: Create Subtask ───────────────────────────────────
  app.action("home_create_subtask", async ({ ack, body, client }) => {
    await ack();
    try {
      if ("trigger_id" in body && body.trigger_id) {
        await openSubtaskModal(client, body.trigger_id, "");
      }
    } catch (error) {
      console.error("home_create_subtask error:", error);
    }
  });

  // ── Home: Standup ──────────────────────────────────────────
  app.action("home_standup", async ({ ack, body, client }) => {
    await ack();
    try {
      if ("trigger_id" in body && body.trigger_id) {
        await openStandupModal(client, body.trigger_id, "");
      }
    } catch (error) {
      console.error("home_standup error:", error);
    }
  });

  // ── Home: Refresh ──────────────────────────────────────────
  app.action("home_refresh", async ({ ack, body, client }) => {
    await ack();
    try {
      await refreshAppHome(client, body.user.id);
    } catch (error) {
      console.error("home_refresh error:", error);
    }
  });

  // ── AI: Create Task from AI Suggestion ─────────────────────
  app.action("ai_create_task", async ({ action, ack, body, client }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      if (!("trigger_id" in body) || !body.trigger_id) return;

      // Button value is {"k":"cacheKey","c":"channelId"}
      let cacheKey = "";
      let channelId = "";
      try {
        const parsed = JSON.parse(action.value);
        cacheKey = parsed.k ?? "";
        channelId = parsed.c ?? parsed.channel ?? "";
      } catch {
        // Legacy plain-string fallback (e.g. old messages still in flight)
        channelId = action.value;
      }

      const cached = cacheKey ? retrieveAiTask(cacheKey) : null;

      const isAdminUser = await isAdminBySlackId(body.user.id);

      await openNewTaskModal(
        client,
        body.trigger_id,
        channelId,
        cached?.title,
        cached?.description,
        cached?.dueDate,
        cached?.suggestedAssigneeSlackIds,
        cached?.parentTaskId,
        isAdminUser
      );
    } catch (error) {
      console.error("ai_create_task error:", error);
    }
  });

  // ── AI: Enrich Task ────────────────────────────────────────
  app.action("ai_enrich_task", async ({ action, ack, respond }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;
      const task = await getTask(taskId);
      if (!task) { await respond({ text: "❌ Task not found.", response_type: "ephemeral" }); return; }
      const { generateJson } = await import("../services/geminiService.js");
      const { enrichTaskPrompt } = await import("../utils/aiPrompts.js");
      const projectType = (task as any).project?.type ?? "engineering";
      const enriched = await generateJson<{ description: string; acceptanceCriteria: string[]; technicalNotes: string | null; definitionOfDone: string }>(
        enrichTaskPrompt(task.title, task.description ?? "", projectType)
      );
      if (!enriched) { await respond({ text: "❌ AI enrichment failed.", response_type: "ephemeral" }); return; }
      await updateTask(taskId, { description: enriched.description });
      await respond({
        response_type: "ephemeral",
        text: `✨ *Task enriched: ${task.title}*\n\n*Acceptance Criteria:*\n${enriched.acceptanceCriteria.map(c => `• ${c}`).join("\n")}\n\n*DoD:* ${enriched.definitionOfDone}${enriched.technicalNotes ? `\n\n*Notes:* ${enriched.technicalNotes}` : ""}`,
      });
    } catch (err) {
      console.error("ai_enrich_task error:", err);
    }
  });

  // ── AI: Create Task from Drive Preview ─────────────────────
  app.action("ai_create_drive_task", async ({ action, ack, body, client }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      const { title, description, dueDate, channelId } = JSON.parse(action.value);
      const isAdminUser = await isAdminBySlackId(body.user.id);
      const triggerId = ("trigger_id" in body ? body.trigger_id : "") as string;
      await openNewTaskModal(client, triggerId, channelId, title, description, dueDate, undefined, undefined, isAdminUser);
    } catch (err) {
      console.error("ai_create_drive_task error:", err);
    }
  });

  // ── AI: Suggest Deadline ───────────────────────────────────
  app.action("ai_suggest_deadline", async ({ action, ack, respond }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;
      const task = await getTask(taskId);
      if (!task) return;
      const { generateJson } = await import("../services/geminiService.js");
      const { deadlineSuggestionPrompt } = await import("../utils/aiPrompts.js");
      const project = await prisma.project.findUnique({ where: { id: (task as any).projectId }, select: { targetDate: true } });
      const today = new Date().toISOString().split("T")[0];
      const result = await generateJson<{ suggestedDueDate: string; reasoning: string }>(
        deadlineSuggestionPrompt(task.title, task.description ?? "", (task as any).storyPoints ?? null, 10, project?.targetDate?.toISOString().split("T")[0] ?? null, today)
      );
      if (!result) return;
      await respond({
        response_type: "ephemeral",
        text: `📅 *Suggested deadline for ${task.title}:* ${result.suggestedDueDate}\n_${result.reasoning}_`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `📅 *Suggested deadline:* ${result.suggestedDueDate}\n_${result.reasoning}_` } },
          {
            type: "actions",
            elements: [
              {
                type: "button", style: "primary",
                text: { type: "plain_text", text: "Apply" },
                action_id: "ai_apply_deadline",
                value: JSON.stringify({ taskId, date: result.suggestedDueDate }),
              },
              { type: "button", text: { type: "plain_text", text: "Dismiss" }, action_id: "dismiss_todo_prompt", value: "dismiss" },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("ai_suggest_deadline error:", err);
    }
  });

  // ── AI: Apply Suggested Deadline ───────────────────────────
  app.action("ai_apply_deadline", async ({ action, ack, respond }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      const { taskId, date } = JSON.parse(action.value);
      await updateTask(taskId, { dueDate: new Date(date) });
      await respond({ response_type: "ephemeral", replace_original: true, text: `✅ Due date set to ${date}` });
    } catch (err) {
      console.error("ai_apply_deadline error:", err);
    }
  });

  // ── AI: Apply Dependency Suggestion ───────────────────────
  app.action("ai_apply_dep", async ({ action, ack, respond }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      const { blockingTaskId, blockedTaskId } = JSON.parse(action.value);
      await prisma.taskDependency.upsert({
        where: { blockingTaskId_blockedTaskId: { blockingTaskId, blockedTaskId } },
        create: { blockingTaskId, blockedTaskId },
        update: {},
      });
      await respond({ response_type: "ephemeral", replace_original: true, text: `✅ Dependency applied.` });
    } catch (err) {
      console.error("ai_apply_dep error:", err);
    }
  });

  // ── AI: Open Image Task Modal from file_shared prompt ─────
  app.action("open_image_task_modal", async ({ action, ack, body, client }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      const { channelId, fileUrl } = JSON.parse(action.value);
      if (!("trigger_id" in body) || !body.trigger_id) return;
      await openImageTaskModal(client, body.trigger_id, channelId, fileUrl, "");
    } catch (err) {
      console.error("open_image_task_modal error:", err);
    }
  });

  // ── Event Create Submit ───────────────────────────────────
  app.view("event_create_submit", async ({ ack, view, body }) => {
    await ack();
    try {
      const v = view.state.values;
      const title     = v.event_title?.value?.value ?? "";
      const type      = (v.event_type?.value?.selected_option?.value ?? "MEETING") as any;
      const dateStr   = v.event_date?.value?.selected_date ?? "";
      const timeStr   = v.event_time?.value?.value ?? "00:00";
      const location  = v.event_location?.value?.value ?? undefined;
      const projectId = v.event_project?.value?.selected_option?.value ?? undefined;
      const recPat    = v.event_recurring?.value?.selected_option?.value ?? undefined;

      if (!title || !dateStr) return;

      const startTime = new Date(`${dateStr}T${timeStr}:00`);
      const member    = await resolveSlackMember(body.user.id);

      const { createEvent } = await import("../services/eventService.js");
      await createEvent({
        title, type, startTime, location, projectId,
        organizerId: member.id,
        isRecurring: !!recPat,
        recurrencePattern: recPat,
        // Matches the ClubPM form default. eventService forces DEADLINE → false.
        isPublic: true,
      });
    } catch (err) {
      console.error("event_create_submit error:", err);
    }
  });

  // ── Outreach Submit Modal ─────────────────────────────────
  app.view("outreach_submit_modal", async ({ ack, view, body }) => {
    await ack();
    try {
      const v = view.state.values;
      const title    = v.submission_title?.value?.value ?? "";
      const type     = (v.submission_type?.value?.selected_option?.value ?? "SOCIAL_POST") as any;
      const content  = v.submission_content?.value?.value ?? undefined;
      const platform = (v.submission_platform?.value?.selected_options ?? []).map((o: any) => o.value);
      const status   = (v.submission_status?.value?.selected_option?.value ?? "SUBMITTED") as any;

      if (!title) return;

      const member = await resolveSlackMember(body.user.id);
      const { createSubmission } = await import("../services/outreachService.js");
      await createSubmission({ title, type, content, platform, authorId: member.id, status });
    } catch (err) {
      console.error("outreach_submit_modal error:", err);
    }
  });
}
