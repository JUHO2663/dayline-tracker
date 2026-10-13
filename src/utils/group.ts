/** Groups consecutive items that share a key (e.g. a date), preserving order. */
export function groupBy<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups: [string, T[]][] = [];
  for (const item of items) {
    const key = keyOf(item);
    const last = groups[groups.length - 1];
    if (last && last[0] === key) last[1].push(item);
    else groups.push([key, [item]]);
  }
  return groups;
}
