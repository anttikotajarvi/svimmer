/**
 * Immer seems to allow for symbol keyd properties even though they 
 *  do not appear in the types.
 * Note that symbols can't be serialized so 
 */
export type Step = string | number | symbol;
export type Path = Step[];

export const isRootPath = (path:Path) => path.length == 0;

export type ResolvePathResult<T = unknown> =
  | {
      ok: true;
      exists: true;
      value: T;
      parent: unknown;
      step: Step | null;
    }
  | {
      ok: false;
      exists: false;
      failedAt: number;
      step: Step;
      parent: unknown;
      reason:
        | "nullish-parent"
        | "missing-key"
        | "invalid-array-index"
        | "set-is-terminal"
        | "primitive-parent";
    };

/**
 * Resolves a path while distinguishing:
 * - missing path
 * - existing leaf whose value is `undefined`
 *
 * On success:
 * - `value`  = resolved leaf value
 * - `parent` = direct parent container of the leaf
 * - `step`   = final step used to reach the leaf
 *
 * For root path []:
 * - `value`  = root data
 * - `parent` = undefined
 * - `step`   = null
 */
export function resolvePath<T = unknown>(
  data: unknown,
  path: Path,
): ResolvePathResult<T> {
  if (path.length === 0) {
    return {
      ok: true,
      exists: true,
      value: data as T,
      parent: undefined,
      step: null,
    };
  }

  let cur: unknown = data;
  let parent: unknown = undefined;

  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;

    if (cur == null) {
      return {
        ok: false,
        exists: false,
        failedAt: i,
        step,
        parent: cur,
        reason: "nullish-parent",
      };
    }

    if (cur instanceof Map) {
      if (!cur.has(step)) {
        return {
          ok: false,
          exists: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "missing-key",
        };
      }
      parent = cur;
      cur = cur.get(step);
      continue;
    }

    if (cur instanceof Set) {
      return {
        ok: false,
        exists: false,
        failedAt: i,
        step,
        parent: cur,
        reason: "set-is-terminal",
      };
    }

    if (Array.isArray(cur)) {
      if (typeof step !== "number" || !Number.isInteger(step)) {
        return {
          ok: false,
          exists: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "invalid-array-index",
        };
      }

      if (!(step in cur)) {
        return {
          ok: false,
          exists: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "missing-key",
        };
      }

      parent = cur;
      cur = cur[step];
      continue;
    }

    if (typeof cur === "object" || typeof cur === "function") {
      const obj = cur as Record<Step, unknown>;

      if (!Object.prototype.hasOwnProperty.call(obj, step)) {
        return {
          ok: false,
          exists: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "missing-key",
        };
      }

      parent = cur;
      cur = obj[step];
      continue;
    }

    return {
      ok: false,
      exists: false,
      failedAt: i,
      step,
      parent: cur,
      reason: "primitive-parent",
    };
  }

  return {
    ok: true,
    exists: true,
    value: cur as T,
    parent,
    step: path[path.length - 1]!,
  };
}

/**
 * Will throw errors on invalid calls.
 */
export function replaceChild(
  parent: unknown,
  step: Step,
  value: unknown,
): void {
  if (parent instanceof Map) {
    parent.set(step, value);
    return;
  }

  if (parent instanceof Set) {
    throw new Error("replaceChild: Set is terminal and cannot be indexed");
  }

  if (Array.isArray(parent)) {
    if (typeof step !== "number" || !Number.isInteger(step)) {
      throw new Error("replaceChild: Invalid array index");
    }
    parent[step] = value;
    return;
  }

  if (parent != null && (typeof parent === "object" || typeof parent === "function")) {
    (parent as Record<Step, unknown>)[step] = value;
    return;
  }

  throw new Error("replaceChild: Parent is not writable");
}