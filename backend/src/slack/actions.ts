import type { App } from "@slack/bolt";
import { claimTaskFromSlack, getTask, updateTask, spawnNextOccurrence } from "../services/taskService.js";
import { isAdminBySlackId } from "../services/memberService.js";
import { resolveSlackMember } from "../services/memberService.js";
import { logAuditEvent } from "../services/activityService.js";
import { buildTaskCard } from "../utils/blockKit.js";
import { openAddNoteModal, openNewTaskModal, openSnoozeModal, openSubtaskModal, openStandupModal, openImageTaskModal } from "./modals.js";
import { prisma } from "../db/prisma.js";
import { retrieveAiTask } from "../utils/aiTaskCache.js";
import { refreshAppHome } from "./home.js";

// ── Action Registration ──────────────────────────────────────

export function registerActions(app: App): void {
  // ── Mark Done ────────────────────────────────────────────
  app.action("mark_done", async ({ action, ack, respond, body, client }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) {
        await respond({ text: "❌ Missing task ID", response_type: "ephemeral" });
        return;
      }

      const taskId = action.value;
      const task = await getTask(taskId);

      if (!task) {
        await respond({
          text: `❌ Task not found: \`${taskId}\``,
          response_type: "ephemeral",
        });
        return;
      }

      // Block completion if any open dependencies remain
      const openBlockers = (task.blockedBy ?? []).filter(b => b.blockingTask.status !== "DONE");
      if (openBlockers.length > 0) {
        const blockerList = openBlockers.map(b => `• *${b.blockingTask.title}*`).join("\n");
        await respond({
          text: `⚠️ This task is blocked by ${openBlockers.length} open task${openBlockers.length > 1 ? "s" : ""}:\n${blockerList}\n\nResolve those first before marking this task done.`,
          response_type: "ephemeral",
        });
        return;
      }

      await updateTask(taskId, { status: "DONE" });

      if (task.isRecurring) {
        const fullTask = await getTask(taskId); // re-fetch with assignees + tags included
        if (fullTask) await spawnNextOccurrence(fullTask as any).catch(console.error);
      }

      const markDoneActor = await resolveSlackMember(body.user.id).catch(() => null);
      logAuditEvent({
        taskId:   taskId,
        memberId: markDoneActor?.id ?? null,
        source:   "SLACK",
        eventType: "TASK_COMPLETED",
        payload:  { taskTitle: task.title },
      }).catch(console.error);

      await respond({
        response_type: "in_channel",
        replace_original: true,
        text: `✅ ~${task.title}~ — marked complete by <@${body.user.id}>`,
      });

      // Post completion as a thread reply on the original task announcement
      if (task.slackMsgTs) {
        const msgChannel =
          "channel" in body && body.channel
            ? (body.channel as { id: string }).id
            : null;
        if (msgChannel) {
          try {
            await client.chat.postMessage({
              channel: msgChannel,
              text: `✅ *${task.title}* marked complete by <@${body.user.id}>`,
              thread_ts: task.slackMsgTs,
            });
          } catch (err) {
            console.error("thread reply error:", err);
          }
        }
      }
    } catch (error) {
      console.error("mark_done error:", error);
      await respond({
        text: "❌ Failed to mark task as done. Please try again.",
        response_type: "ephemeral",
      });
    }
  });

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

  // ── Claim Task ─────────────────────────────────────────────
  app.action("claim_task", async ({ action, ack, respond, body }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;
      const slackUserId = body.user.id;

      const member = await resolveSlackMember(slackUserId);
      const task = await claimTaskFromSlack(taskId, member.id);

      logAuditEvent({
        taskId:   taskId,
        memberId: member.id,
        source:   "SLACK",
        eventType: "TASK_ASSIGNED",
        payload:  { taskTitle: task?.title ?? "", assigneeNames: [member.displayName] },
      }).catch(console.error);

      if (task && task.project) {
        await respond({
          replace_original: true,
          blocks: buildTaskCard(task, task.project),
          text: `✅ Task claimed by <@${slackUserId}>`,
        });
      }
    } catch (error) {
      console.error("claim_task error:", error);
    }
  });

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

  // ── Update Status ──────────────────────────────────────────
  app.action("update_status", async ({ action, ack, respond, body }) => {
    await ack();

    try {
      if (!("selected_option" in action) || !action.selected_option?.value) return;

      // The value is formatted as "STATUS|taskId"
      const [newStatus, taskId] = action.selected_option.value.split("|");
      if (!newStatus || !taskId) return;

      const taskBefore = await getTask(taskId);
      await updateTask(taskId, { status: newStatus as any });
      const task = await getTask(taskId);

      if (newStatus === "DONE" && taskBefore?.isRecurring) {
        const fullTask = await getTask(taskId); // re-fetch with assignees + tags included
        if (fullTask) await spawnNextOccurrence(fullTask as any).catch(console.error);
      }

      const statusActor = await resolveSlackMember(body.user.id).catch(() => null);
      const isCompleted = newStatus === "DONE";
      logAuditEvent({
        taskId:   taskId,
        memberId: statusActor?.id ?? null,
        source:   "SLACK",
        eventType: isCompleted ? "TASK_COMPLETED" : "TASK_UPDATED",
        payload:  isCompleted
          ? { taskTitle: taskBefore?.title ?? "" }
          : { taskTitle: taskBefore?.title ?? "", changes: [{ field: "status", from: taskBefore?.status, to: newStatus }] },
      }).catch(console.error);

      if (task && task.project) {
        await respond({
          replace_original: true,
          blocks: buildTaskCard(task, task.project),
          text: `✅ Status updated to ${newStatus.replace("_", " ")}`,
        });
      }
    } catch (error) {
      console.error("update_status error:", error);
    }
  });

  // ── Show Subtasks ──────────────────────────────────────────
  app.action("show_subtasks", async ({ action, ack, respond }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const task = await getTask(action.value);
      if (!task || !task.project) return;

      await respond({
        replace_original: true,
        blocks: buildTaskCard(task, task.project, { showSubtasks: true }),
        text: `Task: ${task.title}`,
      });
    } catch (error) {
      console.error("show_subtasks error:", error);
    }
  });

  // ── Hide Subtasks ──────────────────────────────────────────
  app.action("hide_subtasks", async ({ action, ack, respond }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const task = await getTask(action.value);
      if (!task || !task.project) return;

      await respond({
        replace_original: true,
        blocks: buildTaskCard(task, task.project),
        text: `Task: ${task.title}`,
      });
    } catch (error) {
      console.error("hide_subtasks error:", error);
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

  // ── Standup from DM Prompt ─────────────────────────────────
  app.action("standup_from_dm", async ({ action, ack, body, client }) => {
    await ack();
    try {
      if (!("value" in action) || !action.value) return;
      if ("trigger_id" in body && body.trigger_id) {
        await openStandupModal(client, body.trigger_id, action.value);
      }
    } catch (error) {
      console.error("standup_from_dm error:", error);
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
}
