import type { ConvexClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { type Accessor, createRenderEffect, createSignal, onCleanup } from "solid-js";

/**
 * Hand-rolled Convex bindings for Solid (no official client exists; see #8).
 * A Convex live-query subscription maps directly onto a signal: `createQuery`
 * subscribes via `ConvexClient.onUpdate` and pushes every server-side result
 * into a signal, so fine-grained reactivity takes it from there.
 */

/** A live query subscription: the latest result, or the error that broke it. */
export interface QueryState<Query extends FunctionReference<"query">> {
  /** Latest result; `undefined` while the first result (or the first after `args` change) is in flight. */
  data: Accessor<FunctionReturnType<Query> | undefined>;
  /** Why the subscription errored (e.g. argument validation). Cleared by the next successful update or resubscription. */
  error: Accessor<Error | undefined>;
}

/**
 * Subscribe to a Convex query as a pair of signals.
 *
 * Pass `args` as an accessor when they depend on reactive state (e.g. route
 * params): the subscription is re-established whenever they change.
 *
 * The bindings own the error state because a subscription that errors never
 * resolves — without `error` the page would sit on "loading" forever with no
 * trace — and an error must not outlive recovery, so a successful update
 * clears it.
 */
export function createQuery<Query extends FunctionReference<"query">>(
  client: ConvexClient,
  query: Query,
  args: FunctionArgs<Query> | Accessor<FunctionArgs<Query>>,
): QueryState<Query> {
  const [data, setData] = createSignal<FunctionReturnType<Query> | undefined>(undefined);
  const [error, setError] = createSignal<Error>();
  // A render effect (not `createEffect`) so the subscription opens synchronously
  // at creation instead of waiting for the owner to finish initializing.
  createRenderEffect(() => {
    const resolved = typeof args === "function" ? (args as Accessor<FunctionArgs<Query>>)() : args;
    setData(undefined);
    setError(undefined);
    const unsubscribe = client.onUpdate(
      query,
      resolved,
      (value) => {
        setData(() => value);
        setError(undefined);
      },
      setError,
    );
    onCleanup(unsubscribe);
  });
  return { data, error };
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
