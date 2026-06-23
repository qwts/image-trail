import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldDigitWidthInputDisplay, fieldDisplayValue } from '../extension/src/ui/components/fields-view.js';

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

test('fieldDigitWidthInputDisplay masks digit width in privacy mode', () => {
  const field = {
    id: 'q:0:0',
    location: 'query' as const,
    label: 'query page',
    value: '0007',
    tokenKind: 'int' as const,
    digitWidth: 4,
    queryIndex: 0,
    tokenIndex: 0,
  };

  assert.deepEqual(fieldDigitWidthInputDisplay(field, 5, false), { value: '5', placeholder: '4' });
  assert.deepEqual(fieldDigitWidthInputDisplay(field, 5, true), { value: '', placeholder: '' });
});
