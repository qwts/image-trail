export const SITE_CAPTURE_RULE_LIMIT = 100;

export type SiteCaptureBehavior = 'pin-only' | 'capture-original';
export type SiteCaptureRules = Readonly<Record<string, SiteCaptureBehavior>>;

export interface SiteCaptureRulesPanelState {
  readonly siteCaptureRules: SiteCaptureRules;
}

export type SiteCaptureRulesPanelAction = {
  readonly name: 'settings/update-site-capture-rule';
  readonly hostname: string;
  readonly behavior: SiteCaptureBehavior | null;
};

export function isSiteCaptureBehavior(value: unknown): value is SiteCaptureBehavior {
  return value === 'pin-only' || value === 'capture-original';
}

export function normalizeSiteCaptureHostname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hostname = value.trim().toLowerCase().replace(/\.$/u, '');
  if (!hostname || hostname.length > 253 || /[/@:\s]/u.test(hostname)) return null;
  try {
    const normalized = new URL(`https://${hostname}`).hostname.toLowerCase().replace(/\.$/u, '');
    const validLabels = normalized.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u.test(label));
    return normalized === hostname && validLabels ? normalized : null;
  } catch {
    return null;
  }
}

export function sanitizeSiteCaptureRules(value: unknown): SiteCaptureRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const rules: Record<string, SiteCaptureBehavior> = {};
  for (const [rawHostname, rawBehavior] of Object.entries(value)) {
    const hostname = normalizeSiteCaptureHostname(rawHostname);
    if (!hostname || !isSiteCaptureBehavior(rawBehavior) || Object.keys(rules).length >= SITE_CAPTURE_RULE_LIMIT) continue;
    rules[hostname] = rawBehavior;
  }
  return rules;
}

export function siteCaptureBehaviorForHostname(rules: SiteCaptureRules, hostname: unknown): SiteCaptureBehavior {
  const normalized = normalizeSiteCaptureHostname(hostname);
  return normalized ? (rules[normalized] ?? 'pin-only') : 'pin-only';
}

export function updateSiteCaptureRule(rules: SiteCaptureRules, hostname: unknown, behavior: SiteCaptureBehavior | null): SiteCaptureRules {
  const normalized = normalizeSiteCaptureHostname(hostname);
  if (!normalized) return rules;
  const next = { ...sanitizeSiteCaptureRules(rules) };
  if (behavior === null) {
    delete next[normalized];
  } else if (isSiteCaptureBehavior(behavior) && (normalized in next || Object.keys(next).length < SITE_CAPTURE_RULE_LIMIT)) {
    next[normalized] = behavior;
  }
  return next;
}
