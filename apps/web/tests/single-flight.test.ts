import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { singleFlight } from "../src/lib/single-flight.ts";

describe("singleFlight", () => {
  it("shares one run between overlapping calls", async () => {
    let runs = 0;
    let release!: (value: number) => void;
    const once = singleFlight(() => {
      runs++;
      return new Promise<number>((resolve) => (release = resolve));
    });
    const a = once();
    const b = once();
    release(7);
    assert.deepEqual(await Promise.all([a, b]), [7, 7]);
    assert.equal(runs, 1);
  });

  it("starts a new run after the previous one settles, also after a failure", async () => {
    let runs = 0;
    const once = singleFlight(async () => {
      runs++;
      if (runs === 1) throw new Error("first fails");
      return runs;
    });
    await assert.rejects(once(), /first fails/);
    assert.equal(await once(), 2);
    assert.equal(runs, 2);
  });
});
