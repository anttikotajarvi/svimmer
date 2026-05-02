import type { Accessor, Selector, SvimmerReader, SvimmerWriter } from ".."
import type { Unfocus } from "../core/tracker"
import type { Unsubscriber } from "../generic"

interface DynamicReader<T> {
  current(): SvimmerReader<T> | null
  read<U>(accessor: Accessor<T, U>): U | null
  subscribe(run: (node: SvimmerReader<T> | null) => void): Unsubscriber
}

declare const LocatorId: unique symbol;


/**
 * Resolved dependency handles passed into a locator's `locate` callback.
 */
export type LocatedDeps<
  T,
  Ds extends readonly Selector<T, any>[],
> = {
  [K in keyof Ds]:
    Ds[K] extends Selector<T, infer U>
      ? SvimmerReader<Unfocus<NonNullable<U>>> | null
      : never
};

/**
 * A locator is a pure, reusable dynamic-reference recipe.
 *
 * - `deps` are static selectors from the local root
 * - `locate(...)` receives the current resolved dependency handles
 * - `locate(...)` returns a selector for the local root, or null
 *
 * Locators are store-agnostic. Any caching / follow state should live
 * inside the Svimmer store instance, not here.
 */
export interface Locator<
  T,
  U,
  Ds extends readonly Selector<T, any>[] = readonly Selector<T, any>[],
> {
  readonly [LocatorId]: symbol;
  readonly deps: Ds;
  readonly locate: (...deps: LocatedDeps<T, Ds>) => Selector<T, U> | null;
}

/**
 * Create a pure locator with a hidden stable identity.
 *
 * The generated identity is intended for per-store follow/locator caches.
 */
export function createLocator<
  T,
  U,
  const Ds extends readonly Selector<T, any>[],
>(
  deps: Ds,
  locate: (...deps: LocatedDeps<T, Ds>) => Selector<T, U> | null
): Locator<T, U, Ds> {
  return {
    [LocatorId]: Symbol("locator"),
    deps: deps,
    locate: locate,
  };
}


type AnySelectorTuple<T> = readonly Selector<T, any>[];

type LocatorTarget<L> =
  L extends Locator<any, infer U, any> ? U : never;

  export function follow<
  T,
  L extends Locator<T, any, AnySelectorTuple<T>>,
>(
  root: SvimmerReader<T>,
  locator: L,
): DynamicReader<LocatorTarget<L>>;

export function follow<
  T,
  L extends Locator<T, any, AnySelectorTuple<T>>,
>(
  root: SvimmerReader<T>,
  locator: L,
): DynamicReader<LocatorTarget<L>> {
  const resolvedDeps = locator.deps.map(s => root.focus(s)!)
  const getSelector = () => locator.locate(...resolvedDeps)
  
  resolvedDeps.forEach(reader => {
    
  });

  function notify() {
    void null;
  };

  const reader: DynamicReader<LocatorTarget<L>> = {
    current: () => {
      root.
    }
  }
}