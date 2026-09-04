#!/usr/bin/env node
// Issue #856 migration runner: copy retired wiki content into in-repo docs/
// and rewrite wiki cross-links to relative in-repo markdown links.
//
// Usage:
//   export WIKI_DIR=/path/to/image-trail.wiki   # cloned wiki checkout
//   node scripts/wiki-migrate-856.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { WIKI_PAGE_TO_REPO } from './wiki-mapping-856.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wikiDir = process.env.WIKI_DIR || path.resolve(root, '../image-trail-wiki');

// ---------------------------------------------------------------- link rewriting

// Resolve a bare wiki-footer/page name (e.g. "Versioning-and-Releases",
// "ADR-0004-...", "Acceptance-Tests") to its repo-relative target.
function repoPathForWikiName(wikiName) {
  return WIKI_PAGE_TO_REPO.get(`${wikiName}.md`) ?? null;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// Compute a relative markdown link href from `fromFile` (repo-relative) to the
// repo-relative `target` path. Returns a github-flavor relative path.
function relativeHref(fromFile, target) {
  const fromDir = path.posix.dirname(fromFile);
  let rel = path.posix.relative(fromDir, target);
  if (!rel) rel = '.';
  return toPosix(rel);
}

// Rewrite wiki cross-links in a single file body.
// Handles:
//   [label](Page-Name)                      bare wiki page link
//   [label](https://github.com/qwts/.../wiki/Page-Name)  absolute wiki URL
//   [label](../docs/foo.md)                 already-in-repo relative (leave)
// Leaves non-wiki links (issues, external URLs, repo source paths) untouched.
function rewriteLinks(body, fromFile) {
  // 1) absolute wiki URLs: [label](https://github.com/qwts/image-trail/wiki/X)
  //    (also allow a trailing .md on X)
  body = body.replace(
    /\]\(\s*(?:https?:\/\/)?github\.com\/qwts\/image-trail\/wiki\/([A-Za-z0-9._-]+)\s*\)/g,
    (match, page) => {
      const target = repoPathForWikiName(page);
      if (!target) {
        console.error(`  [warn] no mapping for absolute wiki link to "${page}"`);
        return match;
      }
      return `](${relativeHref(fromFile, target)})`;
    },
  );

  // 2) bare wiki page links: [label](Page-Name) where Page-Name matches a known wiki page.
  body = body.replace(/\]\(([A-Za-z0-9.-]+)\)/g, (match, href) => {
    const withoutExt = href.endsWith('.md') ? href.slice(0, -3) : href;
    const target = repoPathForWikiName(withoutExt);
    if (!target) return match;
    return `](${relativeHref(fromFile, target)})`;
  });

  return body;
}

// If a wiki page's body has a stray leading "wiki is the canonical ..." pointer,
// that is fine to keep as-is; we deliberately do not strip content. Content from
// the wiki is authoritative and migrated verbatim (modulo link rewriting).

// ---------------------------------------------------------------- main

async function run() {
  let ok = 0;
  let skipped = 0;
  let missing = 0;

  for (const [wikiPage, repoPath] of WIKI_PAGE_TO_REPO) {
    const src = path.join(wikiDir, wikiPage);
    const dest = path.join(root, repoPath);

    let raw;
    try {
      raw = await readFile(src, 'utf8');
    } catch {
      console.error(`MISSING source: ${wikiPage}`);
      missing += 1;
      continue;
    }

    // A small number of pages are duplicates/aliases folded into one target
    // (e.g. User-Stories -> docs/user-stories/README.md). Skipping is handled by
    // mapping uniqueness; if the destination already exists from a prior key we
    // should not silently overwrite a distinct alias. We keep last-write-wins.
    const rewritten = rewriteLinks(raw, repoPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, rewritten, 'utf8');
    ok += 1;
  }

  console.log(`Done. Wrote ${ok}, skipped ${skipped}, missing ${missing}.`);

  const mapped = [...WIKI_PAGE_TO_REPO.values()];
  const dupes = mapped.filter((p, i) => mapped.indexOf(p) !== i);
  if (dupes.length) console.error(`Duplicate target paths: ${[...new Set(dupes)].join(', ')}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
