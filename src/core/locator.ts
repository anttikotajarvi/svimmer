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

export declare const LocatorId: unique symbol;

type SelectorRaw<S> =
  S extends Selector<any, infer R> ? R : never;

/**
 * Resolved dependency handles passed into a locator's `locate` callback.
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

export interface Locator<
  T,
  R,
  Ds extends readonly Selector<T, any>[] = readonly Selector<T, any>[],
> {
  readonly [LocatorId]: symbol;
  readonly deps: Ds;
  readonly locate: (...deps: LocatedDeps<T, Ds>) => Selector<T, R> | null;
}


export function createLocator<
  T,
  const Ds extends readonly Selector<T, any>[] = readonly Selector<T, any>[],
  S extends Selector<T, any> = Selector<T, any>,
>(
  deps: Ds,
  locate: (...deps: LocatedDeps<T, Ds>) => S | null,
): Locator<T, SelectorRaw<S>, Ds> {
  return {
    [LocatorId]: Symbol("locator"),
    deps,
    locate,
  };
}

type LocatorFn<L> =
  L extends { locate: (...args: any[]) => any }
    ? L["locate"]
    : never;

type LocatorReturn<L> = ReturnType<LocatorFn<L>>;
type LocatorSelector<L> = Exclude<LocatorReturn<L>, null>;

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
  null extends LocatorReturn<L>
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
  null extends LocatorReturn<L>
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

export interface DynamicReader<L extends Locator<any, any, any>> {
  current(): DynamicCurrentReaderResult<L>;
  read<U>(accessor: Accessor<DynamicValue<L>, U>): DynamicReadResult<L, U>;
  subscribe(run: (node: DynamicCurrentReaderResult<L>) => void): Unsubscriber;
}

export interface DynamicWriter<L extends Locator<any, any, any>>
  extends DynamicReader<L> {
  current(): DynamicCurrentWriterResult<L>;
  subscribe(run: (node: DynamicCurrentWriterResult<L>) => void): Unsubscriber;
  transact<R>(fn: Transactor<DynamicValue<L>, R>): DynamicReadResult<L, R>;
  set(value: Exclude<DynamicValue<L>, undefined>): DynamicReadResult<L, void>;
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
    subs: Set<(node: SvimmerReader<unknown> | null) => void>;
    handle: DynamicReader<any> | null;
  } | null;

  writer: {
    current: SvimmerWriter<unknown> | null;
    subs: Set<(node: SvimmerWriter<unknown> | null) => void>;
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

function notify(core: FollowCore) {
  if (core.reader) {
    for (const sub of Array.from(core.reader.subs)) {
      sub(core.reader.current);
    }
  }

  if (core.writer) {
    for (const sub of Array.from(core.writer.subs)) {
      sub(core.writer.current);
    }
  }
}

function wireCurrent(core: FollowCore) {
  unsubscribeCurrent(core);

  const current = core.currentTargetReader;
  if (!current) return;

  const unsubData = current.subscribe(() => {
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
            return cur ? cur.read(accessor as any) : null;
          },

          subscribe: (run) => {
            const wrapped = run as (node: SvimmerReader<unknown> | null) => void;
            core!.reader!.subs.add(wrapped);
            run(core!.reader!.current as any);

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
          return cur ? cur.read(accessor as any) : null;
        },

        subscribe: (run) => {
          const wrapped = run as (node: SvimmerWriter<unknown> | null) => void;
          core!.writer!.subs.add(wrapped);
          run(core!.writer!.current as any);

          return () => {
            core!.writer!.subs.delete(wrapped);
          };
        },

        transact: (fn) => {
          const cur = core!.writer!.current;
          return cur ? cur.transact(fn as any) : null;
        },

        set: (value) => {
          const cur = core!.writer!.current;
          if (!cur) return null;
          cur.set(value as any);
          return undefined;
        },
      };
    }

    return core.writer.handle!;
  };
}

const dynamicHandleCache = new Map<symbol, FollowCore>();
const getOrCreateDynamicHandle = createGetOrCreateDynamicHandle(dynamicHandleCache);

export function follow<
  T,
  L extends Locator<T, any, AnySelectorTuple<T>>,
>(
  root: SvimmerReader<T>,
  locator: L,
): DynamicReader<L>;

export function follow<
  T,
  L extends Locator<T, any, AnySelectorTuple<T>>,
>(
  root: SvimmerWriter<T>,
  locator: L,
): DynamicWriter<L>;

export function follow<
  T,
  L extends Locator<T, any, AnySelectorTuple<T>>,
>(
  root: SvimmerReader<T> | SvimmerWriter<T>,
  locator: L,
): DynamicReader<L> | DynamicWriter<L> {
  const handle = getOrCreateDynamicHandle(
    locator,
    () => root as SvimmerReader<unknown>,
    () => root as SvimmerWriter<unknown>,
    "transact" in root ? "writer" : "reader",
  );

  return handle as DynamicReader<L> | DynamicWriter<L>;
}