import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldDisplayValue } from '../extension/src/ui/components/fields-view.js';

test('fieldDisplayValue shows decimal value for hex fields', () => {
  assert.equal(
    fieldDisplayValue({
      value: '0x1f',
      field: {
        id: 'q:0:0',
        location: 'query',
        label: 'query id',
        value: '0x1f',
        tokenKind: 'hex',
        queryIndex: 0,
        tokenIndex: 0,
      },
    }),
    '0x1f (31)',
  );

  assert.equal(
    fieldDisplayValue({
      value: 'ff',
      field: {
        id: 'q:0:0',
        location: 'query',
        label: 'query id',
        value: 'ff',
        tokenKind: 'hex',
        queryIndex: 0,
        tokenIndex: 0,
      },
    }),
    'ff (255)',
  );
});
