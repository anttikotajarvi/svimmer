import type { Immutable } from "immer";

type Accessor<T, U> = (x: Immutable<T>) => U;

export const id =
  <T>(): Accessor<T, T> =>
  (x) =>
    x as T;

export const key =
  <K extends PropertyKey>(k: K) =>
  <T extends Record<K, unknown>>(x: T) =>
    x[k] as T[K];

export const at =
  (i: number) =>
  <T>(x: readonly T[]): T | undefined =>
    x[i];

export const first =
  <T>(x: readonly T[]): T | undefined =>
    x[0];

export const last =
  <T>(x: readonly T[]): T | undefined =>
    x[x.length - 1];

export const mapGet =
  <K>(k: K) =>
  <V>(x: ReadonlyMap<K, V>): V | undefined =>
    x.get(k);

export const setHas =
  <T>(value: T) =>
  (x: ReadonlySet<T>): boolean =>
    x.has(value);

export const lengthOf =
  <T extends { length: number }>(x: T): number =>
    x.length;

export const sizeOf =
  <T extends { size: number }>(x: T): number =>
    x.size;