import assert from "node:assert/strict";
import { buildEventList, buildEventRow, eventTime } from "./eventCards.js";
import { assertBlockBudget } from "./common.js";

const event = { id: "event1", title: "Meet <team>", startsAt: "2026-10-10T16:00:00Z", going: true, count: 3, location: "Room & Lab", url: "https://example.com/calendar?event=event1" };
const row = buildEventRow(event, "America/Los_Angeles");
assert.equal(row.accessory?.type, "button");
if (row.accessory?.type !== "button") throw new Error("Expected RSVP");
assert.equal(row.accessory.style, "primary");
assert.equal(row.accessory.text.text, "Going ✓ · Cancel");
assert.deepEqual(JSON.parse(row.accessory.value!), { e: "event1", g: false });
assert.match(row.text!.text, /9:00 AM PDT/);
assert.match(row.text!.text, /3 going/);
assert.match(row.text!.text, /&lt;team&gt;/);
assert.match(row.text!.text, /Room &amp; Lab/);
const notGoing = buildEventRow({ ...event, going: false });
if (notGoing.accessory?.type !== "button") throw new Error("Expected RSVP");
assert.equal(notGoing.accessory.style, undefined);
assert.deepEqual(JSON.parse(notGoing.accessory.value!), { e: "event1", g: true });
assert.match(eventTime(event.startsAt, "invalid/timezone"), /12:00 PM EDT/);
for (const count of [0, 1, 48, 49, 1000]) {
  const blocks = buildEventList(Array.from({ length: count }, (_, i) => ({ ...event, id: `event${i}` })));
  assertBlockBudget(blocks, 50);
  assert.ok(blocks.length <= 50);
}
assert.match(JSON.stringify(buildEventList([])), /No events/);
console.log("✓ event timezone, RSVP states, safe text, counts and message budgets (10 checks)");
