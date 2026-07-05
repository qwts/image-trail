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
