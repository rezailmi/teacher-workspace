/**
 * Exhaustiveness helper. Call from the default branch of a discriminant
 * switch; adding a new variant to the union causes a compile error until
 * the switch is extended to cover it.
 */
export function assertNever(x: never): never {
  throw new Error(`Unreachable: ${JSON.stringify(x)}`);
}
