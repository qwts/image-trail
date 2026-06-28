export interface ImportValidationIssueSummary {
  readonly reason: string;
  readonly count: number;
}

export interface ImportValidationReport {
  readonly rejectedCount: number;
  readonly reasons: readonly ImportValidationIssueSummary[];
}

export function createImportValidationReport(reasons: readonly string[]): ImportValidationReport {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return {
    rejectedCount: reasons.length,
    reasons: [...counts.entries()].map(([reason, count]) => ({ reason, count })),
  };
}
