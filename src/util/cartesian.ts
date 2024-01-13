export function cartesianProduct<T>(
  obj: Record<string, T[]>,
): Record<string, T>[] {
  // Extract keys and values from the object
  const keys = Object.keys(obj);
  const values = keys.map((key) => obj[key]);

  // Recursive function to form the Cartesian product
  function cartesianHelper(arr, index) {
    if (index === values.length) {
      return [arr];
    } else {
      const result = [];
      for (const value of values[index]) {
        result.push(
          ...cartesianHelper([...arr, { [keys[index]]: value }], index + 1),
        );
      }
      return result;
    }
  }

  const arrCart = cartesianHelper([], 0);

  return arrCart.map((el) =>
    el.reduce((acc, subel) => ({ ...acc, ...subel }), {}),
  );
}
