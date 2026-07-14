import { expect, test, type Page } from '@playwright/test';

import { recommendRailMode, type HostRisk } from '../support/workspace-rails-feasibility.js';

interface HostSnapshot {
  readonly htmlStyle: string | null;
  readonly bodyStyle: string | null;
  readonly appStyle: string | null;
  readonly appParent: string;
  readonly activeId: string;
  readonly scrollY: number;
}

async function hostSnapshot(page: Page): Promise<HostSnapshot> {
  return page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app');
    return {
      htmlStyle: document.documentElement.getAttribute('style'),
      bodyStyle: document.body.getAttribute('style'),
      appStyle: app?.getAttribute('style') ?? null,
      appParent: app?.parentElement?.tagName ?? '',
      activeId: document.activeElement?.id ?? '',
      scrollY: window.scrollY,
    };
  });
}

async function collectFixtureRisks(page: Page): Promise<HostRisk[]> {
  return page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('*')];
    const risks = new Set<string>();
    const hasViewportMedia = [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) => rule instanceof CSSMediaRule);
      } catch {
        return true;
      }
    });
    if (hasViewportMedia) risks.add('viewport-media-query');
    if (elements.some((element) => ['fixed', 'sticky'].includes(getComputedStyle(element).position))) risks.add('fixed-or-sticky');
    if (document.querySelector('[role="feed"], [data-infinite-feed]')) risks.add('infinite-feed');
    if (
      elements.some((element) => {
        const style = getComputedStyle(element);
        return (
          element !== document.body &&
          /(auto|scroll)/u.test(`${style.overflow}${style.overflowY}`) &&
          element.scrollHeight > element.clientHeight
        );
      })
    ) {
      risks.add('nested-scroll');
    }
    if (document.querySelector('iframe')) risks.add('iframe');
    if ([document.documentElement, document.body].some((element) => getComputedStyle(element).transform !== 'none')) {
      risks.add('transformed-root');
    }
    if (document.fullscreenElement || document.querySelector('[data-fullscreen-surface]')) risks.add('fullscreen');
    if (getComputedStyle(document.documentElement).direction === 'rtl') risks.add('rtl-physical-edge');
    if (document.querySelector('[data-spa-root]')) risks.add('spa-root-replacement');
    if (elements.some((element) => element.shadowRoot !== null)) risks.add('shadow-root');
    return [...risks].sort() as HostRisk[];
  });
}

test('overlay rails leave arbitrary host geometry, scroll, and focus untouched', async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.setContent(`
    <style>html { color-scheme: dark; } body { margin: 0; } #app { min-height: 2000px; }</style>
    <button id="focus">focus</button><main id="app" style="color: rgb(4, 5, 6)">host</main>
  `);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#focus')?.focus();
    window.scrollTo(0, 300);
  });
  const before = await hostSnapshot(page);

  const during = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app');
    const beforeRect = app?.getBoundingClientRect();
    const host = document.createElement('div');
    host.id = 'image-trail-spike-overlay';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>:host{all:initial;position:fixed;inset:0 auto 0 0;width:344px;pointer-events:none}</style><aside>rail</aside>';
    document.body.append(host);
    const afterRect = app?.getBoundingClientRect();
    const result = { beforeWidth: beforeRect?.width, afterWidth: afterRect?.width };
    host.remove();
    return result;
  });

  expect(during.afterWidth).toBe(during.beforeWidth);
  expect(await hostSnapshot(page)).toEqual(before);
});

test('root inset restores a static fixture but cannot trigger responsive rules or move fixed chrome', async ({ page }) => {
  await page.setViewportSize({ width: 1_024, height: 768 });
  await page.setContent(`
    <style>
      html { color-scheme: dark; }
      body { margin: 0; }
      #app { display: grid; min-height: 1400px; }
      #fixed { position: fixed; inset: 0 auto auto 0; width: 100px; height: 30px; }
      @media (min-width: 900px) { #app { grid-template-columns: 1fr 1fr; } }
    </style>
    <button id="focus">focus</button><header id="fixed">fixed</header><main id="app"><p>one</p><p>two</p></main>
  `);
  await page.evaluate(() => {
    document.documentElement.setAttribute('style', '--host-token: keep');
    document.querySelector<HTMLButtonElement>('#focus')?.focus();
    window.scrollTo(0, 240);
  });
  const before = await hostSnapshot(page);

  const evidence = await page.evaluate(() => {
    const root = document.documentElement;
    const originalStyle = root.getAttribute('style');
    const originalScrollY = window.scrollY;
    root.style.boxSizing = 'border-box';
    root.style.paddingLeft = '344px';
    const app = document.querySelector<HTMLElement>('#app');
    const fixed = document.querySelector<HTMLElement>('#fixed');
    const measured = {
      hostWidth: app?.getBoundingClientRect().width ?? 0,
      viewportRuleStillMatches: matchMedia('(min-width: 900px)').matches,
      columns: getComputedStyle(app!).gridTemplateColumns.split(' ').length,
      fixedLeft: fixed?.getBoundingClientRect().left ?? -1,
    };
    window.scrollTo(0, originalScrollY);
    if (originalStyle === null) {
      root.style.boxSizing = '';
      root.style.paddingLeft = '';
      root.removeAttribute('style');
    } else root.setAttribute('style', originalStyle);
    return measured;
  });

  expect(evidence.hostWidth).toBeLessThan(700);
  expect(evidence.viewportRuleStillMatches).toBe(true);
  expect(evidence.columns).toBe(2);
  expect(evidence.fixedLeft).toBe(0);
  expect(await hostSnapshot(page)).toEqual(before);
});

test('wrapper insertion breaks direct-child contracts and transforms do not change layout metrics', async ({ page }) => {
  await page.setViewportSize({ width: 1_024, height: 768 });
  await page.setContent(`
    <style>body { margin: 0; } body > #app { color: rgb(1, 2, 3); } #app { width: 100%; min-height: 300px; }</style>
    <main id="app">host root</main>
  `);

  const evidence = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app')!;
    const marker = document.createComment('image-trail-spike-marker');
    const wrapper = document.createElement('div');
    app.before(marker, wrapper);
    const directColor = getComputedStyle(app).color;
    wrapper.append(app);
    const wrappedColor = getComputedStyle(app).color;
    marker.before(app);
    marker.remove();
    wrapper.remove();
    const widthBefore = app.offsetWidth;
    app.style.transformOrigin = 'left top';
    app.style.transform = 'translateX(344px) scaleX(0.664)';
    const widthAfter = app.offsetWidth;
    const paintedWidth = app.getBoundingClientRect().width;
    app.removeAttribute('style');
    return { directColor, wrappedColor, widthBefore, widthAfter, paintedWidth };
  });

  expect(evidence.directColor).toBe('rgb(1, 2, 3)');
  expect(evidence.wrappedColor).not.toBe(evidence.directColor);
  expect(evidence.widthAfter).toBe(evidence.widthBefore);
  expect(evidence.paintedWidth).toBeLessThan(evidence.widthAfter);
});

test('the required complex-host matrix selects overlay fallback even when an adapter is requested', async ({ page }) => {
  const fixtures: readonly { readonly name: string; readonly html: string; readonly risk: HostRisk }[] = [
    {
      name: 'responsive',
      html: '<style>@media (min-width: 40rem){main{display:grid}}</style><main>responsive</main>',
      risk: 'viewport-media-query',
    },
    {
      name: 'fixed-sticky',
      html: '<header style="position:sticky;top:0">sticky</header><aside style="position:fixed">fixed</aside>',
      risk: 'fixed-or-sticky',
    },
    { name: 'infinite-feed', html: '<main role="feed"><article>one</article><article>two</article></main>', risk: 'infinite-feed' },
    {
      name: 'nested-scroll',
      html: '<main style="height:40px;overflow:auto"><div style="height:160px">scroll</div></main>',
      risk: 'nested-scroll',
    },
    { name: 'iframe', html: '<iframe srcdoc="<p>frame</p>"></iframe>', risk: 'iframe' },
    { name: 'transformed-root', html: '<style>html{transform:translateZ(0)}</style><main>root</main>', risk: 'transformed-root' },
    { name: 'fullscreen', html: '<main data-fullscreen-surface style="position:fixed;inset:0">full</main>', risk: 'fullscreen' },
    { name: 'rtl', html: '<main>rtl</main><script>document.documentElement.dir="rtl"</script>', risk: 'rtl-physical-edge' },
    { name: 'spa', html: '<main data-spa-root>route root</main>', risk: 'spa-root-replacement' },
    {
      name: 'shadow-custom-element',
      html: '<x-host></x-host><script>document.querySelector("x-host").attachShadow({mode:"open"}).innerHTML="<div>shadow</div>"</script>',
      risk: 'shadow-root',
    },
  ];

  for (const fixture of fixtures) {
    await test.step(fixture.name, async () => {
      await page.setContent(fixture.html);
      const risks = await collectFixtureRisks(page);
      expect(risks).toContain(fixture.risk);
      expect(recommendRailMode({ viewport: { width: 1_440, height: 900 }, edges: ['left'], risks, adapterApproved: true }).mode).toBe(
        'overlay',
      );
    });
  }
});
