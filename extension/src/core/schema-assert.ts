/**
 * Compile-time parity guards for valibot schemas that mirror a hand-written
 * interface. `MutuallyAssignable<A, B>` is `true` only when `A` and `B` are
 * assignable in both directions, so a `type _Assert = Assert<MutuallyAssignable<…>>`
 * line next to a schema fails to compile the moment the schema and its interface
 * drift (missing field, extra field, wrong optionality). Property-level `readonly`
 * modifiers are ignored by TS assignability, so schemas only need `v.readonly()`
 * on arrays to line up with `readonly T[]` interface members.
 */
export type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type Assert<T extends true> = T;
