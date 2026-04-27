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

import { createTrackerProxy } from "./sys/tracker";
import { extractPath } from "./sys/proxy";
import { resolvePath, type Path } from "./sys/path";
import {
  buildDeletedChildren,
  createBranchSlot,
  deleteBranchSlot,
  ensureBranch,
  walkBranches,
  type BranchSlot,
} from "./sys/branch-struct";

export type Accessor<T, U> = (x: Immutable<T>) => U;
export type Selector<T, U> = (x: T) => U;
export type Transactor<T, R> = (draft: Draft<T>) => R;

export type Unsubscriber = () => void;
export type Subscriber<T> = (value: Immutable<T>) => void;

export interface SvimmerReader<T> {
  read<U>(accessor: Accessor<T, U>): U;
  focus<U>(selector: Selector<T, U>): SvimmerReader<U> | null;
  subscribe(run: (node: SvimmerReader<T>) => void): Unsubscriber;
  onDestroy: (cb: () => void) => Unsubscriber;
  /**
   * This will allow you to shoot yourself in the foot with:
   * - Stale references
   * - Unexplainably not stale references
   * - Bad design
   * Should probably be only used for:
   * - Creating a deep clone
   * - Serializing right away
   */
  value: () => Immutable<T>;
}

export interface SvimmerWriter<T> extends SvimmerReader<T> {
  focus<U>(selector: Selector<T, U>): SvimmerWriter<U> | null;
  transact<R>(fn: Transactor<T, R>): R;
}

interface StoreCtx<T> {
  getData: () => Immutable<T>;
  transact: SvimmerWriter<T>["transact"];
  subscribe: (run: Subscriber<SvimmerReader<T>>) => Unsubscriber;
  onDestroy: (cb: () => void) => Unsubscriber;
}

export function createSvimmerStore<T>(initial: T) {
  let state = initial;

  const branches = createBranchSlot(null, null);

  const touched = new Map<BranchSlot, number>();
  const deletedRoots = new Map<BranchSlot, number>();
  function accumulateEffects(patch: Patch) {
    walkBranches(branches, patch.path, ({ branch, isTarget, depth }) => {
      if (patch.op === "remove" && isTarget) {
        deletedRoots.set(branch, depth);
        return;
      }
      touched.set(branch, depth);
    });
  }

  function notify(patches: Patch[]) {
    touched.clear();
    deletedRoots.clear();

    patches.forEach(accumulateEffects);

    const deletedChildren = buildDeletedChildren(deletedRoots);

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
    const prevState = state;
    let result!: R;

    const [newState, patches] = produceWithPatches(state, (draft) => {
      result = fn(draft);
    });

    state = newState;
    if (patches.length !== 0) notify(patches);

    return result;
  }

  function getOrCreateWriter<T>(path: Path): SvimmerWriter<T> {
    const branch = ensureBranch(branches, path);
    if (!branch.writer) {
      const ctx = getCtx<T>(path);
      branch.writer = {
        transact: ctx.transact,
        read: makeRead(ctx),
        focus: <U>(selector: Selector<T, U>): SvimmerWriter<U> | null => {
          const subPath = resolveFocusPath(ctx, selector);
          return subPath ? getOrCreateWriter<U>([...path, ...subPath]) : null;
        },
        subscribe: ctx.subscribe,
        onDestroy: ctx.onDestroy,
        value: ctx.getData,
      };
    }
    return branch.writer as SvimmerWriter<T>;
  }

  function getOrCreateReader<T>(path: Path) {
    const branch = ensureBranch(branches, path);
    if (!branch.reader) {
      const ctx = getCtx<T>(path);
      branch.reader = {
        read: makeRead(ctx),
        focus: <U>(selector: Selector<T, U>): SvimmerReader<U> | null => {
          const subPath = resolveFocusPath(ctx, selector);
          return subPath ? getOrCreateReader<U>([...path, ...subPath]) : null;
        },
        subscribe: ctx.subscribe,
        onDestroy: ctx.onDestroy,
        value: ctx.getData,
      };
    }

    return branch.reader as SvimmerReader<T>;
  }

  /**
   * Just a thin per-path facade.
   */
  const getCtx = <T>(path: Path): StoreCtx<T> => {
    const getData = () => {
      // TODO: This reference needs to be cached in the future for sure.
      //       Currently this resolution is done on every read call.
      const res = resolvePath(state, path);
      if (!res.ok)
        throw new Error("getData: Failed to resolve path", { cause: res });
      return res.value as Immutable<T>;
    };

    return {
      getData,
      transact: (fn) => {
        return rootTransact((draft) => {
          let res = resolvePath(draft, path);
          /* When this is invoked in createNode 
              the target path should already be ensured! */
          if (!res.ok) {
            throw new Error("transact: Failed to resolve path", { cause: res });
          }

          return fn(res.value as any);
        });
      },

      subscribe: (fn) => {
        const branch = ensureBranch(branches, path);
        branch.subs.add(fn as Subscriber<unknown>);
        const reader = getOrCreateReader<T>(path);
        fn(reader);
        return () => branch.subs.delete(fn as Subscriber<unknown>);
      },
      onDestroy: (fn) => {
        const branch = ensureBranch(branches, path);
        branch.onDestroy.add(fn);
        return () => branch.onDestroy.delete(fn);
      },
    };
  };

  return getOrCreateWriter<T>([]);
}

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
  const tracked = selector(proxy as T);
  const subPath = extractPath(tracked as unknown);

  const res = resolvePath(data, subPath);
  if (!res.ok) return null;

  return subPath;
};
