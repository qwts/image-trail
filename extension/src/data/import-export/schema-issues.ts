import * as v from 'valibot';

/** Renders valibot issues as `"<dotted.path>: <message>"` (or just the message at the root). */
export function summarizeIssues(issues: readonly v.BaseIssue<unknown>[]): readonly string[] {
  return issues.map((issue) => {
    const path = v.getDotPath(issue);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** The first summarized issue, used as a per-entry rejection reason; falls back to `fallback`. */
export function firstIssueReason(issues: readonly v.BaseIssue<unknown>[], fallback: string): string {
  return summarizeIssues(issues)[0] ?? fallback;
}
