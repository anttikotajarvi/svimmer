import type { Immutable } from "immer";
import type { Selector, SvimmerReader } from "..";

export const key =
  <K extends PropertyKey>(key: K) =>
  <T extends Record<K, any>>(x: T): T[K] =>
    x[key];

export const at =
  (index: number) =>
  <T>(x: readonly T[]): T | undefined =>
    x[index];

export const first =
  <T>(x: readonly T[]): T | undefined =>
    x[0];

export const last =
  <T>(x: readonly T[]): T | undefined =>
    x[x.length - 1];

export const mapGet =
  <K>(key: K) =>
  <V>(x: ReadonlyMap<K, V>): V | undefined =>
    x.get(key);
