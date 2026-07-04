import type { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import { createMutation, createQuery } from "../src/lib/convex.ts";

interface Subscription {
  args: unknown;
  callback: (value: unknown) => void;
  onError: ((error: Error) => void) | undefined;
  unsubscribed: boolean;
}

/** In-memory stand-in for ConvexClient: records subscriptions, lets tests push updates. */
function fakeClient() {
  const subscriptions: Subscription[] = [];
  const mutations: { args: unknown }[] = [];
  const client = {
    onUpdate(
      _query: unknown,
      args: unknown,
      callback: (value: unknown) => void,
      onError?: (error: Error) => void,
    ) {
      const subscription: Subscription = { args, callback, onError, unsubscribed: false };
      subscriptions.push(subscription);
      return () => {
        subscription.unsubscribed = true;
      };
    },
    mutation(_ref: unknown, args: unknown) {
      mutations.push({ args });
      return Promise.resolve("mutation-result");
    },
  } as unknown as ConvexClient;
  return { client, subscriptions, mutations };
}

const queryRef = anyApi.characters.sheet;

describe("createQuery", () => {
  test("starts undefined and follows pushed updates", () => {
    const { client, subscriptions } = fakeClient();
    createRoot((dispose) => {
      const result = createQuery(client, queryRef, { id: "abc" });
      expect(result()).toBeUndefined();
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]!.args).toEqual({ id: "abc" });

      subscriptions[0]!.callback({ name: "Vesper" });
      expect(result()).toEqual({ name: "Vesper" });

      subscriptions[0]!.callback({ name: "Vesper", level: 2 });
      expect(result()).toEqual({ name: "Vesper", level: 2 });
      dispose();
    });
  });

  test("null results are preserved (missing document, not loading)", () => {
    const { client, subscriptions } = fakeClient();
    createRoot((dispose) => {
      const result = createQuery(client, queryRef, { id: "gone" });
      subscriptions[0]!.callback(null);
      expect(result()).toBeNull();
      dispose();
    });
  });

  test("reactive args resubscribe and reset to undefined", () => {
    const { client, subscriptions } = fakeClient();
    const [id, setId] = createSignal("first");
    // Set up inside a root, assert outside it: writes inside the root body are
    // batched, so effect re-runs would be deferred until the root exits.
    const { result, dispose } = createRoot((dispose) => ({
      result: createQuery(client, queryRef, () => ({ id: id() })),
      dispose,
    }));
    subscriptions[0]!.callback({ name: "First" });
    expect(result()).toEqual({ name: "First" });

    setId("second");
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0]!.unsubscribed).toBe(true);
    expect(subscriptions[1]!.args).toEqual({ id: "second" });
    expect(result()).toBeUndefined();

    subscriptions[1]!.callback({ name: "Second" });
    expect(result()).toEqual({ name: "Second" });
    dispose();
  });

  test("subscription errors reach onError instead of vanishing", () => {
    const { client, subscriptions } = fakeClient();
    const seen: Error[] = [];
    createRoot((dispose) => {
      const result = createQuery(client, queryRef, { id: "bad" }, (error) => seen.push(error));
      subscriptions[0]!.onError!(new Error("ArgumentValidationError"));
      expect(seen.map((e) => e.message)).toEqual(["ArgumentValidationError"]);
      expect(result()).toBeUndefined();
      dispose();
    });
  });

  test("disposing the owner unsubscribes", () => {
    const { client, subscriptions } = fakeClient();
    createRoot((dispose) => {
      createQuery(client, queryRef, { id: "abc" });
      expect(subscriptions[0]!.unsubscribed).toBe(false);
      dispose();
    });
    expect(subscriptions[0]!.unsubscribed).toBe(true);
  });
});

describe("createMutation", () => {
  test("forwards args and returns the client result", async () => {
    const { client, mutations } = fakeClient();
    const run = createMutation(client, anyApi.characters.rollVitals);
    await expect(run({ id: "abc" })).resolves.toBe("mutation-result");
    expect(mutations).toEqual([{ args: { id: "abc" } }]);
  });
});
