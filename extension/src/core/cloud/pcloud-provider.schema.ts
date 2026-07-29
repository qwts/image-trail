import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../schema-assert.js';
import type { PCloudBackupDownloadInput, PCloudBackupUploadInput } from './pcloud-provider.js';

export const pcloudBackupUploadInputSchema = v.union([
  v.object({
    operation: v.optional(v.literal('upload')),
    fileName: v.string(),
    fileContent: v.string(),
    recordHistory: v.optional(v.boolean()),
  }),
  v.object({
    operation: v.literal('cleanup'),
    fileIds: v.pipe(v.array(v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1))), v.readonly()),
  }),
]);

export const pcloudBackupDownloadInputSchema = v.object({
  fileId: v.number(),
  fileName: v.string(),
  kind: v.optional(v.picklist(['manifest', 'part'])),
});

type _AssertPCloudBackupUploadInput = Assert<
  MutuallyAssignable<v.InferOutput<typeof pcloudBackupUploadInputSchema>, PCloudBackupUploadInput>
>;
type _AssertPCloudBackupDownloadInput = Assert<
  MutuallyAssignable<v.InferOutput<typeof pcloudBackupDownloadInputSchema>, PCloudBackupDownloadInput>
>;
