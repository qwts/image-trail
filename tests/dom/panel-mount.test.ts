import test from 'node:test';
import assert from 'node:assert/strict';

import { PanelMount, type PanelMountDeps, type PanelMountEnvironment } from '../../extension/src/ui/panel/panel-mount.js';

const ROOT_ID = 'image-trail-panel-root';

interface Harness {
  readonly mount: PanelMount;
  readonly stylesReadyCalls: number[];
  fireFallback(): void;
}

// Unlike the flat unit test's hand-rolled fake document, this harness mounts into the real
// happy-dom document so the shadow-root structure and reveal behavior run against actual DOM.
function createHarness(depOverrides: Partial<PanelMountDeps> = {}): Harness {
  const stylesReadyCalls: number[] = [];
  let fallback: (() => void) | null = null;
  const deps: PanelMountDeps = {
    isPanelVisible: () => true,
    isPanelMinimized: () => false,
    onStylesReady: () => stylesReadyCalls.push(stylesReadyCalls.length + 1),
    ...depOverrides,
  };
  const environment: PanelMountEnvironment = {
    document,
    resolveStyleUrl: (path) => `data:text/css,/* ${path} */`,
    // Captured instead of scheduled so tests control the fallback reveal without real timers.
    scheduleStylesReadyFallback: (reveal) => {
      fallback = reveal;
    },
  };
  return {
    mount: new PanelMount(deps, environment),
    stylesReadyCalls,
    fireFallback: () => fallback?.(),
  };
}

function mountedHost(): HTMLElement {
  const host = document.getElementById(ROOT_ID);
  assert.ok(host, 'expected the panel host to be in the document');
  return host;
}

function stylesheetLink(host: HTMLElement): HTMLLinkElement {
  const link = host.shadowRoot?.querySelector('link[rel="stylesheet"]');
  assert.ok(link instanceof HTMLLinkElement, 'expected the shadow root to hold the stylesheet link');
  return link;
}

test('mount() creates the scoped host under document.body with the shadow-rooted panel roots', () => {
  const { mount } = createHarness();
  try {
    mount.mount();

    const host = mountedHost();
    assert.equal(host.parentElement, document.body, 'the host must be scoped to document.body, not documentElement');
    assert.equal(document.querySelectorAll(`#${ROOT_ID}`).length, 1);

    const shadow = host.shadowRoot;
    assert.ok(shadow, 'the host must carry an open shadow root');
    assert.equal(shadow.children.length, 4, 'stylesheet link + root + recallRoot + toastRoot');
    stylesheetLink(host);

    assert.ok(mount.root instanceof HTMLElement);
    assert.equal(mount.root.tagName.toLowerCase(), 'aside');
    assert.equal(mount.root.getAttribute('role'), 'dialog');
    assert.equal(mount.root.style.visibility, 'hidden', 'the panel stays hidden until styles are ready');
    assert.equal(mount.panelStylesReady, false);
    assert.ok(mount.recallRoot instanceof HTMLElement);
    assert.ok(mount.toastRoot instanceof HTMLElement);

    const rootBeforeRemount = mount.root;
    mount.mount();
    assert.equal(mount.root, rootBeforeRemount, 'a second mount() must be a no-op');
    assert.equal(document.querySelectorAll(`#${ROOT_ID}`).length, 1, 'a second mount() must not duplicate the host');
  } finally {
    mount.teardown();
  }
});

test('the stylesheet load event reveals the panel and fires onStylesReady exactly once', async () => {
  const { mount, stylesReadyCalls, fireFallback } = createHarness();
  try {
    mount.mount();
    const readyPromise = mount.whenStylesReady();
    assert.ok(readyPromise, 'mount() must expose the styles-ready promise');

    stylesheetLink(mountedHost()).dispatchEvent(new Event('load'));

    await readyPromise;
    assert.equal(mount.panelStylesReady, true);
    assert.equal(mount.root?.style.visibility, '', 'the reveal must unhide the panel root');
    assert.deepEqual(stylesReadyCalls, [1]);

    // A late fallback reveal (or duplicate event) must not re-run the ready callback.
    fireFallback();
    assert.deepEqual(stylesReadyCalls, [1]);
  } finally {
    mount.teardown();
  }
});

test('the reveal skips onStylesReady while the panel is minimized but still unhides the root', () => {
  const { mount, stylesReadyCalls } = createHarness({ isPanelMinimized: () => true });
  try {
    mount.mount();

    stylesheetLink(mountedHost()).dispatchEvent(new Event('load'));

    assert.equal(mount.panelStylesReady, true);
    assert.equal(mount.root?.style.visibility, '');
    assert.deepEqual(stylesReadyCalls, [], 'a minimized panel must not trigger the position restore');
  } finally {
    mount.teardown();
  }
});

test('teardown() removes the host from the document and clears the mount state', () => {
  const { mount } = createHarness();
  mount.mount();
  mountedHost();

  mount.teardown();

  assert.equal(document.getElementById(ROOT_ID), null, 'the host must leave the document');
  assert.equal(mount.root, null);
  assert.equal(mount.recallRoot, null);
  assert.equal(mount.toastRoot, null);
  assert.equal(mount.panelStylesReady, false);
  assert.equal(mount.whenStylesReady(), null);
});

test('repeated mount/teardown cycles leak no hosts or shadow children', () => {
  const { mount } = createHarness();
  try {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      mount.mount();
      mount.teardown();
    }
    assert.equal(document.querySelectorAll(`#${ROOT_ID}`).length, 0, 'no host may survive its teardown');

    mount.mount();
    assert.equal(document.querySelectorAll(`#${ROOT_ID}`).length, 1);
    assert.equal(mountedHost().shadowRoot?.children.length, 4, 'remounting must rebuild exactly one set of roots');
  } finally {
    mount.teardown();
  }
});

test('disposeSubscriptions() invokes every registered unsubscribe handle once and is idempotent', () => {
  const { mount } = createHarness();
  const unsubscribed: string[] = [];
  mount.registerSubscriptions([() => unsubscribed.push('a'), () => unsubscribed.push('b')]);

  mount.disposeSubscriptions();
  mount.disposeSubscriptions();

  assert.deepEqual(unsubscribed, ['a', 'b']);
});
