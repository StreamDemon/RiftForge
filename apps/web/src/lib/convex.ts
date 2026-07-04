import type { ConvexClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { type Accessor, createRenderEffect, createSignal, onCleanup } from "solid-js";

/**
 * Hand-rolled Convex bindings for Solid (no official client exists; see #8).
 * A Convex live-query subscription maps directly onto a signal: `createQuery`
 * subscribes via `ConvexClient.onUpdate` and pushes every server-side result
 * into a signal, so fine-grained reactivity takes it from there.
 */

/**
 * Subscribe to a Convex query as a signal. Returns `undefined` while the first
 * result (or the first result after `args` change) is in flight.
 *
 * Pass `args` as an accessor when they depend on reactive state (e.g. route
 * params): the subscription is re-established whenever they change.
 *
 * A subscription that errors (e.g. argument validation) never resolves, so
 * without `onError` the signal would stay `undefined` forever with no trace —
 * the default at least logs it. Pass `onError` to surface it in the UI.
 */
export function createQuery<Query extends FunctionReference<"query">>(
  client: ConvexClient,
  query: Query,
  args: FunctionArgs<Query> | Accessor<FunctionArgs<Query>>,
  onError: (error: Error) => void = (error) => console.error(error),
): Accessor<FunctionReturnType<Query> | undefined> {
  const [result, setResult] = createSignal<FunctionReturnType<Query> | undefined>(undefined);
  // A render effect (not `createEffect`) so the subscription opens synchronously
  // at creation instead of waiting for the owner to finish initializing.
  createRenderEffect(() => {
    const resolved = typeof args === "function" ? (args as Accessor<FunctionArgs<Query>>)() : args;
    setResult(undefined);
    const unsubscribe = client.onUpdate(
      query,
      resolved,
      (value) => setResult(() => value),
      onError,
    );
    onCleanup(unsubscribe);
  });
  return result;
}

/** A callable that runs the given Convex mutation. */
export function createMutation<Mutation extends FunctionReference<"mutation">>(
  client: ConvexClient,
  mutation: Mutation,
): (args: FunctionArgs<Mutation>) => Promise<FunctionReturnType<Mutation>> {
  return (args) => client.mutation(mutation, args);
}

/** A callable that runs the given Convex action. */
export function createAction<Action extends FunctionReference<"action">>(
  client: ConvexClient,
  action: Action,
): (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>> {
  return (args) => client.action(action, args);
}
