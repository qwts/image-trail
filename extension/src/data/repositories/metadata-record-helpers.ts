import * as v from 'valibot';

export interface MetadataKindRecord {
  readonly key: string;
  readonly kind: string;
  readonly updatedAt?: string | undefined;
}

const metadataKindRecordSchema = v.object({
  key: v.string(),
  kind: v.string(),
  updatedAt: v.optional(v.string()),
}) as v.GenericSchema<unknown, MetadataKindRecord>;

export function isMetadataRecordKind(record: unknown, kind: string): record is MetadataKindRecord {
  const parsed = v.safeParse(metadataKindRecordSchema, record);
  return parsed.success && parsed.output.kind === kind;
}

export function metadataRecordKind(record: unknown): string | null {
  const parsed = v.safeParse(metadataKindRecordSchema, record);
  return parsed.success ? parsed.output.kind : null;
}

export function storedUpdatedAt(record: unknown, kind: string): string {
  const parsed = v.safeParse(metadataKindRecordSchema, record);
  return parsed.success && parsed.output.kind === kind ? (parsed.output.updatedAt ?? '') : '';
}
