import { buildIdentityRows, isNonProductionBuildIdentity, type BuildIdentity } from '../core/build-info.js';

const OVERLAY_HOST_ID = 'image-trail-build-identity-overlay';

export class BuildIdentityOverlay {
  private host: HTMLElement | null = null;

  show(buildIdentity: BuildIdentity | null): boolean {
    if (!isNonProductionBuildIdentity(buildIdentity)) {
      this.hide();
      return false;
    }
    this.render(buildIdentity);
    return true;
  }

  toggle(buildIdentity: BuildIdentity | null): boolean {
    if (!isNonProductionBuildIdentity(buildIdentity)) {
      this.hide();
      return false;
    }
    if (this.host) {
      this.hide();
      return true;
    }
    this.render(buildIdentity);
    return true;
  }

  isVisible(): boolean {
    return this.host !== null;
  }

  hide(): void {
    this.host?.remove();
    this.host = null;
  }

  private render(buildIdentity: BuildIdentity): void {
    this.hide();

    const host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    host.setAttribute('aria-live', 'polite');
    host.style.position = 'fixed';
    host.style.top = '12px';
    host.style.right = '12px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(createStyles(), createOverlayContent(buildIdentity));
    const container = document.body ?? document.documentElement;
    container.append(host);
    this.host = host;
  }
}

function createOverlayContent(buildIdentity: BuildIdentity): HTMLElement {
  const wrapper = document.createElement('aside');
  wrapper.className = 'image-trail-build-overlay';
  wrapper.setAttribute('role', 'status');
  wrapper.setAttribute('aria-label', 'Image Trail build data');

  const heading = document.createElement('h2');
  heading.textContent = 'Image Trail build';

  const rows = document.createElement('dl');
  for (const row of buildIdentityRows(buildIdentity)) {
    const label = document.createElement('dt');
    label.textContent = row.label;
    const value = document.createElement('dd');
    value.textContent = row.value;
    rows.append(label, value);
  }

  wrapper.append(heading, rows);
  return wrapper;
}

function createStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      color-scheme: light dark;
      font-family:
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .image-trail-build-overlay {
      box-sizing: border-box;
      max-width: min(360px, calc(100vw - 24px));
      padding: 10px 12px;
      border: 1px solid rgba(148, 163, 184, 0.52);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.92);
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.26);
      color: #f8fafc;
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }

    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 4px 10px;
      margin: 0;
    }

    dt {
      color: #cbd5e1;
      font-weight: 600;
    }

    dd {
      margin: 0;
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace;
    }
  `;
  return style;
}
