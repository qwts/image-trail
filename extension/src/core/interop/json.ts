import * as v from 'valibot';

export type InteropJsonValue = null | boolean | number | string | InteropJsonValue[] | { [key: string]: InteropJsonValue };
export type InteropJsonObject = { [key: string]: InteropJsonValue };

export const interopJsonValueSchema: v.GenericSchema<unknown, InteropJsonValue> = v.lazy(() =>
  v.union([v.null(), v.boolean(), v.pipe(v.number(), v.finite()), v.string(), v.array(interopJsonValueSchema), interopJsonObjectSchema]),
);

export const interopJsonObjectSchema: v.GenericSchema<unknown, InteropJsonObject> = v.record(v.string(), interopJsonValueSchema);
