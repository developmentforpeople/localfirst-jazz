import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CoValueCore } from "../coValueCore/coValueCore";
import type { RawCoID, SessionID, StorageAPI } from "../exports";
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

  return { client, peer, storage, map, pieces, deliver };
}

const spyCorrections = (peer: PeerState) => {
  const push = vi.spyOn(peer, "pushOutgoingMessage");
  return () =>
    push.mock.calls.filter(
      ([msg]) => msg.action === "known" && msg.isCorrection,
    );
};

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

const nothingHeld = (core: CoValueCore) =>
  core.contentWaitingForStorage.length === 0;

const settled = (core: CoValueCore) =>
  waitFor(() => core.isCompletelyDownloaded() && nothingHeld(core));

beforeEach(() => {
  SyncMessagesLog.clear();
});

describe.each(storages)("content arriving during a remount (%s)", (_, add) => {
  test("what storage already holds is not a gap", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);
    const corrections = spyCorrections(peer);
    const release = holdStream(storage);

    deliver(pieces.slice(-2));
    release();

    const core = client.node.getCoValue(map.id);
    await settled(core);
    expect(corrections()).toEqual([]);
    expect(core.knownState()).toEqual(map.core.knownState());
  });

  test("new content waits for the remount and lands in order", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    const cut = pieces.length - 2;
    deliver(pieces.slice(0, cut));
    // A peer that is ahead blocks the unmount. This is a device that restarted with part of the
    // CoValue on disk, which gets to the same place: nothing in memory and the rest on its way.
    vi.spyOn(client.node.syncManager, "isSyncedToServerPeers").mockReturnValue(
      true,
    );
    await unmount(client, map.id);
    const corrections = spyCorrections(peer);
    const release = holdStream(storage);

    deliver(pieces.slice(cut));
    release();

    const core = client.node.getCoValue(map.id);
    await settled(core);
    expect(corrections()).toEqual([]);
    expect(core.knownState()).toEqual(map.core.knownState());
  });

  test("a core that storage has only half filled does not judge a piece", async () => {
    const { client, peer, storage, map, pieces, deliver } = await setup(add);
    deliver(pieces);
    await unmount(client, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);
    const release = holdStream(storage);

    // Nobody here came from the network: a local read is what starts the remount.
    core.loadFromStorage();
    await core.waitForAvailable();
    expect(core.isStreaming()).toBe(true);
    deliver(pieces.slice(-1));
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

  test("the stream of a peer does not make its pieces wait for storage", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const cut = pieces.length - 2;
    const session = Object.keys(pieces[0]!.new)[0] as SessionID;
    const last = pieces[cut - 1]!.new[session]!;
    const onDisk = { [session]: last.after + last.newTransactions.length };
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    // The header beats storage, and declares more than storage holds.
    deliver(pieces.slice(0, 1));
    disk.push({ ...pieces[0]!, expectContentUntil: onDisk });
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
    disk.push(pieces[0]!);
    deliver(pieces.slice(-1));
    expect(core.contentWaitingForStorage).toHaveLength(1);

    disk.done(false);

    await waitFor(() => nothingHeld(core));
    expect(corrections()).toHaveLength(1);
  });

  test("a chunk that does not verify releases what was held", async () => {
    const { client, peer, storage, map, pieces, deliver } =
      await setup(addSyncStorage);
    const disk = scriptedStorage(storage, map.id);
    const core = client.node.getCoValue(map.id);
    const corrections = spyCorrections(peer);

    core.loadFromStorage();
    disk.push(pieces[0]!);
    deliver(pieces.slice(-1));
    expect(core.contentWaitingForStorage).toHaveLength(1);

    const session = Object.keys(pieces[1]!.new)[0] as SessionID;
    const corrupted = structuredClone(pieces[1]!);
    corrupted.new[session]!.lastSignature =
      pieces[2]!.new[session]!.lastSignature;
    disk.push(corrupted);

    await waitFor(() => nothingHeld(core));
    expect(corrections()).toHaveLength(1);
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
