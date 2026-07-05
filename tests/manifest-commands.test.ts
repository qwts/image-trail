import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

interface ExtensionCommandManifest {
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

function loadManifest(): ExtensionCommandManifest {
  return JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as ExtensionCommandManifest;
}

test('manifest exposes the build-info overlay toggle in Chromium keyboard shortcuts', () => {
  const command = loadManifest().commands?.['toggle-build-info-overlay'];

  assert.ok(command, 'build-info overlay toggle command should be registered');
  assert.equal(command.description, 'Toggle build info overlay');
  assert.deepEqual(command.suggested_key, {
    default: 'Alt+Shift+B',
    mac: 'Alt+Shift+B',
  });
});

test('manifest exposes panel stylesheet imports to content pages', () => {
  const resources = loadManifest().web_accessible_resources?.flatMap((entry) => entry.resources ?? []) ?? [];

  assert.ok(resources.includes('src/ui/styles/panel.css'), 'panel stylesheet should be web-accessible');
  assert.ok(resources.includes('src/ui/styles/fields.css'), 'imported parsed-fields stylesheet should be web-accessible');
});
