import { RawCoID } from "./ids.js";
import { PeerID, ReconcileBatchID } from "./sync.js";

/**
 * Tracks ongoing storage reconciliation batches in a server.
 */
export class OngoingStorageReconciliationTracker {
  private reconcileBatches: Map<PeerID, Map<ReconcileBatchID, Set<RawCoID>>> =
    new Map();
  private reconcileBatchesByCoValue: Map<
    PeerID,
    Map<RawCoID, Set<ReconcileBatchID>>
  > = new Map();

  trackBatch(
    peerId: PeerID,
    batchId: ReconcileBatchID,
    pendingCoValues: Set<RawCoID>,
  ): void {
    if (pendingCoValues.size === 0) {
      return;
    }

    let batchesForPeer = this.reconcileBatches.get(peerId);
    if (!batchesForPeer) {
      batchesForPeer = new Map();
      this.reconcileBatches.set(peerId, batchesForPeer);
    }

    batchesForPeer.set(batchId, pendingCoValues);

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
      batch.delete(coValueId);
      if (batch.size === 0) {
        completedBatchIds.push(batchId);
      }
    }

    // This coValue was just completed, so it is no longer pending in any batch.
    coValuesToBatches.delete(coValueId);
    for (const batchId of completedBatchIds) {
      batchesForPeer.delete(batchId);
    }

    if (coValuesToBatches.size === 0) {
      this.reconcileBatchesByCoValue.delete(peerId);
    }
    if (batchesForPeer.size === 0) {
      this.reconcileBatches.delete(peerId);
    }

    return completedBatchIds;
  }

  clearPeer(peerId: PeerID): void {
    this.reconcileBatches.delete(peerId);
    this.reconcileBatchesByCoValue.delete(peerId);
  }
}
