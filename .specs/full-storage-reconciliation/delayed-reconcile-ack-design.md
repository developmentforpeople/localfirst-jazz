# Delayed Reconcile ACK for Storage Reconciliation

## Overview

Today, the server handles a `reconcile` batch by immediately replying with:

1. one `load` per out-of-sync CoValue, then
2. `reconcile-ack` for the batch.

This allows the client to send the next batch before the current batch has actually finished syncing content, which can create too much concurrent load on servers.

This design changes the behavior so the server sends `reconcile-ack` **only after all out-of-sync CoValues in that batch are fully synced**.

## Goal

Apply backpressure across reconciliation batches:

- The client should only send the next batch after the previous batch is actually synced.
- The server should not acknowledge a batch until all reconcile-triggered sync work for that batch is complete.

## Completion Semantics

A CoValue in a reconcile batch is considered complete when the server observes completion of the corresponding load request:

- `known` response: complete immediately.
- `content` response: complete when streaming finishes (existing `trackLoadRequestComplete` behavior).

This avoids relying on a strict known-state equality checkpoint, which can be unstable while writes continue.

## Scope

- **In scope**: server-side batching/ack behavior for `reconcile` in `packages/cojson/src/sync.ts`.
- **In scope**: tests validating delayed ACK behavior and batch backpressure.
- **Out of scope**: changing reconcile message format, lock scheduling strategy, or client-side batch ordering logic.

## Proposed Changes

### 1. Add server-side reconcile batch state tracking

**File:** `packages/cojson/src/sync.ts`

Track per-peer per-batch pending CoValues:

- `reconcileBatchState[peerId][batchId] = { pending: Set<RawCoID>, createdAt }`
- Reverse index for fast completion:
  - `reconcileBatchesByCoValue[peerId][coValueId] -> Set<batchId>`

Requirements:

- O(1)-ish completion update by CoValue ID.
- Safe cleanup on ack/disconnect.
- No global coupling between peers.

### 2. Update `handleReconcile` to defer ACK

**File:** `packages/cojson/src/sync.ts`

For each `[coValueId, sessionsHash]`:

- If in sync: do nothing.
- If out of sync: send `load` and register `coValueId` in batch `pending`.

After iteration:

- If `pending.size === 0`, send `reconcile-ack` immediately.
- Else, persist batch tracker and **do not** ack yet.

### 3. Mark reconcile items complete from existing receive paths

**File:** `packages/cojson/src/sync.ts`

After existing load-complete logic in:

- `handleKnownState`
- `handleNewContent`

call:

- `markReconcileItemComplete(peer.id, msg.id)`

`markReconcileItemComplete` behavior:

- Remove the CoValue from all pending batches for that peer.
- If a batch becomes empty, send `reconcile-ack` for that batch and clear tracker state.

### 4. Add lifecycle cleanup and safety guards

**File:** `packages/cojson/src/sync.ts`

- On peer close, clear outstanding reconcile batch trackers for that peer.
- Add optional stale-batch timeout logging and cleanup to avoid memory leaks in pathological cases.

### 5. Keep client-side behavior unchanged

`startStorageReconciliation` already waits for `reconcile-ack` before continuing to the next storage batch via `StorageReconciliationAckTracker.waitForAck`.

No protocol or client flow changes are required to gain backpressure once server ACK timing changes.

## Testing Plan

### Unit/Integration tests

**Likely files:** `packages/cojson/src/tests/*sync*.test.ts`

Add cases:

1. Server does not send `reconcile-ack` immediately after receiving a reconcile batch with mismatches.
2. Server sends `reconcile-ack` only after all mismatched CoValues complete (`known` or final `content`).
3. Delayed completion of one CoValue delays the batch ack.
4. Batch with only in-sync CoValues is acked immediately.
5. Peer disconnect mid-batch clears tracker state and does not emit stale ack after reconnect.
6. Client-side next-batch progression remains gated by ack (effective backpressure).

## Rollout Notes

- This is a server behavior change but wire-compatible (no message schema changes).
- Expected result: lower peak server load by reducing overlap between reconciliation batches.