import assert from "node:assert/strict";
import { projectRosterSlackIds } from "./projectRosterScope.js";

let fallbackCalls = 0;
const deps = {
  project: async (id: string) => id === "missing" ? null : { slackChannelId: id === "unlinked" ? null : "C1" },
  channelMembers: async () => ["U1", "UZ"],
  projectMembers: async () => { fallbackCalls++; return ["UOLD"]; },
};
assert.deepEqual(await projectRosterSlackIds("linked", deps), ["U1", "UZ"]);
assert.equal(fallbackCalls, 0, "linked channels must exclude stale project assignments");
assert.deepEqual(await projectRosterSlackIds("linked", { ...deps, channelMembers: async () => [] }), []);
assert.equal(fallbackCalls, 0, "empty channels must not widen the roster");
assert.deepEqual(await projectRosterSlackIds("unlinked", deps), ["UOLD"]);
assert.equal(await projectRosterSlackIds("missing", deps), null);
await assert.rejects(projectRosterSlackIds("linked", {
  ...deps, channelMembers: async () => { throw new Error("Slack unavailable"); },
}), /Slack unavailable/);
assert.equal(fallbackCalls, 1, "failed channel requests must not widen the roster");
console.log("Project roster scope tests passed");
