import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CoValueCore } from "../coValueCore/coValueCore";
import type { RawCoID, RawCoMap, SessionID, StorageAPI } from "../exports";
import type { PeerState } from "../PeerState";
import type { StorageApiAsync } from "../storage/storageAsync";
import type { NewContentMessage } from "../sync";
import {
  SyncMessagesLog,
  TEST_NODE_CONFIG,
  fillCoMapWithLargeData,
  loadCoValueOrFail,
  setupTestNode,
  waitFor,
} from "./testUtils";

TEST_NODE_CONFIG.withAsyncPeers = true;

type Client = ReturnType<typeof setupTestNode>;

const storages = [
  ["sync", async (client: Client) => client.addStorage()],
  ["async", (client: Client) => client.addAsyncStorage()],
] as const;

/** A client that is owed a CoValue too big for one message, chunk by chunk. */
async function setup(
  addStorage: (client: Client) => Promise<{ storage: StorageAPI }>,
  { loadGroup = true } = {},
) {
  const server = setupTestNode({ isSyncServer: true });
  const group = server.node.createGroup();
  group.addMember("everyone", "writer");
  const map = group.createMap();
  fillCoMapWithLargeData(map);
  fillCoMapWithLargeData(map);
  for (let i = 0; i < 200; i++) {
    map.set(`more${i}`, "x".repeat(1024), "trusting");
  }
  const pieces = map.core.newContentSince(undefined) ?? [];
  expect(pieces.length).toBeGreaterThan(4);

  const client = setupTestNode();
  const { peerState: peer } = client.connectToSyncServer();
  const { storage } = await addStorage(client);
  // Without its group a piece waits for a dependency, and that is another queue.
  if (loadGroup) {
    await loadCoValueOrFail(client.node, group.id);
  }

  const deliver = (chunk: NewContentMessage[]) => {
    for (const piece of chunk) {
      client.node.syncManager.handleNewContent(piece, peer);
    }
  };

  return { client, peer, storage, group, map, pieces, deliver };
}

/** The first piece as storage sends it when it only has the pieces before `cut`. */
function announcing(pieces: NewContentMessage[], cut: number) {
  const session = Object.keys(pieces[0]!.new)[0] as SessionID;
  const last = pieces[cut - 1]!.new[session]!;

  return {
    ...pieces[0]!,
    expectContentUntil: { [session]: last.after + last.newTransactions.length },
  };
}

const spyCorrections = (peer: PeerState) => {
  const push = vi.spyOn(peer, "pushOutgoingMessage");
  return () =>
    push.mock.calls.filter(
      ([msg]) => msg.action === "known" && msg.isCorrection,
    );
};

const spyAcknowledgements = (peer: PeerState) => {
  const push = vi.spyOn(peer, "pushOutgoingMessage");
  return () =>
    push.mock.calls.filter(
      ([msg]) => msg.action === "known" && !msg.isCorrection,
    );
};

/** A device that restarted with the first pieces on disk: nothing mounted, the rest on its way. */
async function unmountWithPartOfTheContent(client: Client, id: RawCoID) {
  // A peer that is ahead blocks the unmount, and this gets to the same place.
  vi.spyOn(client.node.syncManager, "isSyncedToServerPeers").mockReturnValue(
    true,
  );
  await unmount(client, id);
}

async function unmount(client: Client, id: RawCoID) {
  await client.node.syncManager.waitForStorageSync(id);
  expect(client.node.internalUnmountCoValue(id)).toBe(true);
  expect(client.node.getCoValue(id).isAvailable()).toBe(false);
}

/**
 * Keeps the chunks of a sync storage in its queue until released. An async one needs no help: it
 * reads across ticks, and that is the window these tests are about.
 */
function holdStream(storage: StorageAPI) {
  if (!("streamingQueue" in storage)) {
    return () => {};
  }
  const queue = storage.streamingQueue as NonNullable<
    typeof storage.streamingQueue
  >;
  const pull = vi.spyOn(queue, "pull").mockReturnValue(undefined);
  return () => {
    pull.mockRestore();
    queue.emit();
  };
}

/** A piece that fits on any core: it comes from a session nobody has seen. */
async function anEditFromAnotherSession(map: RawCoMap) {
  const writer = setupTestNode({ connected: true });
  const copy = await loadCoValueOrFail<RawCoMap>(writer.node, map.id);
  await copy.core.waitForFullStreaming();
  const before = copy.core.knownState();
  copy.set("edit", "small", "trusting");
  const piece = copy.core.newContentSince(before)?.[0];
  if (!piece) {
    throw new Error("An edit always has content");
  }

  return { piece, session: Object.keys(piece.new)[0] as SessionID };
}

const nothingHeld = (core: CoValueCore) =>
  core.contentWaitingForStorage.length === 0;

const settled = (core: CoValueCore) =>
  waitFor(() => core.isCompletelyDownloaded() && nothingHeld(core));

beforeEach(() => {
  SyncMessagesLog.clear();
});

describe.each(storages)("content arriving during a remount (%s)", (_, add) => {
  test("what an unmounted CoValue has is answered without mounting it", async () => {
    const { client, peer, storage, group, map, pieces, deliver } =
      await setup(add);
    deliver(pieces);
    await unmount(client, map.id);
    await unmount(client, group.id);
    const load = vi.spyOn(storage, "load");
    const corrections = spyCorrections(peer);
    const acknowledgements = spyAcknowledgements(peer);
    const complete = vi.spyOn(peer, "trackLoadRequestComplete");
    peer.setKnownState(map.id, "empty");
    peer.toldKnownState.delete(map.id);

    // All of it from the start, header included, as a peer that never heard back.
    deliver(pieces);

    const core = client.node.getCoValue(map.id);
    expect(core.loadingState).toBe("garbageCollected");
    expect(client.node.getCoValue(group.id).loadingState).toBe(
      "garbageCollected",
    );
    expect(core.hasMissingDependencies()).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(corrections()).toEqual([]);
    expect(nothingHeld(core)).toBe(true);
    expect(acknowledgements()).toHaveLength(pieces.length);
    expect(acknowledgements().at(-1)?.[0]).toMatchObject({
      header: true,
      sessions: map.core.knownState().sessions,
    });
    expect(complete).toHaveBeenCalledTimes(pieces.length);
    expect(peer.toldKnownState.has(map.id)).toBe(true);
    // Who sent it has it, or this node would offer it back.
    expect(peer.getKnownState(map.id)?.sessions).toEqual(
      map.core.knownState().sessions,
    );
  });

  test("a duplicate completes the reconciliation it belongs to", async () => {
    const { client, peer, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);
    const push = vi.spyOn(peer, "pushOutgoingMessage");
    client.node.syncManager["ongoingStorageReconciliationTracker"].trackBatch(
      peer.id,
      "batch",
      new Set([map.id]),
    );

    deliver(pieces.slice(-1));

    expect(push).toHaveBeenCalledWith({ action: "reconcile-ack", id: "batch" });
  });

  test("a duplicate during a read closes what it answers", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);
    const core = client.node.getCoValue(map.id);
    const release = holdStream(storage);
    const push = vi.spyOn(peer, "pushOutgoingMessage");

    core.loadFromStorage();
    await core.waitForAvailable();
    expect(core.isStreaming()).toBe(true);
    peer.sendLoadRequest(core);
    client.node.syncManager["ongoingStorageReconciliationTracker"].trackBatch(
      peer.id,
      "batch",
      new Set([map.id]),
    );
    deliver(pieces.slice(-1));

    // The peer has nothing else to send for these, so nothing else would close them.
    expect(push).toHaveBeenCalledWith({ action: "reconcile-ack", id: "batch" });
    expect(peer["loadQueue"]["inFlightLoads"].has(map.id)).toBe(false);

    release();
    await settled(core);
  });

  test("the chunks of its own storage still mount it", async () => {
    const { client, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);

    const core = client.node.getCoValue(map.id);
    core.loadFromStorage();

    await settled(core);
    expect(core.knownState()).toEqual(map.core.knownState());
  });

  test("an import is not answered: it has no peer to answer to", async () => {
    const { client, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);

    client.node.syncManager.handleNewContent(pieces[0]!, "import");

    expect(client.node.getCoValue(map.id).isAvailable()).toBe(true);
  });

  test("new content waits for the remount and lands in order", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    const cut = pieces.length - 2;
    deliver(pieces.slice(0, cut));
    await unmountWithPartOfTheContent(client, map.id);
    const corrections = spyCorrections(peer);
    const release = holdStream(storage);

    deliver(pieces.slice(cut));
    release();

    const core = client.node.getCoValue(map.id);
    await settled(core);
    expect(corrections()).toEqual([]);
    expect(core.knownState()).toEqual(map.core.knownState());
  });

  test("what storage announced is answered without waiting for it", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);
    const acknowledgements = spyAcknowledgements(peer);
    const release = holdStream(storage);

    // Nobody here came from the network: a local read is what starts the remount.
    core.loadFromStorage();
    await core.waitForAvailable();
    expect(core.isStreaming()).toBe(true);
    deliver(pieces.slice(-1));

    expect(nothingHeld(core)).toBe(true);
    expect(acknowledgements()[0]?.[0]).toMatchObject({
      sessions: map.core.knownState().sessions,
    });

    release();
    await settled(core);
    expect(corrections()).toEqual([]);
    expect(core.knownState()).toEqual(map.core.knownState());
  });
});

describe("what a remount must not hold back", () => {
  const addSyncStorage = storages[0][1];

  /** A storage that delivers only when told to, and its own `done`. */
  function scriptedStorage(storage: StorageAPI, id: RawCoID) {
    const script = {
      push: (_chunk: NewContentMessage) => {},
      done: (_found: boolean) => {},
    };
    const load = storage.load.bind(storage);
    vi.spyOn(storage, "load").mockImplementation((loaded, callback, done) => {
      if (loaded !== id) {
        return load(loaded, callback, done);
      }
      script.push = callback;
      script.done = done ?? script.done;
    });
    return script;
  }

  test("a gap in a peer's own stream is still corrected", async () => {
    const { client, peer, map, pieces, deliver } = await setup(addSyncStorage);
    deliver(pieces.slice(0, 1));
    const core = client.node.getCoValue(map.id);
    expect(core.isStreaming()).toBe(true);
    const corrections = spyCorrections(peer);

    deliver(pieces.slice(2, 3));

    expect(corrections()).toHaveLength(1);
    expect(nothingHeld(core)).toBe(true);
  });

  test("an edit that fits does not wait for the read", async () => {
    const { client, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const edit = await anEditFromAnotherSession(map);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);

    core.loadFromStorage();
    disk.push(pieces[0]!);
    expect(core.isWaitingForStorage()).toBe(true);
    deliver([edit.piece]);

    expect(nothingHeld(core)).toBe(true);
    expect(core.knownState().sessions[edit.session]).toBe(1);
  });

  test("a piece that is ahead of the read is held, unanswered, and what fits is stored", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const cut = pieces.length - 2;
    const edit = await anEditFromAnotherSession(map);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);
    const acknowledgements = spyAcknowledgements(peer);
    const store = vi.spyOn(storage, "store");
    const push = vi.spyOn(peer, "pushOutgoingMessage");
    const pushedSoFar = () => push.mock.calls.length;

    core.loadFromStorage();
    disk.push(announcing(pieces, cut));
    const beforeThePiece = pushedSoFar();
    client.node.syncManager["ongoingStorageReconciliationTracker"].trackBatch(
      peer.id,
      "batch",
      new Set([map.id]),
    );
    deliver([
      { ...pieces[cut]!, new: { ...pieces[cut]!.new, ...edit.piece.new } },
    ]);

    expect(core.contentWaitingForStorage).toHaveLength(1);
    // Not a word to the peer until the piece is judged again.
    expect(pushedSoFar()).toBe(beforeThePiece);
    expect(acknowledgements()).toEqual([]);
    expect(core.knownState().sessions[edit.session]).toBe(1);
    expect(store.mock.calls[0]?.[0].new).toHaveProperty(edit.session);

    pieces.slice(1, cut).forEach(disk.push);
    await waitFor(() => nothingHeld(core));

    expect(corrections()).toEqual([]);
    expect(acknowledgements().length).toBeGreaterThan(0);
  });

  test("a piece storage does not fill is a gap when the read ends", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const cut = pieces.length - 2;
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    disk.push(announcing(pieces, cut));
    // One past the piece that would follow what is on disk.
    deliver(pieces.slice(cut + 1));
    expect(core.contentWaitingForStorage).toHaveLength(1);
    expect(corrections()).toEqual([]);

    pieces.slice(1, cut).forEach(disk.push);
    await waitFor(() => nothingHeld(core));

    expect(corrections()).toHaveLength(1);
  });

  test("a duplicate that announces more is not answered: it starts a stream", async () => {
    const { client, peer, map, pieces, deliver } = await setup(addSyncStorage);
    deliver(pieces.slice(0, -1));
    await unmountWithPartOfTheContent(client, map.id);
    const acknowledgements = spyAcknowledgements(peer);

    deliver(pieces.slice(0, 1));

    const core = client.node.getCoValue(map.id);
    expect(core.isStreaming()).toBe(true);
    expect(core.knownStateWithStreaming().sessions).toEqual(
      map.core.knownState().sessions,
    );
    expect(acknowledgements()[0]?.[0]).not.toMatchObject({
      sessions: map.core.knownState().sessions,
    });
  });

  test("what a failed read left behind is not answered from memory", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    deliver(pieces);
    await unmount(client, map.id);
    const core = client.node.getCoValue(map.id);
    const acknowledgements = spyAcknowledgements(peer);
    const corrections = spyCorrections(peer);
    vi.spyOn(storage, "load").mockImplementation((_id, _chunk, done) => {
      done?.(false);
    });

    core.loadFromStorage();
    expect(core.knownState().header).toBe(true);
    deliver(pieces.slice(-1));

    expect(acknowledgements()).toEqual([]);
    expect(corrections()).toHaveLength(1);
    expect(corrections()[0]?.[0]).toMatchObject({ header: false });
  });

  test("the stream of a peer does not make its pieces wait for storage", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const cut = pieces.length - 2;
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    // The header beats storage, and declares more than storage holds.
    deliver(pieces.slice(0, 1));
    disk.push(announcing(pieces, cut));
    deliver(pieces.slice(cut));
    expect(core.contentWaitingForStorage).toHaveLength(2);

    pieces.slice(1, cut).forEach(disk.push);
    expect(core.isStreaming()).toBe(true);
    await settled(core);

    expect(corrections()).toEqual([]);
    expect(core.knownState()).toEqual(map.core.knownState());
  });

  test("a read that fails halfway releases what was held", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    disk.push(announcing(pieces, 2));
    deliver(pieces.slice(-1));
    expect(core.contentWaitingForStorage).toHaveLength(1);

    disk.done(false);

    await waitFor(() => nothingHeld(core));
    expect(corrections().length).toBeGreaterThan(0);
  });

  test("a read that fails halfway takes back what was answered for it", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const acknowledgements = spyAcknowledgements(peer);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    disk.push(pieces[0]!);
    deliver(pieces.slice(-1));
    expect(acknowledgements()).toHaveLength(1);
    expect(corrections()).toEqual([]);
    peer.toldKnownState.delete(map.id);

    disk.done(false);

    expect(corrections()).toHaveLength(1);
    expect(peer.toldKnownState.has(map.id)).toBe(true);
    expect(corrections()[0]?.[0]).toMatchObject({
      sessions: core.knownState().sessions,
    });
  });

  test("a read that trips over a core already ahead of it promised nothing", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);

    // The pull reads a CoValue that is still arriving: the network is ahead of the disk.
    deliver(pieces.slice(0, 3));
    core.loadFromStorage();
    disk.push(announcing(pieces, 2));
    const corrections = spyCorrections(peer);

    // Racing the writes, the read can come up with a chunk that does not fit.
    disk.push(pieces.at(-1)!);

    expect(corrections()).toEqual([]);
  });

  test("a read that fails says nothing to a peer that is not following", async () => {
    const { client, peer, storage, map, pieces } = await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    disk.push(pieces[0]!);
    expect(peer.isCoValueSubscribedToPeer(map.id)).toBe(false);

    disk.done(false);

    expect(corrections()).toEqual([]);
  });

  test("an import that does not fit is no news about the read", async () => {
    const { client, storage, map, pieces } = await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const session = Object.keys(pieces[0]!.new)[0] as SessionID;
    const corrupted = structuredClone(pieces[1]!);
    corrupted.new[session]!.lastSignature =
      pieces[2]!.new[session]!.lastSignature;

    core.loadFromStorage();
    disk.push(pieces[0]!);
    client.node.syncManager.handleNewContent(pieces.at(-1)!, "import");
    client.node.syncManager.handleNewContent(corrupted, "import");

    expect(core.isWaitingForStorage()).toBe(true);
  });

  test("a chunk that does not verify releases what was held", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    disk.push(announcing(pieces, 3));
    deliver(pieces.slice(-1));
    expect(core.contentWaitingForStorage).toHaveLength(1);

    const session = Object.keys(pieces[1]!.new)[0] as SessionID;
    const corrupted = structuredClone(pieces[1]!);
    corrupted.new[session]!.lastSignature =
      pieces[2]!.new[session]!.lastSignature;
    disk.push(corrupted);

    await waitFor(() => nothingHeld(core));
    expect(corrections().length).toBeGreaterThan(0);
  });

  test("a chunk that leaves a gap on its own storage releases what was held", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);
    // Nothing reaches the server, so no answer of its can wake up what is held.
    vi.spyOn(peer, "pushOutgoingMessage").mockImplementation(() => {});

    core.loadFromStorage();
    disk.push(announcing(pieces, 3));
    deliver(pieces.slice(-1));
    expect(core.contentWaitingForStorage).toHaveLength(1);

    disk.push(pieces[2]!);

    await waitFor(() => nothingHeld(core));
    expect(corrections().length).toBeGreaterThan(0);
  });

  test("a deleted core expects nothing more from storage", async () => {
    const { client, storage, map, pieces } = await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);

    core.loadFromStorage();
    disk.push(pieces[0]!);
    expect(core.isWaitingForStorage()).toBe(true);

    // From here on the chunks of other sessions are skipped, so the announcement is never reached.
    core.isDeleted = true;

    expect(core.isWaitingForStorage()).toBe(false);
  });

  test("what storage announced does not move with its later writes", async () => {
    const { client, storage, map, pieces } = await setup(addSyncStorage);
    const session = Object.keys(pieces[0]!.new)[0] as SessionID;
    const announced = { ...map.core.knownState().sessions };
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);

    core.loadFromStorage();
    disk.push({ ...pieces[0]!, expectContentUntil: announced });
    // Storage announces the object it keeps writing on.
    announced[session] = announced[session]! + 1;
    pieces.slice(1).forEach(disk.push);

    expect(core.isWaitingForStorage()).toBe(false);
  });

  test("a write landing during a read does not change what the read announces", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(
      storages[1][1],
    );
    deliver(pieces);
    await unmount(client, map.id);
    const session = Object.keys(pieces[0]!.new)[0] as SessionID;
    const async = storage as StorageApiAsync;
    const read = async["dbClient"].getNewTransactionInSession.bind(
      async["dbClient"],
    );
    const corrections = spyCorrections(peer);

    // After the sessions were read and before the first chunk is delivered.
    vi.spyOn(
      async["dbClient"],
      "getNewTransactionInSession",
    ).mockImplementation((...args) => {
      async.knownStates.getKnownState(map.id).sessions[session]! += 1;
      return read(...args);
    });
    const core = client.node.getCoValue(map.id);
    core.loadFromStorage();

    await settled(core);
    expect(corrections()).toEqual([]);
    expect(core.knownState()).toEqual(map.core.knownState());
  });

  test("a chunk parked on a dependency does not wait for itself", async () => {
    const { client, storage, map, pieces } = await setup(addSyncStorage, {
      loadGroup: false,
    });
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    core.loadFromStorage();

    pieces.forEach(disk.push);
    expect(core.hasMissingDependencies()).toBe(true);

    await settled(core);
    expect(core.knownState()).toEqual(map.core.knownState());
  });
});

const unreadable = () => {
  throw new Error("Failed to read large IndexedDB value");
};

describe.each(storages)("a read that rejects (%s)", (_, add) => {
  test("answers as a miss and asks the peer", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    const cut = pieces.length - 2;
    deliver(pieces.slice(0, cut));
    await unmountWithPartOfTheContent(client, map.id);
    const corrections = spyCorrections(peer);
    const dbClient = (storage as unknown as StorageApiAsync)["dbClient"];
    vi.spyOn(dbClient, "getCoValue").mockImplementation(unreadable);

    deliver(pieces.slice(cut, cut + 1));

    const core = client.node.getCoValue(map.id);
    await waitFor(() => core.isCompletelyDownloaded());
    expect(corrections()[0]?.[0]).toMatchObject({ header: false });
    expect(core.knownState()).toEqual(map.core.knownState());
    expect(core.getLoadingStateForPeer("storage")).toBe("unavailable");
  });

  test("does not answer again a read that already answered", async () => {
    const { client, storage, map } = await setup(add);
    vi.spyOn(storage, "load").mockImplementation((_id, _chunk, done) => {
      done?.(true);
      return Promise.reject(new Error("after the answer")) as never;
    });
    const done = vi.fn();

    client.node.getCoValue(map.id).loadFromStorage(done);
    await new Promise((resolve) => setTimeout(resolve));

    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(true);
  });
});

describe("a read that rejects halfway", () => {
  const addAsyncStorage = storages[1][1];

  test("releases what was held and corrects the peer", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addAsyncStorage);
    const cut = pieces.length - 2;
    deliver(pieces.slice(0, cut));
    await unmountWithPartOfTheContent(client, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);
    const dbClient = (storage as StorageApiAsync)["dbClient"];
    const read = dbClient.getNewTransactionInSession.bind(dbClient);
    let reject = (_error: Error) => {};
    const broken = new Promise<never>((_resolve, rejectRead) => {
      reject = rejectRead;
    });
    vi.spyOn(dbClient, "getNewTransactionInSession")
      .mockImplementationOnce(read)
      .mockImplementation(() => broken);

    core.loadFromStorage();
    await core.waitForAvailable();
    deliver(pieces.slice(cut));
    expect(core.contentWaitingForStorage.length).toBeGreaterThan(0);

    reject(new Error("Failed to read large IndexedDB value"));

    await waitFor(() => nothingHeld(core));
    expect(corrections().length).toBeGreaterThan(0);
    expect(core.getLoadingStateForPeer("storage")).toBe("unavailable");
  });

  test("a dependency that cannot be read does not leave the read hanging", async () => {
    const { client, storage, group, map, pieces, deliver } =
      await setup(addAsyncStorage);
    deliver(pieces);
    await unmount(client, map.id);
    storage.onCoValueUnmounted(group.id);
    const dbClient = (storage as StorageApiAsync)["dbClient"];
    const read = dbClient.getCoValue.bind(dbClient);
    vi.spyOn(dbClient, "getCoValue").mockImplementation((id) =>
      id === group.id ? unreadable() : read(id),
    );
    const done = vi.fn();

    client.node.getCoValue(map.id).loadFromStorage(done);

    await waitFor(() => done.mock.calls.length > 0);
    expect(done).toHaveBeenCalledWith(false);
  });
});
