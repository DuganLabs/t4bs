/* toast.js is built on @basenative/components' createToaster/showToast/
   dismissToast for id + timer management (see toast.js's header
   comment for why the visual container/CSS is NOT adopted). These
   tests cover makeToaster()'s pure signal-plumbing: no DOM is touched
   (that's createToast()'s job, which calls document.createElement via
   h() and isn't testable without a browser — same as before this
   change, there was never an existing test for it).

   requestAnimationFrame is a browser API with no Node global; it's
   polyfilled onto setTimeout(fn, 0) so node:test's (experimental)
   timer mocking — which only fakes setTimeout/setInterval/setImmediate/
   Date, not requestAnimationFrame directly — can drive it
   deterministically instead of a real animation frame. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { signal } from "@basenative/runtime";
import { makeToaster } from "./toast.js";

globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);

describe("makeToaster", () => {
  it("publishes {text, type} onto the signal after the queued frame", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const toast = signal(null);
    const toaster = makeToaster(toast);

    toaster("SAVED", "great");
    assert.equal(toast(), null, "not yet — still waiting on the queued frame");

    t.mock.timers.tick(0);
    assert.deepEqual(toast(), { text: "SAVED", type: "great" });
  });

  it("defaults the type to 'good', matching the previous signature", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const toast = signal(null);
    const toaster = makeToaster(toast);

    toaster("hi");
    t.mock.timers.tick(0);
    assert.deepEqual(toast(), { text: "hi", type: "good" });
  });

  it("auto-dismisses after exactly 1950ms — same timing as the old setTimeout", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const toast = signal(null);
    const toaster = makeToaster(toast);

    toaster("BUSTED", "bad");
    t.mock.timers.tick(0);
    assert.deepEqual(toast(), { text: "BUSTED", type: "bad" });

    t.mock.timers.tick(1949);
    assert.notEqual(toast(), null, "should still be showing 1ms before the deadline");

    t.mock.timers.tick(1);
    assert.equal(toast(), null, "should have auto-dismissed at 1950ms");
  });

  it("replacing an active toast clears it immediately, then shows the new one next frame", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const toast = signal(null);
    const toaster = makeToaster(toast);

    toaster("first", "good");
    t.mock.timers.tick(0);
    assert.deepEqual(toast(), { text: "first", type: "good" });

    toaster("second", "great");
    // dismissToast() mutates the toaster's toasts signal synchronously,
    // and @basenative/runtime's effect() re-runs synchronously outside
    // of batch() — so the old toast is gone before the next queued
    // frame ever runs.
    assert.equal(toast(), null, "old toast should clear synchronously, no tick needed");

    t.mock.timers.tick(0);
    assert.deepEqual(toast(), { text: "second", type: "great" });
  });
});
