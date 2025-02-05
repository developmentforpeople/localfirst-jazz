import { commands } from "@vitest/browser/context";
import { Account, AuthSecretStorage, CoMap, Group, co } from "jazz-tools";
import { afterEach, describe, expect, test } from "vitest";
import { createAccountContext, getSyncServerUrl, waitFor } from "./testUtils";

class TestMap extends CoMap {
  value = co.string;
}

class CustomAccount extends Account {
  root = co.ref(TestMap);

  migrate() {
    if (!this.root) {
      this.root = TestMap.create({ value: "initial" }, { owner: this });
    }
  }
}

describe("Browser sync", () => {
  afterEach(async () => {
    const authStorage = new AuthSecretStorage();
    await authStorage.clear();
  });

  test("syncs data between accounts through sync server", async () => {
    const { account: account1, contextManager } = await createAccountContext({
      sync: {
        peer: getSyncServerUrl(),
      },
      storage: "indexedDB",
      AccountSchema: CustomAccount,
    });

    const group = Group.create(account1);
    const map = TestMap.create({ value: "test data" }, group);
    group.addMember("everyone", "reader");

    await map.waitForSync();

    // Clearing the credentials storage so the next auth will be a new account
    await contextManager.getAuthSecretStorage().clear();

    const { account: account2 } = await createAccountContext({
      sync: {
        peer: getSyncServerUrl(),
      },
      storage: "indexedDB",
      AccountSchema: CustomAccount,
    });
    // Load map in second account
    const loadedMap = await TestMap.load(map.id, account2, {});

    expect(loadedMap).toBeDefined();
    expect(loadedMap?.value).toBe("test data");
  });

  test("syncs data between accounts through storage only", async () => {
    const { context, contextManager } = await createAccountContext({
      sync: {
        when: "never",
      },
      storage: "indexedDB",
      AccountSchema: CustomAccount,
    });

    const group = Group.create(context.me);
    const map = TestMap.create({ value: "test data" }, group);
    group.addMember("everyone", "reader");

    await map.waitForSync();

    // Clearing the credentials storage so the next auth will be a new account
    await contextManager.getAuthSecretStorage().clear();

    const { account: account2 } = await createAccountContext({
      sync: {
        when: "never",
      },
      storage: "indexedDB",
      AccountSchema: CustomAccount,
    });

    // TODO: Wait for sync doesn't work on the IndexedDB storage peer as it just waits for the content to be pushed
    await new Promise((resolve) => setTimeout(resolve, 500));

    const loadedMap = await TestMap.load(map.id, account2, {});

    expect(loadedMap).toBeDefined();
    expect(loadedMap?.value).toBe("test data");
  });

  test("syncs data between accounts when the the storage is shared but the sync server is not", async () => {
    const { context, contextManager } = await createAccountContext({
      sync: {
        peer: getSyncServerUrl(),
      },
      storage: "indexedDB",
      AccountSchema: CustomAccount,
    });

    const group = Group.create(context.me);
    const map = TestMap.create({ value: "test data" }, group);
    group.addMember("everyone", "reader");

    await map.waitForSync();

    // Clearing the credentials storage so the next auth will be a new account
    await contextManager.getAuthSecretStorage().clear();

    const newSyncServer = await commands.startSyncServer();

    const { account: account2 } = await createAccountContext({
      sync: {
        peer: newSyncServer.url,
      },
      storage: "indexedDB",
      AccountSchema: CustomAccount,
    });

    // TODO: Wait for sync doesn't work on the IndexedDB storage peer as it just waits for the content to be pushed
    await new Promise((resolve) => setTimeout(resolve, 500));

    const loadedMap = await TestMap.load(map.id, account2, {});

    expect(loadedMap).toBeDefined();
    expect(loadedMap?.value).toBe("test data");
  });
});
