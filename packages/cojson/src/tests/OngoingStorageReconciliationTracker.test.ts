import { describe, expect, test } from "vitest";
import { OngoingStorageReconciliationTracker } from "../OngoingStorageReconciliationTracker.js";
import { RawCoID } from "../ids.js";

function coID(value: string): RawCoID {
  return value as RawCoID;
}

describe("OngoingStorageReconciliationTracker", () => {
  test("does not track empty batches", () => {
    const tracker = new OngoingStorageReconciliationTracker();

    tracker.trackBatch("peer-1", "batch-1", new Set());

    // @ts-expect-error - reconcileBatches is private
    expect(tracker.reconcileBatches.size).toEqual(0);
  });

  test("completes a batch only when all its covalues are completed", () => {
    const tracker = new OngoingStorageReconciliationTracker();

    tracker.trackBatch(
      "peer-1",
      "batch-1",
      new Set([coID("co_A"), coID("co_B")]),
    );

    expect(tracker.markItemComplete("peer-1", coID("co_A"))).toEqual([]);
    expect(tracker.markItemComplete("peer-1", coID("co_B"))).toEqual([
      "batch-1",
    ]);
    // @ts-expect-error - reconcileBatches is private
    expect(tracker.reconcileBatches.size).toEqual(0);
  });

  test("returns all completed batch ids for a covalue that is in multiple batches", () => {
    const tracker = new OngoingStorageReconciliationTracker();

    tracker.trackBatch("peer-1", "batch-1", new Set([coID("co_A")]));
    tracker.trackBatch(
      "peer-1",
      "batch-2",
      new Set([coID("co_A"), coID("co_B")]),
    );
    tracker.trackBatch("peer-1", "batch-3", new Set([coID("co_B")]));

    expect(tracker.markItemComplete("peer-1", coID("co_A"))).toEqual([
      "batch-1",
    ]);
    expect(tracker.markItemComplete("peer-1", coID("co_B"))).toEqual([
      "batch-2",
      "batch-3",
    ]);
    // @ts-expect-error - reconcileBatches is private
    expect(tracker.reconcileBatches.size).toEqual(0);
  });

  test("isolates state by peer", () => {
    const tracker = new OngoingStorageReconciliationTracker();

    tracker.trackBatch("peer-1", "batch-A", new Set([coID("co_A")]));
    tracker.trackBatch("peer-2", "batch-B", new Set([coID("co_A")]));

    expect(tracker.markItemComplete("peer-1", coID("co_A"))).toEqual([
      "batch-A",
    ]);
    expect(tracker.markItemComplete("peer-2", coID("co_A"))).toEqual([
      "batch-B",
    ]);
  });

  test("clearPeer removes only that peer state", () => {
    const tracker = new OngoingStorageReconciliationTracker();

    tracker.trackBatch("peer-1", "batch-A", new Set([coID("co_A")]));
    tracker.trackBatch("peer-2", "batch-B", new Set([coID("co_B")]));

    tracker.clearPeer("peer-1");

    expect(tracker.markItemComplete("peer-1", coID("co_A"))).toEqual([]);
    expect(tracker.markItemComplete("peer-2", coID("co_B"))).toEqual([
      "batch-B",
    ]);
  });
});
