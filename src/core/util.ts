import type { Step } from "./path";

export type CanHaveChildren = object | Map<any, any> | any[];
export type CannotHaveChildren =
  | Set<any>
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | symbol;

export const canHaveChildren = (x: unknown): x is CanHaveChildren => {
  if (x == null) return false;
  if (x instanceof Set) return false;
  if (x instanceof Map) return true;
  if (Array.isArray(x)) return true;
  return typeof x === "object";
};

export const MISSING = Symbol("missing");
export type Missing = typeof MISSING;

export function getChild(
  value: CanHaveChildren | CannotHaveChildren | Missing,
  step: Step,
): unknown | Missing {
  if (value === MISSING) return MISSING;

  if (value instanceof Map) {
    return value.has(step) ? value.get(step) : MISSING;
  }

  if (Array.isArray(value)) {
    if (typeof step !== "number") return MISSING;
    return step in value ? value[step] : MISSING;
  }

  if (value && typeof value === "object") {
    return Object.prototype.hasOwnProperty.call(value, step)
      ? (value as Record<Step, unknown>)[step]
      : MISSING;
  }

  return MISSING;
}