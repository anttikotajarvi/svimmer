import type { BranchSlot } from "./branch-struct";
import { canHaveChildren, getChild, MISSING, type Missing } from "./util";

/**
 * Finds deleted roots under a cached branch subtree.
 *
 * A "deleted root" is the highest cached branch in some lost subtree.
 * Once such a root is found, `onDeletedRoot` is called and recursion stops
 * for that subtree. Expanding that root into all destroyed descendants is
 * handled separately.
 *
 * Important semantics:
 * - Path identity matters, not object identity.
 * - Replacing an object with another object at the same path does NOT destroy
 *   the branch.
 * - If a branch still exists but becomes a leaf, then its cached children are
 *   the deleted roots, not the branch itself.
 *
 * Examples:
 *
 * before: employee = { name: "John" }
 * after:  employee = { name: "Carl" }
 * -> no deleted roots
 *
 * before: employee = { name: "John" }
 * after:  employee = 123
 * -> cached children under `ceo` become deleted roots
 *
 * before: employee = { name: "John" }
 * after:  employee removed
 * -> `ceo` itself is a deleted root
 */
export function findDeletedRoots(
  branch: BranchSlot,
  oldVal: unknown | Missing,
  newVal: unknown | Missing,
  depth: number,
  onDeletedRoot: (branch: BranchSlot, depth: number) => void,
): void {
  const oldExists = oldVal !== MISSING;
  const newExists = newVal !== MISSING;

  // If this path did not exist before, nothing can be "lost" here.
  if (!oldExists) return;

  // This path existed before but not after the transaction.
  // The current branch is the root of a lost subtree.
  if (!newExists) {
    onDeletedRoot(branch, depth);
    return;
  }

  const oldCHC = canHaveChildren(oldVal);
  const newCHC = canHaveChildren(newVal);

  // If the old value had no children, then there are no descendant paths
  // that could have been lost.
  if (!oldCHC) return;

  // The current branch still exists, but it no longer supports children.
  // Therefore the current branch survives, but each cached child under it
  // is the root of a lost subtree.
  if (!newCHC) {
    branch.children.forEach((child, step) => {
      const childOld = getChild(oldVal, step);
      findDeletedRoots(child, childOld, MISSING, depth + 1, onDeletedRoot);
    });
    return;
  }

  // Both old and new values can have children.
  // Recurse only through cached child branches.
  branch.children.forEach((child, step) => {
    const childOld = getChild(oldVal, step);
    const childNew = getChild(newVal, step);
    findDeletedRoots(child, childOld, childNew, depth + 1, onDeletedRoot);
  });
}
