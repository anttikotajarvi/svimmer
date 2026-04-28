import type { BranchSlot } from "./branch-struct";
import { canHaveChildren, getChild, MISSING, type Missing } from "./util";

/**
 * Compare one cached branch subtree between old/new values and emit:
 * - touched surviving branches
 * - deleted roots (topmost lost subtrees)
 *
 * Semantics:
 * - Path identity matters, not object identity
 * - If a branch path survives and its value changes, it is touched
 * - If a branch path is lost, that branch is a deleted root
 * - If a branch survives but stops being able to have children,
 *   its cached children become deleted roots
 */
export function compareBranch(
  branch: BranchSlot,
  oldVal: unknown | Missing,
  newVal: unknown | Missing,
  depth: number,
  onTouched: (branch: BranchSlot, depth: number) => void,
  onDeletedRoot: (branch: BranchSlot, depth: number) => void,
): void {
  const oldExists = oldVal !== MISSING;
  const newExists = newVal !== MISSING;

  // If the path did not exist before, nothing can be lost or updated here.
  if (!oldExists) return;

  // The branch path itself was lost.
  if (!newExists) {
    onDeletedRoot(branch, depth);
    return;
  }

  // The branch path survives and its value changed.
  if (!Object.is(oldVal, newVal)) {
    onTouched(branch, depth);
  }

  const oldCHC = canHaveChildren(oldVal);
  const newCHC = canHaveChildren(newVal);

  // Old value had no children, so no descendant paths could have existed before.
  if (!oldCHC) return;

  // Branch survives, but all cached descendants are lost.
  if (!newCHC) {
    branch.children.forEach((child, step) => {
      const childOld = getChild(oldVal, step);
      compareBranch(
        child,
        childOld,
        MISSING,
        depth + 1,
        onTouched,
        onDeletedRoot,
      );
    });
    return;
  }

  // Both old and new can have children: recurse through cached child branches only.
  branch.children.forEach((child, step) => {
    const childOld = getChild(oldVal, step);
    const childNew = getChild(newVal, step);
    compareBranch(
      child,
      childOld,
      childNew,
      depth + 1,
      onTouched,
      onDeletedRoot,
    );
  });
}