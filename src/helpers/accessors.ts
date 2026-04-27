import type { Immutable } from "immer";
import type { Accessor } from "..";

// whole value
export const self =
  <T>(): Accessor<T, Immutable<T>> =>
  (x) =>
    x;

// collection metrics
export const lengthOf =
  <T extends { length: number }>(): Accessor<T, number> =>
  (x) =>
    x.length;

export const sizeOf =
  <T extends { size: number }>(): Accessor<T, number> =>
  (x) =>
    x.size;

export const isEmpty =
  <T extends { length: number } | { size: number }>(): Accessor<T, boolean> =>
  (x) =>
    "length" in x ? x.length === 0 : x.size === 0;

// membership
export const includes =
  <T>(value: T): Accessor<readonly T[], boolean> =>
  (x) =>
    x.includes(value as Immutable<T>);

export const setHas =
  <T>(value: T): Accessor<ReadonlySet<T>, boolean> =>
  (x) =>
    x.has(value as Immutable<T>);

export const mapHas =
  <K>(key: K): Accessor<ReadonlyMap<K, unknown>, boolean> =>
  (x) =>
    x.has(key as Immutable<K>);

// predicates over arrays
export const some =
  <T>(pred: (item: Immutable<T>, index: number) => boolean): Accessor<readonly T[], boolean> =>
  (x) =>
    x.some(pred);

export const every =
  <T>(pred: (item: Immutable<T>, index: number) => boolean): Accessor<readonly T[], boolean> =>
  (x) =>
    x.every(pred);