#!/usr/bin/env node
// Reject any tracked reference to the retired GitHub wiki (issue #856).
// The wiki has been retired; canonical documentation now lives in-repo under
// docs/. This guard fails CI if a new https://github.com/qwts/image-trail/wiki
// reference is added, keeping the repository from re-adopting the dead surface.

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const pattern = 'github.com/qwts/image-trail/wiki';

let files;
try {
  // The guard itself and the one-shot migration tool name the retired URL as
  // the thing they forbid/rewrite, so they are excluded from their own scan.
  const output = execFileSync('git', ['grep', '-l', '-I', pattern, '--', ':!package-lock.json', ':!scripts/check-wiki-retired.mjs', ':!scripts/wiki-migrate-856.mjs'], {
    encoding: 'utf8',
  });
  files = output.split('\n').filter(Boolean);
} catch (error) {
  // git grep exits non-zero (128 for no matches in some versions, or 1) when
  // nothing matches; the absence of matches is the success case.
  if (error?.status && (error.status === 1 || error.status === 128)) {
    console.log('No retired github.com/qwts/image-trail/wiki references found. OK.');
    process.exit(0);
  }
  throw error;
}

if (files.length > 0) {
  console.error('Retired GitHub wiki references found (github.com/qwts/image-trail/wiki):');
  for (const file of files) console.error(`  - ${file}`);
  console.error('');
  console.error('The wiki is retired. Move or point this reference at the source-controlled doc under docs/.');
  process.exit(1);
}

console.log('No retired github.com/qwts/image-trail/wiki references found. OK.');
