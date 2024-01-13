export const isSuperSet = <T>(subset: T[], superset: T[]) => {
  return subset.every((value) => superset.includes(value));
};
