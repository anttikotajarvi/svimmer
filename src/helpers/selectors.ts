import type { Immutable } from "immer";
import type { Selector } from "..";


/**
 * This branding is to procect from accidental use of Accessors 
 *  (or Transactors) from being used in the focus method.
 */
export function selector<T, U>(fn: (x: Immutable<T>) => U): Selector<T, U>;
export function selector<T>(): <U>(fn: (x: Immutable<T>) => U) => Selector<T, U>;
export function selector(arg?: unknown) {
  if (typeof arg === "function") {
    return arg as Selector<any, any>;
  }
  return ((fn: unknown) => fn) as any;
}

export const keyOf =
  <T>() =>
  <K extends keyof Immutable<T>>(key: K): Selector<T, Immutable<T>[K]> =>
    selector<T, Immutable<T>[K]>(x => x[key]);

export const atOf =
  <T>(): ((index: number) => Selector<readonly T[], Immutable<T> | undefined>) =>
  (index: number) =>
    selector<readonly T[], Immutable<T> | undefined>(x => x[index]);

export const firstOf =
  <T>(): Selector<readonly T[], Immutable<T> | undefined> =>
    selector<readonly T[], Immutable<T> | undefined>(x => x[0]);

export const lastOf =
  <T>(): Selector<readonly T[], Immutable<T> | undefined> =>
    selector<readonly T[], Immutable<T> | undefined>(x => x[x.length - 1]);

export const mapGetOf =
  <K, V>() =>
  (key: K): Selector<ReadonlyMap<K, V>, Immutable<V> | undefined> =>
    selector<ReadonlyMap<K, V>, Immutable<V> | undefined>(x => x.get(key as Immutable<K>));