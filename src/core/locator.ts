import type {
  Accessor,
  Focused,
  FocusReaderReturn,
  FocusWriterReturn,
  Selector,
  SvimmerReader,
  SvimmerWriter,
  Transactor,
} from "..";
import type { Unsubscriber } from "../generic";

export const LocatorId: unique symbol = Symbol("LocatorId");

type AnySelectorTuple<T> = readonly Selector<T, any>[];

type NonEmptySelectors<T> = readonly [
  Selector<T, any>,
  ...Selector<T, any>[],
];

/**
 * Resolved dependency handles passed into a locator's `locate` callback.
 *
 * Dependencies are always readers, even when `follow(...)` is used from a writer.
 */
export type LocatedDeps<
  T,
  Ds extends readonly Selector<T, any>[],
> = {
  [K in keyof Ds]:
    Ds[K] extends Selector<T, infer U>
      ? FocusReaderReturn<U>
      : never
};

/**
 * A locator is a pure, reusable dynamic-reference recipe.
 *
 * - `deps` are static selectors from the local root
 * - `locate(...)` receives the current resolved dependency handles
 * - `locate(...)` returns a selector for the local root, or null
 *
 * Important:
 * `R` is the raw selector return type, not the final focused value type.
 * Examples:
 * - `x => x.office`                => R = FocusProxy<Office>
 * - `x => x.users.get("john")`     => R = FocusProxy<User | undefined>
 */
export interface Locator<
  T,
  R,
  Ds extends readonly Selector<T, any>[] = readonly Selector<T, any>[],
  CanBeMissing extends boolean = boolean,
> {
  readonly [LocatorId]: symbol;
  readonly deps: Ds;
  readonly locate: (...deps: LocatedDeps<T, Ds>) => CanBeMissing extends true
    ? Selector<T, R> | null
    : Selector<T, R>;
}

export type AnyLocator<T> = {
  readonly [LocatorId]: symbol;
  readonly deps: readonly [Selector<T, any>, ...Selector<T, any>[]];
  readonly locate: (...deps: any[]) => Selector<T, any> | null;
};


/**
 * Create a pure locator with a hidden stable identity.
 *
 * Locators must have at least one dependency.
 *
 * Usage:
 * ```ts
 * const locator = locatorFor<Root>()(
 *   [x => x.someId],
 *   (someIdRef) => x => x.items.get(someIdRef.value()),
 * );
 * ```
 */
export function locatorFor<T>() {
  function build<
    const Ds extends NonEmptySelectors<T>,
    U,
  >(
    deps: readonly [...Ds],
    locate: (...deps: LocatedDeps<T, Ds>) => Selector<T, U>,
  ): Locator<T, U, Ds, false>;
  function build<
    const Ds extends NonEmptySelectors<T>,
    U,
  >(
    deps: readonly [...Ds],
    locate: (...deps: LocatedDeps<T, Ds>) => Selector<T, U> | null,
  ): Locator<T, U, Ds, true>;
  function build(
    deps: readonly Selector<T, any>[],
    locate: (...deps: any[]) => Selector<T, any> | null,
  ) {
    return {
      [LocatorId]: Symbol("locator"),
      deps,
      locate,
    };
  }

  return build;
}

type LocatorFn<L> =
  L extends { locate: (...args: any[]) => any }
    ? L["locate"]
    : never;

type LocatorReturn<L> = ReturnType<LocatorFn<L>>;
type LocatorSelector<L> = Exclude<LocatorReturn<L>, null>;
type LocatorCanBeMissing<L> =
  L extends Locator<any, any, any, infer N> ? N : true;

/**
 * Final dynamic value type.
 * - strips undefined
 * - preserves null
 */
export type DynamicValue<L> =
  LocatorSelector<L> extends Selector<any, infer U>
    ? Focused<U>
    : never;

export type DynamicCurrentReaderResult<L> =
  true extends LocatorCanBeMissing<L>
    ? (
        LocatorSelector<L> extends Selector<any, infer U>
          ? FocusReaderReturn<U>
          : never
      ) | null
    : (
        LocatorSelector<L> extends Selector<any, infer U>
          ? FocusReaderReturn<U>
          : never
      );

export type DynamicCurrentWriterResult<L> =
  true extends LocatorCanBeMissing<L>
    ? (
        LocatorSelector<L> extends Selector<any, infer U>
          ? FocusWriterReturn<U>
          : never
      ) | null
    : (
        LocatorSelector<L> extends Selector<any, infer U>
          ? FocusWriterReturn<U>
          : never
      );

export type DynamicReadResult<L, U> =
  null extends DynamicCurrentReaderResult<L> ? U | null : U;
export type DynamicInput<L> =
  null extends DynamicCurrentReaderResult<L> ? DynamicValue<L> | undefined : DynamicValue<L>;
export type DynamicWriteResult<L, R> =
  null extends DynamicCurrentWriterResult<L> ? R | undefined : R;

export interface DynamicReader<L extends Locator<any, any, any>> {
  current(): DynamicCurrentReaderResult<L>;
  read<U>(accessor: Accessor<DynamicInput<L>, U>): U;
  subscribe(run: (node: DynamicCurrentReaderResult<L>, txId: number | null) => void): Unsubscriber;
}

export interface DynamicWriter<L extends Locator<any, any, any>>
  extends DynamicReader<L> {
  current(): DynamicCurrentWriterResult<L>;
  subscribe(run: (node: DynamicCurrentWriterResult<L>, txId: number | null) => void): Unsubscriber;
  transact<R>(fn: Transactor<DynamicInput<L>, R>): DynamicWriteResult<L, R>;
  set(value: Exclude<DynamicValue<L>, undefined>): DynamicWriteResult<L, void>;
}

/**
 * Internal shared follow state.
 *
 * Deliberately non-generic.
 * Public typing is re-imposed at the `follow(...)` boundary.
 */
export type FollowCore = {
  locator: Locator<any, any, any>;

  getReader: () => SvimmerReader<unknown>;
  getWriter: () => SvimmerWriter<unknown>;

  depHandles: (SvimmerReader<unknown> | null)[];
  depUnsubs: Set<Unsubscriber>;
  currentHandleUnsub: Unsubscriber | null;

  lastTxId: number | null;
  currentSelector: Selector<any, any> | null;
  currentTargetReader: SvimmerReader<unknown> | null;

  reader: {
    current: SvimmerReader<unknown> | null;
    subs: Set<(node: SvimmerReader<unknown> | null, txId: number | null) => void>;
    handle: DynamicReader<any> | null;
  } | null;

  writer: {
    current: SvimmerWriter<unknown> | null;
    subs: Set<(node: SvimmerWriter<unknown> | null, txId: number | null) => void>;
    handle: DynamicWriter<any> | null;
  } | null;
};

function getCurrentReader(core: FollowCore): SvimmerReader<unknown> | null {
  if (!core.currentSelector) return null;
  return core.getReader().focus(core.currentSelector as any) as SvimmerReader<unknown> | null;
}

function getCurrentWriter(core: FollowCore): SvimmerWriter<unknown> | null {
  if (!core.currentSelector) return null;
  return core.getWriter().focus(core.currentSelector as any) as SvimmerWriter<unknown> | null;
}

function syncCurrentCaches(core: FollowCore) {
  if (core.reader) {
    core.reader.current = getCurrentReader(core);
  }
  if (core.writer) {
    core.writer.current = getCurrentWriter(core);
  }
}

function unsubscribeCurrent(core: FollowCore) {
  if (core.currentHandleUnsub) {
    core.currentHandleUnsub();
    core.currentHandleUnsub = null;
  }
}

function notify(core: FollowCore, txId: number | null = core.lastTxId) {
  if (core.reader) {
    for (const sub of Array.from(core.reader.subs)) {
      sub(core.reader.current, txId);
    }
  }

  if (core.writer) {
    for (const sub of Array.from(core.writer.subs)) {
      sub(core.writer.current, txId);
    }
  }
}

function wireCurrent(core: FollowCore) {
  unsubscribeCurrent(core);

  const current = core.currentTargetReader;
  if (!current) return;

  let initial = true;
  const unsubData = current.subscribe(() => {
    if (initial) {
      initial = false;
      return;
    }
    syncCurrentCaches(core);
    notify(core);
  });

  const unsubDestroy = current.onDestroy(() => {
    const changed = relocate(core);
    if (changed) notify(core);
  });

  core.currentHandleUnsub = () => {
    unsubData();
    unsubDestroy();
  };
}

function relocate(core: FollowCore) {
  const nextSelector = core.locator.locate(...(core.depHandles as any));
  const nextTargetReader = nextSelector
    ? (core.getReader().focus(nextSelector as any) as SvimmerReader<unknown> | null)
    : null;

  const changed =
    nextSelector !== core.currentSelector ||
    nextTargetReader !== core.currentTargetReader;

  if (!changed) return false;

  core.currentSelector = nextSelector as Selector<any, any> | null;
  core.currentTargetReader = nextTargetReader;

  syncCurrentCaches(core);
  wireCurrent(core);

  return true;
}

export function createGetOrCreateDynamicHandle(
  cache: Map<symbol, FollowCore>,
) {
  return function getOrCreateDynamicHandle(
    locator: Locator<any, any, any>,
    getReader: () => SvimmerReader<unknown>,
    getWriter: () => SvimmerWriter<unknown>,
    mode: "reader" | "writer",
  ): DynamicReader<any> | DynamicWriter<any> {
    let core = cache.get(locator[LocatorId])!;

    if (!core) {
      core = {
        locator,
        getReader,
        getWriter,

        depHandles: locator.deps.map((s: Selector<any, any>) => getReader().focus(s as any)) as (SvimmerReader<unknown> | null)[],
        depUnsubs: new Set(),
        currentHandleUnsub: null,

        lastTxId: null,
        currentSelector: null,
        currentTargetReader: null,

        reader: null,
        writer: null,
      };

      cache.set(locator[LocatorId], core);

      core.depHandles.forEach((dep) => {
        if (!dep) return;

        const unsub = dep.subscribe((_, txId) => {
          if (txId === core!.lastTxId) return;
          core!.lastTxId = txId;

          const changed = relocate(core!);
          if (changed) notify(core!);
        });

        core.depUnsubs.add(unsub);
      });

      relocate(core);
    }

    if (mode === "reader") {
      if (!core.reader) {
        core.reader = {
          current: getCurrentReader(core),
          subs: new Set(),
          handle: null,
        };

        core.reader.handle = {
          current: () => core!.reader!.current as any,

          read: (accessor) => {
            const cur = core!.reader!.current;
            return cur ? cur.read(accessor as any) : (accessor as any)(undefined);
          },

          subscribe: (run) => {
            const wrapped = run as (node: SvimmerReader<unknown> | null, txId: number | null) => void;
            core!.reader!.subs.add(wrapped);
            run(core!.reader!.current as any, core!.lastTxId);

            return () => {
              core!.reader!.subs.delete(wrapped);
            };
          },
        };
      }

      return core.reader.handle!;
    }

    if (!core.writer) {
      core.writer = {
        current: getCurrentWriter(core),
        subs: new Set(),
        handle: null,
      };

      core.writer.handle = {
        current: () => core!.writer!.current as any,

        read: (accessor) => {
          const cur = core!.writer!.current;
          return cur ? cur.read(accessor as any) : (accessor as any)(undefined);
        },

        subscribe: (run) => {
          const wrapped = run as (node: SvimmerWriter<unknown> | null, txId: number | null) => void;
          core!.writer!.subs.add(wrapped);
          run(core!.writer!.current as any, core!.lastTxId);

          return () => {
            core!.writer!.subs.delete(wrapped);
          };
        },

        transact: (fn) => {
          const cur = core!.writer!.current;
          return cur ? cur.transact(fn as any) : undefined;
        },

        set: (value) => {
          const cur = core!.writer!.current;
          if (!cur) return undefined;
          cur.set(value as any);
          return undefined;
        },
      };
    }

    return core.writer.handle!;
  };
}
