import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type CloseLinkedIssuesModule = {
  extractClosingIssueNumbers(body: string, repository: string): number[];
  removeWipPrefix(title: string): string;
  closeCommentForPullRequest(prNumber: number, baseRef: string): string;
  shouldProcessMergedPullRequest(pullRequest: { merged?: boolean; base?: { ref?: string } } | undefined): boolean;
  TARGET_BASE_REFS: string[];
};

const closeLinkedIssues = (await import(
  pathToFileURL(join(process.cwd(), 'scripts/close-linked-issues.mjs')).href
)) as CloseLinkedIssuesModule;

test('extractClosingIssueNumbers finds same-repo closing references in first-seen order', () => {
  const body = ['Closes #156.', 'Fixes qwts/image-trail#161 and resolves #156.', 'Resolved other-owner/image-trail#999.'].join('\n');

  assert.deepEqual(closeLinkedIssues.extractClosingIssueNumbers(body, 'qwts/image-trail'), [156, 161]);
});

test('extractClosingIssueNumbers ignores non-closing references', () => {
  const body = 'Related to #10. See #11. Fixes #12.';

  assert.deepEqual(closeLinkedIssues.extractClosingIssueNumbers(body, 'qwts/image-trail'), [12]);
});

test('extractClosingIssueNumbers stops before unrelated same-line references', () => {
  const body = 'Closes #10. Follow-up tracked in #11.';

  assert.deepEqual(closeLinkedIssues.extractClosingIssueNumbers(body, 'qwts/image-trail'), [10]);
});

test('removeWipPrefix removes only the leading WIP marker', () => {
  assert.equal(closeLinkedIssues.removeWipPrefix('[WIP] Close linked issues'), 'Close linked issues');
  assert.equal(closeLinkedIssues.removeWipPrefix('Close [WIP] linked issues'), 'Close [WIP] linked issues');
});

test('closeCommentForPullRequest names the merged PR and base branch', () => {
  assert.equal(closeLinkedIssues.closeCommentForPullRequest(158, 'codex/dev'), 'Closed by merged PR #158 into codex/dev.');
});

test('shouldProcessMergedPullRequest accepts a merged PR based on main', () => {
  assert.deepEqual(closeLinkedIssues.TARGET_BASE_REFS, ['main']);
  assert.equal(closeLinkedIssues.shouldProcessMergedPullRequest({ merged: true, base: { ref: 'main' } }), true);
});

test('shouldProcessMergedPullRequest rejects an unmerged PR', () => {
  assert.equal(closeLinkedIssues.shouldProcessMergedPullRequest({ merged: false, base: { ref: 'main' } }), false);
});

test('shouldProcessMergedPullRequest rejects a merge into a branch that is not the trunk', () => {
  assert.equal(closeLinkedIssues.shouldProcessMergedPullRequest({ merged: true, base: { ref: 'codex/dev' } }), false);
});
