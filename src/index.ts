import {
  enableMapSet,
  enablePatches,
  produceWithPatches,
  type Draft,
  type Immutable,
  type Patch,
} from "immer";

// Both are necessary
enablePatches();
enableMapSet();

import { createTrackerProxy, type FocusProxy, type FocusValue } from "./core/tracker";
import { extractPath } from "./core/proxy";
import { isRootPath, replaceChild, resolvePath, type Path } from "./core/path";
import {
  collectDeletedChildren,
  createBranchSlot,
  deleteBranchSlot,
  ensureBranch,
  getBranch,
  walkBranches,
  type BranchSlot,
} from "./core/branch-struct";
import { MISSING } from "./core/util";
import { compareBranch } from "./core/interpret-patches";
import type { Subscriber, Unsubscriber } from "./generic";
type Unfocus<T> =
  T extends FocusValue<infer V> ? V : never;

/**
 * Selectors are functions used to navigate from one node to a child node.
 * Can be passed into the {@link SvimmerReader.focus | focus} method.
 *
 * Selectors are also valid accessors, so they can be passed into
 * {@link SvimmerReader.read | read} as well.
 *
 * Selectors are plain functions for ergonomic direct use:
 * `node.focus(x => x.child)`
 */
export type Selector<T, U> = (x: FocusProxy<Immutable<T>>) => U;

/**
 * Accessors are pure read functions over immutable node data.
 * Can be passed into the {@link SvimmerReader.read | read} method.
 *
 * Unlike selectors, accessors are not intended for
 * {@link SvimmerReader.focus | focus}.
 */
export type Accessor<T, U> = (x: Immutable<T>) => U;

declare const AccessorBrand: unique symbol;

/**
 * Branded accessors are opt-in read helpers.
 * They work like normal accessors with {@link SvimmerReader.read | read},
 * but are not intended for {@link SvimmerReader.focus | focus}.
 *
 * Use {@link accessor} to create branded accessors for reusable read helpers.
 */
export type BrandedAccessor<T, U> =
  Accessor<T, U> & { readonly [AccessorBrand]: true };

/**
 * Transactors are draft mutation functions.
 * Can be passed into the {@link SvimmerWriter.transact | transact} method.
 * 
 * The return value of the transactor is passed through and returned by the {@link SvimmerWriter.transact | transact} method.
 */
export type Transactor<T, R> = (draft: Draft<T>) => R;

export interface SvimmerReader<T> {
  read<U>(accessor: Accessor<T, U>): U;
  focus<U>(selector: Selector<T, U>): SvimmerReader<Unfocus<U>> | null;
  subscribe(run: (node: SvimmerReader<T>) => void): Unsubscriber;
  onDestroy: (cb: () => void) => Unsubscriber;
  /**
   * This will allow you to shoot yourself in the foot with:
   * - Stale references
   * - Unexplainably not stale references
   * - Bad design
   *
   * Should probably be only used for:
   * - Retrieving primitive values
   * - Creating a deep clone
   * - Serialization
   */
  value: () => T;
}

export interface SvimmerWriter<T> extends SvimmerReader<T> {
  focus<U>(selector: Selector<T, U>): SvimmerWriter<Unfocus<U>> | null;
  transact<R>(fn: Transactor<T, R>): R;
  set: (value: T) => void;
}

interface StoreCtx<T> {
  getData: () => Immutable<T>;
  transact: SvimmerWriter<T>["transact"];
  setData: SvimmerWriter<T>["set"];
  subscribe: (run: Subscriber<SvimmerReader<T>>) => Unsubscriber;
  onDestroy: (cb: () => void) => Unsubscriber;
}

// -----------------------------------------------------------
// Implementation
// -----------------------------------------------------------
export function createSvimmerStore<T>(initial: T) {
  let state = initial;

  const branches = createBranchSlot(null, null);

  // Value is 'depth' which used to determine update order.
  const touched = new Map<BranchSlot, number>();
  const deletedRoots = new Map<BranchSlot, number>();
  const deletedChildren = new Map<BranchSlot, number>();
  const accumulateEffects = bindAccumulateEffects(
    touched,
    deletedRoots,
    branches,
  );

  // -----------------------------------------------------------
  // Internals
  // -----------------------------------------------------------
  function notify(patches: Patch[], inversePatches: Patch[]) {
    /* Accumulate effects of patches */
    {
      // Build touched branches and deleted roots
      touched.clear();
      deletedRoots.clear();
      // We assume patches and inversePatches have the same length.
      for (let i = 0; i < patches.length; i++) {
        const patch = patches[i]!;
        const inversePatch = inversePatches[i]!;
        accumulateEffects(patch, inversePatch);
      }

      // Build deleted children from deleted roots
      deletedChildren.clear();
      deletedRoots.forEach((depth, branch) =>
        collectDeletedChildren(branch, depth, deletedChildren),
      );
    }

    // 1. Destroy bottom-up
    const destroyList = Array.from(deletedChildren.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    for (const [branch] of destroyList) {
      branch.onDestroy.forEach((fn) => fn());
      branch.onDestroy.clear();

      branch.stale = true;
      // Might not be necessary
      delete branch.reader;
      delete branch.writer;
    }

    // 2. Notify surviving touched branches top-down
    const touchedList = Array.from(touched.entries())
      // This is checked with the stale flag in the notify loop
      //.filter(([branch]) => !deletedChildren.has(branch))
      .sort((a, b) => a[1] - b[1]);

    for (const [branch] of touchedList) {
      if (branch.stale) continue;
      if (!branch.reader) continue;
      branch.subs.forEach((fn) => fn(branch.reader));
    }

    // 3. Cleanup deleted roots from trie
    deletedRoots.forEach((_, branch) => {
      // Roots arent ensured to be optimal so we need guard against
      //  already deleted references;
      if (!branch) return;
      void deleteBranchSlot(branch);
    });
  }

  function rootTransact<R>(fn: Transactor<T, R>) {
    let result!: R;
    const [newState, patches, inversePatches] = produceWithPatches(
      state,
      (draft) => {
        result = fn(draft);
      },
    );
    state = newState;
    if (patches.length !== 0) notify(patches, inversePatches);
    return result;
  }

  function rootSet(value: T) {
    const [newState, patches, inversePatches] = produceWithPatches<T>(
      state,
      (draft) => {
        return value as any;
      },
    );
    state = newState;
    if (patches.length !== 0) notify(patches, inversePatches);
  }

  // -------------------------------------------------------------
  // Interface
  // -------------------------------------------------------------

  // Just a thin per-path facade.
  function getCtx<X>(path: Path): StoreCtx<X> {
    const getData = () => {
      // TODO: This reference needs to be cached in the future for sure.
      //       Currently this resolution is done on every read call.
      const res = resolvePath(state, path);
      if (!res.ok)
        throw new Error("getData: Failed to resolve path", { cause: res });
      return res.value as Immutable<X>;
    };

    /**
     * This replaces through the parent, so it will
     *  not work for the root.
     */
    const nonRootSetData: StoreCtx<T>["setData"] = (value) => {
      void rootTransact((draft) => {
        let res = resolvePath(draft, path);
        /* When this is invoked in createNode 
              the target path should already be ensured! */
        if (!res.ok) {
          throw new Error("set: Failed to resolve path", { cause: res });
        }
        // This wont work for root so
        if (res.parent === undefined || res.step == null) {
          throw new Error("Internal error: setData: missing parent");
        }
        replaceChild(res.parent, res.step, value);
      });
    };
    const setData = isRootPath(path) ? (rootSet as any) : nonRootSetData;

    const transact: StoreCtx<X>["transact"] = (fn) =>
      rootTransact((draft) => {
        let res = resolvePath(draft, path);
        /* When this is invoked in createNode 
              the target path should already be ensured! */
        if (!res.ok) {
          throw new Error("transact: Failed to resolve path", { cause: res });
        }
        return fn(res.value as any);
      });

    const subscribe: StoreCtx<X>["subscribe"] = (fn) => {
      const branch = ensureBranch(branches, path);
      branch.subs.add(fn as Subscriber<unknown>);
      const reader = getOrCreateReader<X>(path);
      fn(reader as any);
      return () => branch.subs.delete(fn as Subscriber<unknown>);
    };

    const onDestroy: StoreCtx<X>["onDestroy"] = (fn) => {
      const branch = ensureBranch(branches, path);
      branch.onDestroy.add(fn);
      return () => branch.onDestroy.delete(fn);
    };

    return {
      getData,
      setData,
      transact,
      subscribe,
      onDestroy,
    };
  }

  function getOrCreateWriter<T>(path: Path): SvimmerWriter<T> {
    const branch = ensureBranch(branches, path);
    if (branch.writer) return branch.writer;

    /* Create and cache writer */
    const ctx = getCtx<T>(path);
    branch.writer = {
      transact: ctx.transact,
      read: makeRead(ctx),
      focus: <U>(selector: Selector<T, U>): SvimmerWriter<Unfocus<U>> | null => {
        const subPath = resolveFocusPath(ctx, selector);
        return subPath ? getOrCreateWriter<U>([...path, ...subPath]) as SvimmerWriter<Unfocus<U>>: null;
      },
      subscribe: ctx.subscribe,
      onDestroy: ctx.onDestroy,
      value: ctx.getData,
      set: ctx.setData,
    };
    return branch.writer as SvimmerWriter<T>;
  }

  function getOrCreateReader<T>(path: Path) {
    const branch = ensureBranch(branches, path);
    if (branch.reader) return branch.reader;

    /* Create and cache reader */
    const ctx = getCtx<T>(path);
    branch.reader = {
      read: makeRead(ctx),
      focus: <U>(selector: Selector<T, U>): SvimmerReader<Unfocus<U>> | null => {
        const subPath = resolveFocusPath(ctx, selector);
        return subPath ? getOrCreateReader<U>([...path, ...subPath]) : null;
      },
      subscribe: ctx.subscribe,
      onDestroy: ctx.onDestroy,
      value: ctx.getData,
    };

    return branch.reader as SvimmerReader<T>;
  }

  return getOrCreateWriter<T>([]);
}

// -------------------------------------------------------------
// Shorthand functions
// -------------------------------------------------------------
const makeRead =
  <T>(ctx: StoreCtx<T>) =>
  <U>(accessor: Accessor<T, U>) =>
    accessor(ctx.getData());

const resolveFocusPath = <T, U>(
  ctx: StoreCtx<T>,
  selector: Selector<T, U>,
): Path | null => {
  const data = ctx.getData();
  const proxy = createTrackerProxy(data);
  const tracked = selector(proxy as any);
  const subPath = extractPath(tracked as unknown);

  const res = resolvePath(data, subPath);
  if (!res.ok) return null;

  return subPath;
};

const bindAccumulateEffects =
  (
    touched: Map<BranchSlot, number>,
    deletedRoots: Map<BranchSlot, number>,
    branches: BranchSlot,
  ) =>
  (patch: Patch, inverse: Patch) => {
    // Always touch prefixes/ancestors
    walkBranches(branches, patch.path, ({ branch, depth }) => {
      touched.set(branch, depth);
    });

    // Only replace/remove can delete descendants or change existing child branches
    if (patch.op === "add") return;

    const branch = getBranch(branches, patch.path);
    if (!branch) return;

    const oldVal = inverse.value ?? MISSING;
    const newVal = patch.value ?? MISSING;

    compareBranch(
      branch,
      oldVal,
      newVal,
      patch.path.length,
      (branch, depth) => {
        touched.set(branch, depth);
      },
      (branch, depth) => {
        deletedRoots.set(branch, depth);
      },
    );
  };
