/**
 * Immer seems to allow for symbol keyd properties even though they 
 *  do not appear in the types.
 * Note that symbols can't be serialized so 
 */
export type Step = string | number | symbol

export type Path = Step[];

export function ensurePath(data: unknown, path: Path): boolean {
  let cur: unknown = data;

  for (const step of path) {
    if (cur == null) return false;

    // Map
    if (cur instanceof Map) {
      if (!cur.has(step)) return false;
      cur = cur.get(step);
      continue;
    }

    // Set is terminal for now
    if (cur instanceof Set) {
      return false;
    }

    // Array
    if (Array.isArray(cur)) {
      if (typeof step !== "number") return false;
      if (!(step in cur)) return false;
      cur = cur[step];
      continue;
    }

    // Object / function object
    if (typeof cur === "object" || typeof cur === "function") {
      const obj = cur as Record<string | number | symbol, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, step)) return false;
      cur = obj[step];
      continue;
    }

    return false;
  }

  return true;
}

export type ResolvePathResult<T = unknown> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      failedAt: number;
      step: string | number | symbol;
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
 */
export function resolvePath<T = unknown>(
  data: unknown,
  path: Path
): ResolvePathResult<T> {
  let cur: unknown = data;

  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;

    if (cur == null) {
      return {
        ok: false,
        failedAt: i,
        step,
        parent: cur,
        reason: "nullish-parent"
      };
    }

    if (cur instanceof Map) {
      if (!cur.has(step)) {
        return {
          ok: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "missing-key"
        };
      }
      cur = cur.get(step);
      continue;
    }

    if (cur instanceof Set) {
      return {
        ok: false,
        failedAt: i,
        step,
        parent: cur,
        reason: "set-is-terminal"
      };
    }

    if (Array.isArray(cur)) {
      if (typeof step !== "number" || !Number.isInteger(step)) {
        return {
          ok: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "invalid-array-index"
        };
      }

      if (!(step in cur)) {
        return {
          ok: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "missing-key"
        };
      }

      cur = cur[step];
      continue;
    }

    if (typeof cur === "object" || typeof cur === "function") {
      const obj = cur as Record<string | number | symbol, unknown>;

      if (!Object.prototype.hasOwnProperty.call(obj, step)) {
        return {
          ok: false,
          failedAt: i,
          step,
          parent: cur,
          reason: "missing-key"
        };
      }

      cur = obj[step];
      continue;
    }

    return {
      ok: false,
      failedAt: i,
      step,
      parent: cur,
      reason: "primitive-parent"
    };
  }

  return {
    ok: true,
    value: cur as T
  };
}