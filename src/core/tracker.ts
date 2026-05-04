
/**
 * From WHenderson 
 * https://github.com/WHenderson/svelte-immer-store
 * 
 * Modified to capture maps get method
 */


/* eslint-disable @typescript-eslint/no-unsafe-return,@typescript-eslint/ban-types */
import type { Step } from "./path";

export const symTrackerDetails = Symbol("details");
declare const symFocusValue: unique symbol;

type TrackerDetails<T> = {
  value: T;
  parent: object | undefined;
  property: PropertyKey | undefined;
};

/**
 * User-facing focus proxy marker.
 * Only used for extracting the focused value type.
 */
export interface FocusValue<T> {
  readonly [symFocusValue]: T;
}

export type Unfocus<T> = T extends FocusValue<infer V> ? V : never;

/**
 * User-facing selector proxy type.
 *
 * Rules:
 * - object property access keeps the declared property type
 * - array index access yields E | undefined
 * - Map.get(...) yields V | undefined
 *
 * This matches the value-handle model:
 * - undefined means absence
 * - null is a real value
 */
export type FocusProxy<T> =
  FocusValue<T> &
    (
      T extends ReadonlyMap<infer K, infer V>
        ? {
            get(key: K & Step): FocusProxy<V | undefined>;
          }
        : T extends readonly (infer E)[]
          ? {
              readonly [n: number]: FocusProxy<E | undefined>;
            }
          : T extends object
            ? {
                readonly [P in keyof T]: FocusProxy<T[P]>;
              }
            : {}
    );

/**
 * Internal proxy type with tracker metadata.
 * This metadata should not be part of normal selector ergonomics.
 */
export type TrackerProxy<T> =
  FocusProxy<T> & {
    readonly [symTrackerDetails]: TrackerDetails<T>;
  };

const isStep = (x: unknown): x is Step =>
  typeof x === "string" || typeof x === "number" || typeof x === "symbol";

export function createTrackerProxy<T>(value: T): TrackerProxy<T>;
export function createTrackerProxy<T>(
  value: T,
  parent: object,
  property: PropertyKey,
): TrackerProxy<T>;
export function createTrackerProxy<T>(
  value: T,
  parent?: object,
  property?: PropertyKey,
): TrackerProxy<T> {
  let self!: TrackerProxy<T>;

  const details: TrackerDetails<T> = {
    value,
    parent,
    property,
  };

  self = new Proxy(
    {},
    {
      get(_target: never, p: PropertyKey) {
        if (p === symTrackerDetails) return details;

        // Capture Map.get(key) as one path step
        if (p === "get" && value instanceof Map) {
          return ((key: unknown) => {
            if (!isStep(key)) {
              throw new Error(
                "TrackerProxy only supports Map.get with string | number | symbol keys",
              );
            }

            const result = value.get(key);
            return createTrackerProxy(result, self as object, key);
          }) as unknown;
        }

        const result = (() => {
          try {
            return Reflect.get(value as object, p);
          } catch {
            return undefined;
          }
        })();

        // Proxy array indexing arrives as string keys like "0"
        const prop =
          typeof p === "string" &&
          Array.isArray(value) &&
          /^(0|[1-9][0-9]*)$/.test(p)
            ? parseInt(p, 10)
            : p;

        return createTrackerProxy(result, self as object, prop);
      },

      ownKeys(): ArrayLike<string | symbol> {
        if (value && typeof value === "object") {
          return Reflect.ownKeys(value as object);
        }
        return [];
      },

      getOwnPropertyDescriptor(
        _target: {},
        p: string | symbol,
      ): PropertyDescriptor | undefined {
        if (value && typeof value === "object") {
          return Reflect.getOwnPropertyDescriptor(value as object, p);
        }
        return undefined;
      },
    },
  ) as unknown as TrackerProxy<T>;

  return self;
}