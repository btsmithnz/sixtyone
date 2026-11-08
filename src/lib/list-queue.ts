/** A party's list in order, minus its electorate winners: who's next in. */
export type ListQueue = { name: string; listNo: number }[];

/**
 * Who'd come in or go out if a party's list seats changed: the people just
 * below or just above the cut on its list.
 */
export function listChange(
  queue: ListQueue | undefined,
  from: number,
  to: number,
): { in: ListQueue; out: ListQueue } {
  if (!queue) return { in: [], out: [] };
  return to > from
    ? { in: queue.slice(from, to), out: [] }
    : { in: [], out: queue.slice(to, from) };
}
