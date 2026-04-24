import type { Subscriber, SvimmerReader, SvimmerWriter } from ".";
import type { Path, Step } from "./path";

export type BranchSlot = {
  subs: Set<Subscriber<any>>;
  children: Map<Step, BranchSlot>;
  reader?: SvimmerReader<any>;
  writer?: SvimmerWriter<any>;
}

export type BranchCtx = {
  getState: () => 
}
export const createBranchSlot = (): BranchSlot => ({
  subs: new Set(),
  children: new Map(),
});

/**
 * Ensures that the full branch exists and returns the final node.
 */
export function ensureBranch(root: BranchSlot, path: Path): BranchSlot {
  let cur = root;

  for (const step of path) {
    let next = cur.children.get(step);
    if (!next) {
      next = createBranchSlot();
      cur.children.set(step, next);
    }
    cur = next;
  }

  return cur;
}