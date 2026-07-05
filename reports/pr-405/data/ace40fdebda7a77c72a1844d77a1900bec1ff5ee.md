# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: url-editor-parsed-fields.spec.ts >> URL review status export/import round trips without image-record side effects
- Location: tests/e2e/url-editor-parsed-fields.spec.ts:279:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.image-trail-panel__bookmark-item')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('.image-trail-panel__bookmark-item')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Test source

```ts
  208 | 
  209 |   const recentCountBeforeFailure = await page.locator('.image-trail-panel__history-item').count();
  210 |   await page.getByLabel(/Edit .*frame/u).fill('404');
  211 |   await page.getByLabel(/Edit .*frame/u).press('Enter');
  212 |   await expect(panelStatus(page)).toHaveClass(/is-error/u);
  213 |   await expectPanelStatusMessage(page, /HTTP 404/u);
  214 |   await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(recentCountBeforeFailure);
  215 | 
  216 |   await page.getByLabel(/Edit .*frame/u).fill('2');
  217 |   await page.getByLabel(/Edit .*frame/u).press('Enter');
  218 |   await expectPanelStatusMessage(page, /Image loaded but did not change\.|Loaded .*dynamic-image\.svg\?frame=2/u);
  219 |   await ensureQueryFrameIncluded(page);
  220 | 
  221 |   await openManualControls(page);
  222 |   await page.getByRole('button', { name: '◀ Prev' }).click();
  223 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=1/u);
  224 |   await expectFrame(page, '1');
  225 |   await page.getByRole('button', { name: 'Next ▶' }).click();
  226 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=2/u);
  227 |   await expectFrame(page, '2');
  228 | 
  229 |   await openUrlLearning(page);
  230 |   await expect(page.locator('.image-trail-panel__settings-template-url')).toContainText('/dynamic-image.svg?frame={query-frame}');
  231 | 
  232 |   await page.getByRole('button', { name: 'Close panel' }).click();
  233 |   await expectPanelClosed(page);
  234 |   await togglePanelFromExtensionAction(page, serviceWorker);
  235 |   await expectPanelOpen(page);
  236 |   await openUrlLearning(page);
  237 |   await expect(page.locator('.image-trail-panel__settings-template-url')).toContainText('/dynamic-image.svg?frame={query-frame}');
  238 |   await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=2'));
  239 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=2/u);
  240 |   await closeSettingsIfOpen(page);
  241 |   await openParsedFields(page);
  242 |   await expect(page.getByLabel(/Edit .*frame/u)).toHaveValue('2');
  243 | });
  244 | 
  245 | test('Prev/Next steps every included field together into one combined URL', async ({ page, serviceWorker }) => {
  246 |   // #263: prev/next (and arrows) are the automation tier — one press applies the same ±1 step to
  247 |   // ALL included fields at once, the same result as clicking each field's +/- individually.
  248 |   await installMultiParamImageRoute(page);
  249 |   await openPanel(page, serviceWorker);
  250 |   await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  251 |   await closeSettingsIfOpen(page);
  252 | 
  253 |   await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?set=3&frame=7'));
  254 |   await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?set=3&frame=7/u);
  255 | 
  256 |   // Discovery phase: step each field once with its "+" — a successful stepped load is what makes a
  257 |   // field lockable (the Include control only renders for successful fields).
  258 |   await openParsedFields(page);
  259 |   await page.getByRole('button', { name: /Increment .*set/u }).click();
  260 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=4&frame=7/u);
  261 |   await page.getByRole('button', { name: /Increment .*frame/u }).click();
  262 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=4&frame=8/u);
  263 | 
  264 |   // Lock both fields into the trail.
  265 |   await ensureQueryFieldIncluded(page, 'set');
  266 |   await ensureQueryFieldIncluded(page, 'frame');
  267 | 
  268 |   // One press steps BOTH included fields together in a single combined URL.
  269 |   await openManualControls(page);
  270 |   await page.getByRole('button', { name: '◀ Prev' }).click();
  271 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=3&frame=7/u);
  272 |   await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl('/dynamic-image.svg?set=3&frame=7'));
  273 | 
  274 |   await page.getByRole('button', { name: 'Next ▶' }).click();
  275 |   await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=4&frame=8/u);
  276 |   await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl('/dynamic-image.svg?set=4&frame=8'));
  277 | });
  278 | 
  279 | test('URL review status export/import round trips without image-record side effects', async ({ page, serviceWorker }) => {
  280 |   await installDynamicImageRoute(page, ['404']);
  281 |   await openPanel(page, serviceWorker);
  282 |   await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  283 |   await clearAllUrlReviewStatus(page);
  284 |   await closeSettingsIfOpen(page);
  285 | 
  286 |   await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=1'));
  287 |   await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=1/u);
  288 |   await openParsedFields(page);
  289 |   await page.getByRole('button', { name: /Increment .*frame/u }).click();
  290 |   await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=2/u);
  291 |   await page.getByLabel(/Edit .*frame/u).fill('404');
  292 |   await page.getByLabel(/Edit .*frame/u).press('Enter');
  293 |   await expectPanelStatusMessage(page, /HTTP 404/u);
  294 | 
  295 |   const recentCountBeforeExport = await page.locator('.image-trail-panel__history-item').count();
  296 |   const { download, fileContent, records: exportedRecords } = await exportUrlReviewStatus(page);
  297 |   expect(download.suggestedFilename()).toMatch(/^image-trail-url-review-status-\d{4}-\d{2}-\d{2}\.json$/u);
  298 |   expect(exportedRecords.map((record) => record.status)).toEqual(['failed', 'passed']);
  299 |   expect(exportedRecords.map((record) => record.sourceUrl).sort()).toEqual([
  300 |     fixtureUrl('/dynamic-image.svg?frame=2'),
  301 |     fixtureUrl('/dynamic-image.svg?frame=404'),
  302 |   ]);
  303 |   await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(recentCountBeforeExport);
  304 | 
  305 |   await clearAllUrlReviewStatus(page);
  306 |   await deleteVisibleRecents(page);
  307 |   await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
> 308 |   await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
      |                                                                   ^ Error: expect(locator).toHaveCount(expected) failed
  309 |   await expect(page.locator('.image-trail-panel__recall-drawer')).toHaveCount(0);
  310 |   const storageUsage = page.locator('.image-trail-panel__storage-usage');
  311 |   const storageUsageBeforeImport = (await storageUsage.count()) > 0 ? await storageUsage.textContent() : null;
  312 | 
  313 |   await importUrlReviewStatus(page, fileContent);
  314 | 
  315 |   await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
  316 |   await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
  317 |   await expect(page.locator('.image-trail-panel__recall-drawer')).toHaveCount(0);
  318 |   if (storageUsageBeforeImport === null) {
  319 |     await expect(page.locator('.image-trail-panel__storage-usage')).toHaveCount(0);
  320 |   } else {
  321 |     await expect(page.locator('.image-trail-panel__storage-usage')).toHaveText(storageUsageBeforeImport);
  322 |   }
  323 | 
  324 |   await openImportExport(page);
  325 |   const [roundTripDownload] = await Promise.all([
  326 |     page.waitForEvent('download'),
  327 |     page.getByRole('button', { name: 'Export URL review status' }).click(),
  328 |   ]);
  329 |   expect(roundTripDownload.suggestedFilename()).toMatch(/^image-trail-url-review-status-\d{4}-\d{2}-\d{2}\.json$/u);
  330 |   const roundTripPath = await roundTripDownload.path();
  331 |   expect(roundTripPath).not.toBeNull();
  332 |   const roundTripContent = await readFile(roundTripPath!, 'utf8');
  333 |   const roundTripped = JSON.parse(roundTripContent) as { readonly records: readonly UrlReviewStatusRecord[] };
  334 |   expect(normalizeUrlReviewRecords(roundTripped.records)).toEqual(exportedRecords);
  335 | });
  336 | 
```