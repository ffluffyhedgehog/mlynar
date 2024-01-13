export function recordEqual<
  T extends Record<string, K>,
  K extends string | number,
>(a: T, b: T): boolean {
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(b));
  if (aKeys.size !== bKeys.size) return false;

  for (const key of aKeys) {
    if (!bKeys.has(key) || a[key] !== b[key]) {
      return false;
    }
    bKeys.delete(key);
  }
  if (bKeys.size > 0) return false;
  return true;
}
