// Pure-logic tests for courseRevisionPolicy. No DB required.
// Run: cd backend && npx tsx src/services/courseRevisionPolicy.test.ts
import {
  isEmptyDoc,
  pickSectionConfig,
  isEmptyConfig,
  configChanged,
  shouldSnapshotSection,
  SNAPSHOT_THROTTLE_MS,
} from "./courseRevisionPolicy.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };
const VIDEO = { youtubeId: "dQw4w9WgXcQ", durationSec: 212, lockSeek: true };

console.log("isEmptyDoc");
{
  check("null is empty", isEmptyDoc(null));
  check("{} is empty", isEmptyDoc({}));
  check("a lone empty paragraph is empty", isEmptyDoc(EMPTY));
  check("a paragraph with text is not", !isEmptyDoc(doc("hello")));
}

console.log("pickSectionConfig");
{
  eq("keeps only the eight settings, dropping nulls and the body",
    pickSectionConfig({
      contentJson: doc("body"), videoConfig: VIDEO, slideConfig: null, tourConfig: null,
      litConfig: null, assignmentConfig: null, trainingId: null,
      passThreshold: 80, maxAttempts: null,
    }),
    { videoConfig: VIDEO, passThreshold: 80 });
  eq("a section with no settings picks to an empty object",
    pickSectionConfig({
      contentJson: doc("body"), videoConfig: null, slideConfig: null, tourConfig: null,
      litConfig: null, assignmentConfig: null, trainingId: null,
      passThreshold: null, maxAttempts: null,
    }),
    {});
}

console.log("isEmptyConfig");
{
  check("{} is empty", isEmptyConfig({}));
  check("null is empty", isEmptyConfig(null));
  check("a video link is not", !isEmptyConfig({ videoConfig: VIDEO }));
}

console.log("configChanged");
{
  check("identical settings have not changed",
    !configChanged({ videoConfig: VIDEO }, { videoConfig: VIDEO }));
  check("key order does not count as a change",
    !configChanged(
      { videoConfig: { youtubeId: "a", lockSeek: true } },
      { videoConfig: { lockSeek: true, youtubeId: "a" } },
    ));
  check("a cleared youtubeId is a change — this is the loss we must record",
    configChanged({ videoConfig: { ...VIDEO, youtubeId: null } }, { videoConfig: VIDEO }));
  check("settings appearing where a revision recorded none is a change",
    configChanged({ videoConfig: VIDEO }, {}));
  check("a revision that recorded nothing at all (pre-migration row) counts as changed",
    configChanged({ videoConfig: VIDEO }, null));
  check("no settings on either side is not a change", !configChanged({}, null));
}

console.log("shouldSnapshotSection");
{
  const now = Date.now();
  const recent = new Date(now - 60_000);            // inside the 5-minute window
  const old = new Date(now - SNAPSHOT_THROTTLE_MS - 1);

  check("force always snapshots, even with nothing to preserve",
    shouldSnapshotSection({
      live: { contentJson: EMPTY, config: {} }, latest: null, force: true, now,
    }));

  check("an untouched section seeds no history",
    !shouldSnapshotSection({
      live: { contentJson: EMPTY, config: {} }, latest: null, force: false, now,
    }));

  check("a VIDEO section with an empty body but a link IS worth preserving",
    shouldSnapshotSection({
      live: { contentJson: EMPTY, config: { videoConfig: VIDEO } }, latest: null, force: false, now,
    }));

  check("first snapshot of a written body",
    shouldSnapshotSection({
      live: { contentJson: doc("hi"), config: {} }, latest: null, force: false, now,
    }));

  check("prose autosave inside the window is throttled",
    !shouldSnapshotSection({
      live: { contentJson: doc("hi there"), config: {} },
      latest: { contentJson: doc("hi"), config: {}, createdAt: recent },
      force: false, now,
    }));

  check("prose autosave outside the window snapshots",
    shouldSnapshotSection({
      live: { contentJson: doc("hi there"), config: {} },
      latest: { contentJson: doc("hi"), config: {}, createdAt: old },
      force: false, now,
    }));

  check("a body that survived a blanked snapshot escapes the throttle",
    shouldSnapshotSection({
      live: { contentJson: doc("real text"), config: {} },
      latest: { contentJson: EMPTY, config: {}, createdAt: recent },
      force: false, now,
    }));

  // The regression this whole file exists for: a link cleared a minute after the
  // previous snapshot. Under the old body-only throttle this wrote no revision
  // and the link was unrecoverable.
  check("clearing a video link inside the window still snapshots",
    shouldSnapshotSection({
      live: { contentJson: EMPTY, config: { videoConfig: { ...VIDEO, youtubeId: null } } },
      latest: { contentJson: EMPTY, config: { videoConfig: VIDEO }, createdAt: recent },
      force: false, now,
    }));

  check("swapping a deck's narration inside the window still snapshots",
    shouldSnapshotSection({
      live: { contentJson: doc("notes"), config: { slideConfig: { audioUrl: "/b.mp3" } } },
      latest: { contentJson: doc("notes"), config: { slideConfig: { audioUrl: "/a.mp3" } }, createdAt: recent },
      force: false, now,
    }));

  check("unchanged settings do not defeat the prose throttle",
    !shouldSnapshotSection({
      live: { contentJson: doc("hi there"), config: { videoConfig: VIDEO } },
      latest: { contentJson: doc("hi"), config: { videoConfig: VIDEO }, createdAt: recent },
      force: false, now,
    }));

  check("a pre-migration revision (no settings recorded) snapshots once, to capture them",
    shouldSnapshotSection({
      live: { contentJson: doc("hi"), config: { videoConfig: VIDEO } },
      latest: { contentJson: doc("hi"), config: null, createdAt: recent },
      force: false, now,
    }));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
