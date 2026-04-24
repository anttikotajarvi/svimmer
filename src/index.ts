import { produceWithPatches, type Draft, type Immutable, type Patch } from "immer";
import { createTrackerProxy } from "../svelte-immer-store/src/proxy/tracker";
import { extractPath } from "./proxy";
import { ensurePath, resolvePath, type Path } from "./path";
import { isUndefined } from "./util";
import { ensureBranch, type BranchSlot } from "./branch-struct";

/*
node: 
- focus(path) 
-subscribe(reader) 
- read(accessor) 
writer extends node, reader: 
- transact(draftFn)
*/
type Accessor<T, U> = (x: Immutable<T>) => U;
type Selector<T, U> = (x: T) => U;
type Transactor<T, R> = (draft: Draft<T>) => R;

export interface SvimmerReader<T> {
  read<U>(accessor: Accessor<T, U>): U;
  focus<U>(selector: Selector<T, U>): SvimmerReader<U> | null;
  subscribe(run: (node: SvimmerReader<T>) => void): Unsubscriber;
}

export interface SvimmerWriter<T> extends SvimmerReader<T> {
  focus<U>(selector: Selector<T, U>): SvimmerWriter<U> | null;
  transact<R>(fn: Transactor<T, R>): R;
  subscribe(run: (node: SvimmerReader<T>) => void): Unsubscriber;
}

interface StoreCtx<T> {
  getData: () => Immutable<T>;
  transact: SvimmerWriter<T>["transact"];
  subscribe: (run: Subscriber<T>) => Unsubscriber;
  branch:
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


function createReaderNode<T>(
  getCtx: <R>(path: Path) => StoreCtx<R>,
  path: Path,
): SvimmerReader<T> {
  const ctx = getCtx<T>(path);
  return {
    read: makeRead(ctx),
    focus: <U>(selector: Selector<T, U>): SvimmerReader<U> | null => {
      const subPath = resolveFocusPath(ctx, selector)
      return subPath 
        ? createReaderNode<U>(getCtx, [...path, ...subPath])
        : null;
    },
  };
}
function createWriterNode<T>(
  getCtx: <R>(path: Path) => StoreCtx<R>,
  path: Path,
): SvimmerWriter<T> {
  const ctx = getCtx<T>(path);
  return {
    transact: ctx.transact,
    read: makeRead(ctx),
    focus: <U>(selector: Selector<T, U>): SvimmerWriter<U> | null => {
      const subPath = resolveFocusPath(ctx, selector)
      return subPath 
        ? createWriterNode<U>(getCtx, [...path, ...subPath])
        : null;
    },
  };
}

function createSvimmerStore<T>(initial: T) {
  let state = structuredClone(initial);
  
  const subs: SubNode = {
    subs: new Set(),
    children: new Map()
  }

  function rootTransact<R>(fn: Transactor<T, R>) {
    const prevState = state;
    let result!: R;

    const [newState, patches] = produceWithPatches(state, (draft) => {
      result = fn(draft);
    });

    if (state !== prevState) {
      // notify
    }
    return result;
  }
  const getCtx = <T>(path: Path): StoreCtx<T> => {
    const getData = () => {
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
        const current = ensureBranch(subs, path);
        current.subs.add(fn as Subscriber<unknown>);
      


        fn(getData())
        return () => current.subs.delete(fn as Subscriber<unknown>)
      }
    };
  };
}
export type Unsubscriber = () => void;
export type Subscriber<T> = (value: Immutable<T>) => void


type Person = {
  name: string;
  age: number;
  interests: string[];
};
const test = {
  employees: {
    ceo: {
      name: "John",
      age: 40,
      interests: ["hockey", "deadlifting", "sports"],
    } as Person,
  },
} as const;

