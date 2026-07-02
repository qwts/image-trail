import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../schema-assert.js';
import type { PCloudBackupDownloadInput, PCloudBackupUploadInput } from './pcloud-provider.js';

export const pcloudBackupUploadInputSchema = v.object({
  fileName: v.string(),
  fileContent: v.string(),
});

export const pcloudBackupDownloadInputSchema = v.object({
  fileId: v.number(),
  fileName: v.string(),
});

type _AssertPCloudBackupUploadInput = Assert<
  MutuallyAssignable<v.InferOutput<typeof pcloudBackupUploadInputSchema>, PCloudBackupUploadInput>
>;
type _AssertPCloudBackupDownloadInput = Assert<
  MutuallyAssignable<v.InferOutput<typeof pcloudBackupDownloadInputSchema>, PCloudBackupDownloadInput>
>;
