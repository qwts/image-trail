import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ExtensionCommandManifest {
  readonly icons?: Record<string, string>;
  readonly action?: {
    readonly default_icon?: Record<string, string>;
  };
  readonly permissions?: readonly string[];
  readonly host_permissions?: readonly string[];
  readonly optional_host_permissions?: readonly string[];
  readonly content_scripts?: readonly unknown[];
  readonly commands?: Record<
    string,
    {
      readonly description?: string;
      readonly suggested_key?: {
        readonly default?: string;
        readonly mac?: string;
      };
    }
  >;
  readonly web_accessible_resources?: readonly {
    readonly resources?: readonly string[];
  }[];
}

test('manifest uses activeTab injection and optional per-origin host grants', () => {
  const manifest = loadManifest();

  assert.ok(manifest.permissions?.includes('activeTab'));
  assert.ok(manifest.permissions?.includes('scripting'));
  assert.deepEqual(manifest.host_permissions ?? [], []);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.deepEqual(manifest.content_scripts ?? [], []);
});

function loadManifest(): ExtensionCommandManifest {
  return JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as ExtensionCommandManifest;
}

test('manifest registers correctly sized PNG icons for the extension and browser action', () => {
  const manifest = loadManifest();
  const expectedIcons = {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  };

  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action?.default_icon, expectedIcons);

  for (const [declaredSize, iconPath] of Object.entries(expectedIcons)) {
    const expectedSize = Number(declaredSize);
    const icon = readFileSync(join('extension', iconPath));

    assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${iconPath} should be a PNG`);
    assert.equal(icon.readUInt32BE(16), expectedSize, `${iconPath} should have the declared width`);
    assert.equal(icon.readUInt32BE(20), expectedSize, `${iconPath} should have the declared height`);
  }
});

test('manifest exposes the build-info overlay toggle in Chromium keyboard shortcuts', () => {
  const command = loadManifest().commands?.['toggle-build-info-overlay'];

  assert.ok(command, 'build-info overlay toggle command should be registered');
  assert.equal(command.description, 'Toggle build info overlay');
  assert.deepEqual(command.suggested_key, {
    default: 'Alt+Shift+B',
    mac: 'Alt+Shift+B',
  });
});

test('manifest exposes the browser action in Chromium keyboard shortcuts', () => {
  const command = loadManifest().commands?.['_execute_action'];

  assert.ok(command, 'browser action command should be registered');
  assert.equal(command.description, 'Open or hide Image Trail panel');
  assert.equal(command.suggested_key, undefined);
});

test('manifest exposes assignable Image Trail action commands in Chromium keyboard shortcuts', () => {
  const commands = loadManifest().commands ?? {};
  const expected = {
    'shortcut-next': 'Next trail step',
    'shortcut-previous': 'Previous trail step',
    'shortcut-download': 'Download image',
    'shortcut-download-save-as': 'Download with Save As',
    'shortcut-slideshow-toggle': 'Slideshow',
    'shortcut-stop': 'Stop automation',
    'shortcut-grab-mode-toggle': 'Grab mode',
    'shortcut-retry': 'Retry navigation',
  };

  for (const [name, description] of Object.entries(expected)) {
    assert.equal(commands[name]?.description, description);
    assert.equal(commands[name]?.suggested_key, undefined);
  }
});

test('manifest exposes panel stylesheet imports to content pages', () => {
  const resources = loadManifest().web_accessible_resources?.flatMap((entry) => entry.resources ?? []) ?? [];

  assert.ok(resources.includes('src/ui/styles/panel.css'), 'panel stylesheet should be web-accessible');
  assert.ok(resources.includes('src/ui/styles/fields.css'), 'imported parsed-fields stylesheet should be web-accessible');
});
