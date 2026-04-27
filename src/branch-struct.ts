import type { Subscriber, SvimmerReader, SvimmerWriter } from ".";
import type { Path, Step } from "./path";

export type BranchSlot = {
  step: Step | null;
  parent: BranchSlot | null;
  children: Map<Step, BranchSlot>;
  stale: boolean;

  subs: Set<Subscriber<any>>;
  onDestroy: Set<() => void>;

  reader?: SvimmerReader<any>;
  writer?: SvimmerWriter<any>;
}


export const createBranchSlot = (parent: BranchSlot | null, step: Step | null): BranchSlot => ({
  step,
  parent,
  children: new Map(),
  stale: false,

  subs: new Set(),
  onDestroy: new Set(),
});

export function deleteBranchSlot(branch: BranchSlot): boolean {
if (branch.parent === null || branch.step === null) return false;
  return branch.parent.children.delete(branch.step);
}

/**
 * Ensures that the full branch exists and returns the final node.
 */
export function ensureBranch(root: BranchSlot, path: Path): BranchSlot {
  let cur = root;

  for (const step of path) {
    let next = cur.children.get(step);
    if (!next) {
      next = createBranchSlot(cur, step);
      cur.children.set(step, next);
    }
    cur = next;
  }

  return cur;
}

export type WalkCtx = {
  branch: BranchSlot;
  depth: number;
  step: Step | null;
  walkedPath: Path;
  isTarget: boolean;
};

export type WalkResult<S> = {
  state: S;
  stop?: boolean;
};

/**
 * Walks root -> ... along `path`.
 * Calls `fn` for root and then each existing child branch until:
 * - the path ends, or
 * - the branch tree ends
 *
 * Returns the final accumulator state.
 */
/**
 * Walks root -> ... along `path`.
 * Calls `fn` for the root and then each existing child branch until:
 * - the path ends, or
 * - the branch tree ends
 *
 * If `fn` returns true, walking stops early.
 */
export function walkBranches(
  root: BranchSlot,
  path: Path,
  fn: (ctx: WalkCtx) => boolean | void,
): void {
  let branch: BranchSlot | undefined = root;
  const walkedPath: Path = [];

  // visit root
  if (
    fn({
      branch,
      depth: 0,
      step: null,
      walkedPath,
      isTarget: path.length === 0,
    }) === true
  ) {
    return;
  }

  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;
    branch = branch.children.get(step);
    if (!branch) return;

    walkedPath.push(step);

    if (
      fn({
        branch,
        depth: i + 1,
        step,
        walkedPath,
        isTarget: i === path.length - 1,
      }) === true
    ) {
      return;
    }
  }
}

/**
 * Walk a branch subtree, including the root branch itself.
 * `depth` is the absolute depth in the main branch tree.
 */
export function walkBranchSubtree(
  root: BranchSlot,
  rootDepth: number,
  fn: (branch: BranchSlot, depth: number) => void,
): void {
  fn(root, rootDepth);

  for (const child of root.children.values()) {
    walkBranchSubtree(child, rootDepth + 1, fn);
  }
}

export type DeletedMap = Map<BranchSlot, number>;

/**
 * Expands deleted roots into the full deleted subtree map.
 * Includes the deleted roots themselves.
 *
 * If overlapping deleted roots are present, duplicates are harmless;
 * the same branch just gets set again.
 */
export function buildDeletedChildren(
  deletedRoots: DeletedMap,
): DeletedMap {
  const deletedChildren: DeletedMap = new Map();

  for (const [root, depth] of deletedRoots) {
    walkBranchSubtree(root, depth, (branch, branchDepth) => {
      const prev = deletedChildren.get(branch);
      if (prev == null || branchDepth > prev) {
        deletedChildren.set(branch, branchDepth);
      }
    });
  }

  return deletedChildren;
}