import assert from "node:assert/strict";
import { emitTaskChanged, onTaskChanged } from "./taskChangeBus.js";

const changes: string[][] = [];
const unsubscribe = onTaskChanged(ids => changes.push(ids));
emitTaskChanged("task");
assert.deepEqual(changes, [["task"]], "single task writes notify subscribers");

emitTaskChanged(["parent", "child", "parent"]);
assert.deepEqual(changes[1], ["parent", "child"], "related writes deliver each task once");

unsubscribe();
emitTaskChanged("ignored");
assert.equal(changes.length, 2, "unsubscribing stops delivery");

console.log("taskChangeBus: 3 assertions passed");
