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
    // Keep selectable build metadata above the host page but below Image Trail
    // panel and workspace chrome so it cannot block rail controls.
    host.style.zIndex = '2147483646';
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

  const details = document.createElement('pre');
  details.className = 'image-trail-build-overlay__details';
  details.textContent = buildIdentityRows(buildIdentity)
    .map((row) => `${row.label}: ${row.value}`)
    .join('\n');

  wrapper.append(heading, details);
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
      pointer-events: auto;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
    }

    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .image-trail-build-overlay__details {
      margin: 0;
      white-space: pre-wrap;
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace;
      user-select: text;
      -webkit-user-select: text;
    }
  `;
  return style;
}
