import type { Immutable } from "immer";
import type { Accessor, BrandedAccessor } from "..";

/**
 * Create a branded accessor for reusable read-only helpers,
 * that can't accidentally be used as selectors.
 */
export function accessor<T, U>(fn: Accessor<T, U>): BrandedAccessor<T, U> {
  return fn as BrandedAccessor<T, U>;
}

// whole value
export const self =
  <T>(): BrandedAccessor<T, Immutable<T>> =>
    accessor((x) => x);

// collection metrics
export const lengthOf =
  <T extends { length: number }>(): BrandedAccessor<T, number> =>
    accessor((x) => x.length);

export const sizeOf =
  <T extends { size: number }>(): BrandedAccessor<T, number> =>
    accessor((x) => x.size);

export const isEmpty =
  <T extends { length: number } | { size: number }>(): BrandedAccessor<T, boolean> =>
    accessor((x) => ("length" in x ? x.length === 0 : x.size === 0));

// membership
export const includes =
  <T>(value: T): BrandedAccessor<readonly T[], boolean> =>
    accessor((x) => x.includes(value as Immutable<T>));

export const setHas =
  <T>(value: T): BrandedAccessor<ReadonlySet<T>, boolean> =>
    accessor((x) => x.has(value as Immutable<T>));

export const mapHas =
  <K>(key: K): BrandedAccessor<ReadonlyMap<K, unknown>, boolean> =>
    accessor((x) => x.has(key as Immutable<K>));

// predicates over arrays
export const some =
  <T>(pred: (item: Immutable<T>, index: number) => boolean): BrandedAccessor<readonly T[], boolean> =>
    accessor((x) => x.some(pred));

export const every =
  <T>(pred: (item: Immutable<T>, index: number) => boolean): BrandedAccessor<readonly T[], boolean> =>
    accessor((x) => x.every(pred));