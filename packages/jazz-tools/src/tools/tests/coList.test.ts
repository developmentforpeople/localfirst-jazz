import { WasmCrypto } from "cojson/crypto/WasmCrypto";
import { assert, beforeEach, describe, expect, test, vi } from "vitest";
import { Account, Group, subscribeToCoValue, z } from "../index.js";
import {
  Loaded,
  activeAccountContext,
  co,
  coValueClassFromCoValueClassOrSchema,
} from "../internal.js";
import {
  createJazzTestAccount,
  runWithoutActiveAccount,
  setupJazzTestSync,
} from "../testing.js";
import { waitFor } from "./utils.js";

const Crypto = await WasmCrypto.create();

let me = await Account.create({
  creationProps: { name: "Hermes Puggington" },
  crypto: Crypto,
});

beforeEach(async () => {
  await setupJazzTestSync();

  me = await createJazzTestAccount({
    isCurrentActiveAccount: true,
    creationProps: { name: "Hermes Puggington" },
  });
});

describe("Simple CoList operations", async () => {
  const TestList = co.list(z.string());

  const list = TestList.create(["bread", "butter", "onion"], { owner: me });

  test("Construction", () => {
    expect(list[0]).toBe("bread");
    expect(list[1]).toBe("butter");
    expect(list[2]).toBe("onion");
    expect(list._raw.asArray()).toEqual(["bread", "butter", "onion"]);
    expect(list.length).toBe(3);
    expect(list.map((item) => item.toUpperCase())).toEqual([
      "BREAD",
      "BUTTER",
      "ONION",
    ]);
  });

  test("list with enum type", () => {
    const List = co.list(z.enum(["a", "b", "c"]));
    const list = List.create(["a", "b", "c"]);
    expect(list.length).toBe(3);
    expect(list[0]).toBe("a");
    expect(list[1]).toBe("b");
    expect(list[2]).toBe("c");
  });

  test("create CoList with reference using CoValue", () => {
    const Dog = co.map({
      name: z.string(),
    });
    const Person = co.map({
      pets: co.list(Dog),
    });

    const person = Person.create({
      pets: [Dog.create({ name: "Rex" }), Dog.create({ name: "Fido" })],
    });

    expect(person.pets.length).toEqual(2);
    expect(person.pets[0]?.name).toEqual("Rex");
    expect(person.pets[1]?.name).toEqual("Fido");
  });

  describe("create CoList with reference using JSON", () => {
    test("automatically creates CoValues for nested objects", () => {
      const Dog = co.map({
        name: z.string(),
      });
      const Person = co.map({
        pets: co.list(Dog),
      });

      const person = Person.create({
        pets: [{ name: "Rex" }, { name: "Fido" }],
      });

      expect(person.pets.length).toEqual(2);
      expect(person.pets[0]?.name).toEqual("Rex");
      expect(person.pets[1]?.name).toEqual("Fido");
    });

    test("can create a coPlainText from an empty string", () => {
      const Schema = co.list(co.plainText());
      const list = Schema.create([""]);
      expect(list[0]?.toString()).toBe("");
    });
  });

  test("list with nullable content", () => {
    const List = co.list(z.string().nullable());
    const list = List.create(["a", "b", "c", null]);
    expect(list.length).toBe(4);
    expect(list[0]).toBe("a");
    expect(list[1]).toBe("b");
    expect(list[2]).toBe("c");
    expect(list[3]).toBeNull();
  });

  test("Construction with an Account", () => {
    const list = TestList.create(["milk"], me);

    expect(list[0]).toEqual("milk");
  });

  test("Construction with a Group", () => {
    const group = Group.create(me);
    const list = TestList.create(["milk"], group);

    expect(list[0]).toEqual("milk");
  });

  describe("Mutation", () => {
    test("assignment", () => {
      const list = TestList.create(["bread", "butter", "onion"], {
        owner: me,
      });
      list[1] = "margarine";
      expect(list._raw.asArray()).toEqual(["bread", "margarine", "onion"]);
      expect(list[1]).toBe("margarine");
    });

    test("assignment with ref", () => {
      const Ingredient = co.map({
        name: z.string(),
      });

      const Recipe = co.list(Ingredient);

      const recipe = Recipe.create(
        [
          Ingredient.create({ name: "bread" }, me),
          Ingredient.create({ name: "butter" }, me),
          Ingredient.create({ name: "onion" }, me),
        ],
        { owner: me },
      );

      recipe[1] = Ingredient.create({ name: "margarine" }, me);
      expect(recipe[1]?.name).toBe("margarine");
    });

    test("assign undefined on a required ref", () => {
      const Ingredient = co.map({
        name: z.string(),
      });

      const Recipe = co.list(Ingredient);

      const recipe = Recipe.create(
        [
          Ingredient.create({ name: "bread" }, me),
          Ingredient.create({ name: "butter" }, me),
          Ingredient.create({ name: "onion" }, me),
        ],
        { owner: me },
      );

      expect(() => {
        recipe[1] = undefined as unknown as Loaded<typeof Ingredient>;
      }).toThrow("Cannot set required reference 1 to undefined");

      expect(recipe[1]?.name).toBe("butter");
    });

    test("assign undefined on an optional ref", () => {
      const Ingredient = co.map({
        name: z.string(),
      });

      const Recipe = co.list(co.optional(Ingredient));

      const recipe = Recipe.create(
        [
          Ingredient.create({ name: "bread" }, me),
          Ingredient.create({ name: "butter" }, me),
          Ingredient.create({ name: "onion" }, me),
        ],
        { owner: me },
      );

      recipe[1] = undefined;
      expect(recipe[1]).toBe(undefined);
    });

    test("push", () => {
      const list = TestList.create(["bread", "butter", "onion"], {
        owner: me,
      });
      list.push("cheese");
      expect(list[3]).toBe("cheese");
      expect(list._raw.asArray()).toEqual([
        "bread",
        "butter",
        "onion",
        "cheese",
      ]);
    });

    test("unshift", () => {
      const list = TestList.create(["bread", "butter", "onion"], {
        owner: me,
      });
      list.unshift("lettuce");
      expect(list[0]).toBe("lettuce");
      expect(list._raw.asArray()).toEqual([
        "lettuce",
        "bread",
        "butter",
        "onion",
      ]);
    });

    test("pop", () => {
      const list = TestList.create(["bread", "butter", "onion"], {
        owner: me,
      });
      expect(list.pop()).toBe("onion");
      expect(list.length).toBe(2);
      expect(list._raw.asArray()).toEqual(["bread", "butter"]);
    });

    test("shift", () => {
      const list = TestList.create(["bread", "butter", "onion"], {
        owner: me,
      });
      expect(list.shift()).toBe("bread");
      expect(list.length).toBe(2);
      expect(list._raw.asArray()).toEqual(["butter", "onion"]);
    });

    describe("splice", () => {
      test("insert after 1st item with 1 item removed", () => {
        const list = TestList.create(["bread", "butter", "onion"], {
          owner: me,
        });
        list.splice(1, 1, "salt", "pepper");
        expect(list.length).toBe(4);
        expect(list._raw.asArray()).toEqual([
          "bread",
          "salt",
          "pepper",
          "onion",
        ]);
      });

      test("insert before 1st item", () => {
        const list = TestList.create(["bread", "butter", "onion"], {
          owner: me,
        });
        list.splice(0, 0, "salt", "pepper");
        expect(list.length).toBe(5);
        expect(list._raw.asArray()).toEqual([
          "salt",
          "pepper",
          "bread",
          "butter",
          "onion",
        ]);
      });

      test("insert after 1st item", () => {
        const list = TestList.create(["bread", "butter", "onion"], {
          owner: me,
        });
        list.splice(1, 0, "salt", "pepper");
        expect(list.length).toBe(5);
        expect(list._raw.asArray()).toEqual([
          "bread",
          "salt",
          "pepper",
          "butter",
          "onion",
        ]);
      });

      test("insert after 2nd item", () => {
        const list = TestList.create(["bread", "butter", "onion"], {
          owner: me,
        });
        list.splice(2, 0, "salt", "pepper");
        expect(list.length).toBe(5);
        expect(list._raw.asArray()).toEqual([
          "bread",
          "butter",
          "salt",
          "pepper",
          "onion",
        ]);
      });
    });

    test("sort", () => {
      const list = TestList.create(
        ["hedgehog", "giraffe", "iguana", "flamingo"],
        { owner: me },
      );

      list.sort();
      expect(list._raw.asArray()).toEqual([
        "flamingo",
        "giraffe",
        "hedgehog",
        "iguana",
      ]);

      list.sort((a, b) => b.localeCompare(a));
      expect(list._raw.asArray()).toEqual([
        "iguana",
        "hedgehog",
        "giraffe",
        "flamingo",
      ]);
    });

    test("sort list of refs", async () => {
      const Message = co.map({
        text: z.string(),
      });

      const Chat = co.list(Message);

      const chat = Chat.create(
        [
          Message.create({ text: "world" }, { owner: me }),
          Message.create({ text: "hello" }, { owner: me }),
        ],
        { owner: me },
      );

      chat.sort((a, b) => a!.text.localeCompare(b!.text));
      expect(chat.map((m) => m!.text)).toEqual(["hello", "world"]);

      chat.push(Message.create({ text: "beans on toast" }, { owner: me }));
      chat.sort((a, b) => a!.text.localeCompare(b!.text));
      expect(chat.map((m) => m!.text)).toEqual([
        "beans on toast",
        "hello",
        "world",
      ]);
    });

    test("applyDiff", () => {
      const list = TestList.create(["bread", "butter", "onion"], {
        owner: me,
      });
      // replace
      list.applyDiff(["bread", "margarine", "onion"]);
      expect(list._raw.asArray()).toEqual(["bread", "margarine", "onion"]);
      // delete
      list.applyDiff(["bread", "onion"]);
      expect(list._raw.asArray()).toEqual(["bread", "onion"]);
      // insert multiple
      list.applyDiff(["bread", "margarine", "onion", "cheese"]);
      expect(list._raw.asArray()).toEqual([
        "bread",
        "margarine",
        "onion",
        "cheese",
      ]);
    });

    test("filter + assign to coMap", () => {
      const TestMap = co.map({
        list: TestList,
      });

      const map = TestMap.create(
        {
          list: TestList.create(["bread", "butter", "onion"], {
            owner: me,
          }),
        },
        { owner: me },
      );

      expect(() => {
        // @ts-expect-error
        map.list = map.list?.filter((item) => item !== "butter");
      }).toThrow("Cannot set reference list to a non-CoValue. Got bread,onion");

      expect(map.list?._raw.asArray()).toEqual(["bread", "butter", "onion"]);
    });

    test("filter + assign to CoList", () => {
      const TestListOfLists = co.list(TestList);

      const list = TestListOfLists.create(
        [
          TestList.create(["bread", "butter", "onion"], {
            owner: me,
          }),
        ],
        { owner: me },
      );

      expect(() => {
        // @ts-expect-error
        list[0] = list[0]?.filter((item) => item !== "butter");
      }).toThrow("Cannot set reference 0 to a non-CoValue. Got bread,onion");

      expect(list[0]?._raw.asArray()).toEqual(["bread", "butter", "onion"]);
    });
  });
});

describe("CoList applyDiff operations", async () => {
  test("applyDiff with primitive values", () => {
    const StringList = co.list(z.string());
    const list = StringList.create(["a", "b", "c"], { owner: me });

    // Test adding items
    list.applyDiff(["a", "b", "c", "d", "e"]);
    expect(list._raw.asArray()).toEqual(["a", "b", "c", "d", "e"]);

    // Test removing items
    list.applyDiff(["a", "c", "e"]);
    expect(list._raw.asArray()).toEqual(["a", "c", "e"]);

    // Test replacing items
    list.applyDiff(["x", "y", "z"]);
    expect(list._raw.asArray()).toEqual(["x", "y", "z"]);

    // Test empty list
    list.applyDiff([]);
    expect(list._raw.asArray()).toEqual([]);
  });

  test("applyDiff with reference values", () => {
    const NestedItem = co.list(z.string());
    const RefList = co.list(NestedItem);

    const item1 = NestedItem.create(["item1"], { owner: me });
    const item2 = NestedItem.create(["item2"], { owner: me });
    const item3 = NestedItem.create(["item3"], { owner: me });
    const item4 = NestedItem.create(["item4"], { owner: me });

    const list = RefList.create([item1, item2], { owner: me });

    // Test adding reference items
    list.applyDiff([item1, item2, item3]);
    expect(list.length).toBe(3);
    expect(list[2]?.[0]).toBe("item3");

    // Test removing reference items
    list.applyDiff([item1, item3]);
    expect(list.length).toBe(2);
    expect(list[0]?.[0]).toBe("item1");
    expect(list[1]?.[0]).toBe("item3");

    // Test replacing reference items
    list.applyDiff([item4]);
    expect(list.length).toBe(1);
    expect(list[0]?.[0]).toBe("item4");

    // Test empty list
    list.applyDiff([]);
    expect(list._raw.asArray()).toEqual([]);
  });

  test("applyDiff with refs + filter", () => {
    const TestMap = co.map({
      type: z.string(),
    });

    const TestList = co.list(TestMap);

    const bread = TestMap.create({ type: "bread" }, me);
    const butter = TestMap.create({ type: "butter" }, me);
    const onion = TestMap.create({ type: "onion" }, me);

    const list = TestList.create([bread, butter, onion], me);

    list.applyDiff(list.filter((item) => item?.type !== "butter"));

    expect(list._raw.asArray()).toEqual([bread.id, onion.id]);
  });

  test("applyDiff with mixed operations", () => {
    const StringList = co.list(z.string());
    const list = StringList.create(["a", "b", "c", "d", "e"], { owner: me });

    // Test multiple operations at once
    list.applyDiff(["a", "x", "c", "y", "e"]);
    expect(list._raw.asArray()).toEqual(["a", "x", "c", "y", "e"]);

    // Test reordering
    list.applyDiff(["e", "c", "a", "y", "x"]);
    expect(list._raw.asArray()).toEqual(["e", "c", "a", "y", "x"]);

    // Test partial update
    list.applyDiff(["e", "c", "new", "y", "x"]);
    expect(list._raw.asArray()).toEqual(["e", "c", "new", "y", "x"]);
  });
});

describe("CoList resolution", async () => {
  const TwiceNestedList = co.list(z.string());

  const NestedList = co.list(TwiceNestedList);

  const TestList = co.list(NestedList);

  const initNodeAndList = async () => {
    const me = await Account.create({
      creationProps: { name: "Hermes Puggington" },
      crypto: Crypto,
    });

    const list = TestList.create(
      [
        NestedList.create([TwiceNestedList.create(["a", "b"], { owner: me })], {
          owner: me,
        }),
        NestedList.create([TwiceNestedList.create(["c", "d"], { owner: me })], {
          owner: me,
        }),
      ],
      { owner: me },
    );

    return { me, list };
  };

  test("Construction", async () => {
    const { list } = await initNodeAndList();

    expect(list[0]?.[0]?.[0]).toBe("a");
    expect(list[0]?.[0]?.join(",")).toBe("a,b");
    expect(list[0]?.[0]?.id).toBeDefined();
    expect(list[1]?.[0]?.[0]).toBe("c");
  });
});

describe("CoList subscription", async () => {
  test("subscription on a locally available list with deep resolve", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const list = TestList.create(
      [Item.create({ name: "Item 1" }), Item.create({ name: "Item 2" })],
      { owner: me },
    );

    const updates: Loaded<typeof TestList, { $each: true }>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    TestList.subscribe(
      list.id,
      {
        resolve: {
          $each: true,
        },
      },
      spy,
    );

    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledTimes(1);

    expect(updates[0]?.[0]?.name).toEqual("Item 1");
    expect(updates[0]?.[1]?.name).toEqual("Item 2");

    list[0]!.name = "Updated Item 1";

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(updates[1]?.[0]?.name).toEqual("Updated Item 1");
    expect(updates[1]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("subscription on a locally available list with autoload", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const list = TestList.create(
      [Item.create({ name: "Item 1" }), Item.create({ name: "Item 2" })],
      { owner: me },
    );

    const updates: Loaded<typeof TestList>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    TestList.subscribe(list.id, {}, spy);

    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledTimes(1);

    expect(updates[0]?.[0]?.name).toEqual("Item 1");
    expect(updates[0]?.[1]?.name).toEqual("Item 2");

    list[0]!.name = "Updated Item 1";

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(updates[1]?.[0]?.name).toEqual("Updated Item 1");
    expect(updates[1]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("subscription on a locally available list with syncResolution", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const list = TestList.create(
      [Item.create({ name: "Item 1" }), Item.create({ name: "Item 2" })],
      { owner: me },
    );

    const updates: Loaded<typeof TestList>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    subscribeToCoValue(
      coValueClassFromCoValueClassOrSchema(TestList),
      list.id,
      {
        syncResolution: true,
        loadAs: Account.getMe(),
      },
      spy,
    );

    expect(spy).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);

    expect(updates[0]?.[0]?.name).toEqual("Item 1");
    expect(updates[0]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(1);

    list[0]!.name = "Updated Item 1";

    expect(spy).toHaveBeenCalledTimes(2);

    expect(updates[1]?.[0]?.name).toEqual("Updated Item 1");
    expect(updates[1]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("subscription on a remotely available list with deep resolve", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const group = Group.create();
    group.addMember("everyone", "writer");

    const list = TestList.create(
      [
        Item.create({ name: "Item 1" }, group),
        Item.create({ name: "Item 2" }, group),
      ],
      group,
    );

    const userB = await createJazzTestAccount();

    const updates: Loaded<typeof TestList, { $each: true }>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    TestList.subscribe(
      list.id,
      {
        resolve: {
          $each: true,
        },
        loadAs: userB,
      },
      spy,
    );

    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledTimes(1);

    expect(updates[0]?.[0]?.name).toEqual("Item 1");
    expect(updates[0]?.[1]?.name).toEqual("Item 2");

    list[0]!.name = "Updated Item 1";

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(updates[1]?.[0]?.name).toEqual("Updated Item 1");
    expect(updates[1]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("subscription on a remotely available list with autoload", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const group = Group.create();
    group.addMember("everyone", "writer");

    const list = TestList.create(
      [
        Item.create({ name: "Item 1" }, group),
        Item.create({ name: "Item 2" }, group),
      ],
      group,
    );

    const updates: Loaded<typeof TestList>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    const userB = await createJazzTestAccount();

    TestList.subscribe(
      list.id,
      {
        loadAs: userB,
      },
      spy,
    );

    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledTimes(1);

    expect(updates[0]?.[0]?.name).toEqual("Item 1");
    expect(updates[0]?.[1]?.name).toEqual("Item 2");

    list[0]!.name = "Updated Item 1";

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(updates[1]?.[0]?.name).toEqual("Updated Item 1");
    expect(updates[1]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("replacing list items triggers updates", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const list = TestList.create(
      [Item.create({ name: "Item 1" }), Item.create({ name: "Item 2" })],
      { owner: me },
    );

    const updates: Loaded<typeof TestList, { $each: true }>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    TestList.subscribe(
      list.id,
      {
        resolve: {
          $each: true,
        },
      },
      spy,
    );

    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledTimes(1);

    expect(updates[0]?.[0]?.name).toEqual("Item 1");
    expect(updates[0]?.[1]?.name).toEqual("Item 2");

    list[0] = Item.create({ name: "New Item 1" });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(updates[1]?.[0]?.name).toEqual("New Item 1");
    expect(updates[1]?.[1]?.name).toEqual("Item 2");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("pushing a new item triggers updates correctly", async () => {
    const Item = co.map({
      name: z.string(),
    });

    const TestList = co.list(Item);

    const group = Group.create();
    group.addMember("everyone", "writer");

    const list = TestList.create(
      [
        Item.create({ name: "Item 1" }, group),
        Item.create({ name: "Item 2" }, group),
      ],
      group,
    );

    const updates: Loaded<typeof TestList, { $each: true }>[] = [];
    const spy = vi.fn((list) => updates.push(list));

    const userB = await createJazzTestAccount();

    TestList.subscribe(
      list.id,
      {
        loadAs: userB,
        resolve: {
          $each: true,
        },
      },
      (update) => {
        spy(update);

        // The update should be triggered only when the new item is loaded
        for (const item of update) {
          expect(item).toBeDefined();
        }
      },
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledTimes(1);

    list.push(Item.create({ name: "Item 3" }, group));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("loading a nested list with deep resolve and $onError", async () => {
    const Dog = co.map({
      name: z.string(),
      breed: z.string(),
    });

    const Person = co.map({
      name: z.string(),
      age: z.number(),
      dogs: co.list(Dog),
    });

    const person = Person.create(
      {
        name: "John",
        age: 20,
        dogs: Person.shape.dogs.create([
          { name: "Rex", breed: "Labrador" },
          { name: "Fido", breed: "Poodle" },
        ]),
      },
      Group.create().makePublic(),
    );

    const bob = await createJazzTestAccount();

    const loadedPerson = await Person.load(person.id, {
      resolve: { dogs: { $onError: null } },
      loadAs: bob,
    });

    assert(loadedPerson);
    expect(loadedPerson.name).toBe("John");
    expect(loadedPerson.dogs).toBeNull();
  });
});

describe("CoList unique methods", () => {
  test("loadUnique returns existing list", async () => {
    const ItemList = co.list(z.string());
    const group = Group.create();

    const originalList = ItemList.create(["item1", "item2", "item3"], {
      owner: group,
      unique: "test-list",
    });

    const foundList = await ItemList.loadUnique("test-list", group.id);
    expect(foundList).toEqual(originalList);
    expect(foundList?.length).toBe(3);
    expect(foundList?.[0]).toBe("item1");
  });

  test("loadUnique returns null for non-existent list", async () => {
    const ItemList = co.list(z.string());
    const group = Group.create();

    const foundList = await ItemList.loadUnique("non-existent", group.id);
    expect(foundList).toBeNull();
  });

  test("upsertUnique creates new list when none exists", async () => {
    const ItemList = co.list(z.string());
    const group = Group.create();

    const sourceData = ["item1", "item2", "item3"];

    const result = await ItemList.upsertUnique({
      value: sourceData,
      unique: "new-list",
      owner: group,
    });

    expect(result).not.toBeNull();
    expect(result?.length).toBe(3);
    expect(result?.[0]).toBe("item1");
    expect(result?.[1]).toBe("item2");
    expect(result?.[2]).toBe("item3");
  });

  test("upsertUnique without an active account", async () => {
    const account = activeAccountContext.get();
    const ItemList = co.list(z.string());

    const sourceData = ["item1", "item2", "item3"];

    const result = await runWithoutActiveAccount(() => {
      return ItemList.upsertUnique({
        value: sourceData,
        unique: "new-list",
        owner: account,
      });
    });

    expect(result).not.toBeNull();
    expect(result?.length).toBe(3);
    expect(result?.[0]).toBe("item1");
    expect(result?.[1]).toBe("item2");
    expect(result?.[2]).toBe("item3");

    expect(result?._owner).toEqual(account);
  });

  test("upsertUnique updates existing list", async () => {
    const ItemList = co.list(z.string());
    const group = Group.create();

    // Create initial list
    const originalList = ItemList.create(["original1", "original2"], {
      owner: group,
      unique: "update-list",
    });

    // Upsert with new data
    const updatedList = await ItemList.upsertUnique({
      value: ["updated1", "updated2", "updated3"],
      unique: "update-list",
      owner: group,
    });

    expect(updatedList).toEqual(originalList); // Should be the same instance
    expect(updatedList?.length).toBe(3);
    expect(updatedList?.[0]).toBe("updated1");
    expect(updatedList?.[1]).toBe("updated2");
    expect(updatedList?.[2]).toBe("updated3");
  });

  test("upsertUnique with CoValue items", async () => {
    const Item = co.map({
      name: z.string(),
      value: z.number(),
    });
    const ItemList = co.list(Item);
    const group = Group.create();

    const items = [
      Item.create({ name: "First", value: 1 }, group),
      Item.create({ name: "Second", value: 2 }, group),
    ];

    const result = await ItemList.upsertUnique({
      value: items,
      unique: "item-list",
      owner: group,
      resolve: { $each: true },
    });

    expect(result).not.toBeNull();
    expect(result?.length).toBe(2);
    expect(result?.[0]?.name).toBe("First");
    expect(result?.[1]?.name).toBe("Second");
  });

  test("upsertUnique updates list with CoValue items", async () => {
    const Item = co.map({
      name: z.string(),
      value: z.number(),
    });
    const ItemList = co.list(Item);
    const group = Group.create();

    // Create initial list
    const initialItems = [Item.create({ name: "Initial", value: 0 }, group)];
    const originalList = ItemList.create(initialItems, {
      owner: group,
      unique: "updateable-item-list",
    });

    // Upsert with new items
    const newItems = [
      Item.create({ name: "Updated", value: 1 }, group),
      Item.create({ name: "Added", value: 2 }, group),
    ];

    const updatedList = await ItemList.upsertUnique({
      value: newItems,
      unique: "updateable-item-list",
      owner: group,
      resolve: { $each: true },
    });

    expect(updatedList).toEqual(originalList); // Should be the same instance
    expect(updatedList?.length).toBe(2);
    expect(updatedList?.[0]?.name).toBe("Updated");
    expect(updatedList?.[1]?.name).toBe("Added");
  });

  test("findUnique returns correct ID", async () => {
    const ItemList = co.list(z.string());
    const group = Group.create();

    const originalList = ItemList.create(["test"], {
      owner: group,
      unique: "find-test",
    });

    const foundId = ItemList.findUnique("find-test", group.id);
    expect(foundId).toBe(originalList.id);
  });

  test("upsertUnique with resolve options", async () => {
    const Category = co.map({ title: z.string() });
    const Item = co.map({
      name: z.string(),
      category: Category,
    });
    const ItemList = co.list(Item);
    const group = Group.create();

    const category = Category.create({ title: "Category 1" }, group);

    const items = [Item.create({ name: "Item 1", category }, group)];

    const result = await ItemList.upsertUnique({
      value: items,
      unique: "resolved-list",
      owner: group,
      resolve: { $each: { category: true } },
    });

    expect(result).not.toBeNull();
    expect(result?.length).toBe(1);
    expect(result?.[0]?.name).toBe("Item 1");
    expect(result?.[0]?.category?.title).toBe("Category 1");
  });
});

describe("co.list schema", () => {
  test("can access the inner schema of a co.list", () => {
    const Keywords = co.list(co.plainText());

    const keywords = Keywords.create([
      Keywords.element.create("hello"),
      Keywords.element.create("world"),
    ]);

    expect(keywords[0]?.toString()).toEqual("hello");
    expect(keywords[1]?.toString()).toEqual("world");
  });
});
