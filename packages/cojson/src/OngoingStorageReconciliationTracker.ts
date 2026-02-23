import { RawCoID } from "./ids.js";
import { PeerID, ReconcileBatchID } from "./sync.js";

type ReconcileBatchTracker = {
  coValues: Set<RawCoID>;
  pending: Set<RawCoID>;
};

/**
 * Tracks ongoing storage reconciliation batches in a server.
 */
export class OngoingStorageReconciliationTracker {
  private reconcileBatches: Map<
    PeerID,
    Map<ReconcileBatchID, ReconcileBatchTracker>
  > = new Map();
  private reconcileBatchesByCoValue: Map<
    PeerID,
    Map<RawCoID, Set<ReconcileBatchID>>
  > = new Map();

  trackBatch(
    peerId: PeerID,
    batchId: ReconcileBatchID,
    pendingCoValues: ReadonlySet<RawCoID>,
  ): void {
    if (pendingCoValues.size === 0) {
      return;
    }

    let batchesForPeer = this.reconcileBatches.get(peerId);
    if (!batchesForPeer) {
      batchesForPeer = new Map();
      this.reconcileBatches.set(peerId, batchesForPeer);
    }

    const trackedBatch: ReconcileBatchTracker = {
      pending: new Set(pendingCoValues),
      coValues: new Set(pendingCoValues),
    };
    batchesForPeer.set(batchId, trackedBatch);

    let coValuesToBatches = this.reconcileBatchesByCoValue.get(peerId);
    if (!coValuesToBatches) {
      coValuesToBatches = new Map();
      this.reconcileBatchesByCoValue.set(peerId, coValuesToBatches);
    }

    for (const coValueId of pendingCoValues) {
      let batchIds = coValuesToBatches.get(coValueId);
      if (!batchIds) {
        batchIds = new Set();
        coValuesToBatches.set(coValueId, batchIds);
      }
      batchIds.add(batchId);
    }
  }

  /**
   * Marks a coValue as reconciled and returns the batch IDs that completed syncing.
   */
  markItemComplete(peerId: PeerID, coValueId: RawCoID): ReconcileBatchID[] {
    const coValuesToBatches = this.reconcileBatchesByCoValue.get(peerId);
    const batchesForPeer = this.reconcileBatches.get(peerId);

    if (!coValuesToBatches || !batchesForPeer) {
      return [];
    }

    const batchIdsForCoValue = coValuesToBatches.get(coValueId);
    if (!batchIdsForCoValue || batchIdsForCoValue.size === 0) {
      return [];
    }

    const completedBatchIds: ReconcileBatchID[] = [];

    for (const batchId of batchIdsForCoValue) {
      const batch = batchesForPeer.get(batchId);
      if (!batch) {
        continue;
      }

      batch.pending.delete(coValueId);

      if (batch.pending.size === 0) {
        completedBatchIds.push(batchId);
      }
    }

    coValuesToBatches.delete(coValueId);

    for (const batchId of completedBatchIds) {
      this.clearBatch(peerId, batchId);
    }

    return completedBatchIds;
  }

  clearPeer(peerId: PeerID): void {
    this.reconcileBatches.delete(peerId);
    this.reconcileBatchesByCoValue.delete(peerId);
  }

  private clearBatch(peerId: PeerID, batchId: ReconcileBatchID): void {
    const batchesForPeer = this.reconcileBatches.get(peerId);
    if (!batchesForPeer) {
      return;
    }

    const batch = batchesForPeer.get(batchId);
    if (!batch) {
      return;
    }

    const coValuesToBatches = this.reconcileBatchesByCoValue.get(peerId);
    if (coValuesToBatches) {
      for (const coValueId of batch.coValues) {
        const batchIds = coValuesToBatches.get(coValueId);
        if (!batchIds) {
          continue;
        }
        batchIds.delete(batchId);
        if (batchIds.size === 0) {
          coValuesToBatches.delete(coValueId);
        }
      }

      if (coValuesToBatches.size === 0) {
        this.reconcileBatchesByCoValue.delete(peerId);
      }
    }

    batchesForPeer.delete(batchId);
    if (batchesForPeer.size === 0) {
      this.reconcileBatches.delete(peerId);
    }
  }
}
