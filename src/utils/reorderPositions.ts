import { arrayMove } from '@dnd-kit/sortable';

/**
 * Given the current ordered ids and a drag operation, returns only the entries
 * whose position actually changed. Minimizes server calls.
 */
export function reorderPositions(
  ids: string[],
  activeId: string,
  overId: string,
): Record<string, number> {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return {};

  const reordered = arrayMove(ids, oldIndex, newIndex);
  const changed: Record<string, number> = {};
  for (let i = 0; i < reordered.length; i++) {
    if (reordered[i] !== ids[i]) {
      changed[reordered[i]] = i;
    }
  }
  return changed;
}
