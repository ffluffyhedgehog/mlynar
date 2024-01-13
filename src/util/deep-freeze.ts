export type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};
export function deepFreeze<T extends object>(object: T): DeepReadonly<T> {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object) as (keyof T)[];

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = object[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
