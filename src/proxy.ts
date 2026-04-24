import { symTrackerDetails } from "../svelte-immer-store/src/proxy/tracker";
import type { Path } from "./path";
export function extractPath(tracked: any): Path {
  const path: Path = [];
  let cur = tracked;

  while (cur && cur[symTrackerDetails]?.parent !== undefined) {
    const d = cur[symTrackerDetails];
    if (d.property !== undefined) path.push(d.property);
    cur = d.parent;
  }

  path.reverse();
  return path;
}