import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultNumericFieldDisplayMode,
  fieldDigitWidthInputDisplay,
  fieldDisplayValue,
  fieldSplitLengthLabel,
  fieldReservesTrailControlSlot,
  numericFieldCommitValue,
  numericFieldInputDisplayValue,
} from '../extension/src/ui/components/fields-view.js';
import type { EditableField } from '../extension/src/ui/components/fields-view.js';
import type { UrlField } from '../extension/src/core/url/types.js';

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

test('fieldSplitLengthLabel describes the split target length without exposing it in privacy mode', () => {
  const field: EditableField = {
    field: {
      id: 'q:0:0',
      location: 'query',
      label: 'query sequence',
      value: '123456789012',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 0,
    },
    value: '123456789012',
  };

  assert.equal(fieldSplitLengthLabel(field, false), 'Length: 12 digits');
  assert.equal(fieldSplitLengthLabel(field, true), 'Length hidden');
});

test('numeric field display converts between decimal and hex with BigInt', () => {
  const decimalField: UrlField = {
    id: 'q:0:0',
    location: 'query',
    label: 'query id',
    value: '123456789012',
    tokenKind: 'int',
    queryIndex: 0,
    tokenIndex: 0,
  };
  const hexField: UrlField = {
    id: 'q:0:1',
    location: 'query',
    label: 'query color',
    value: '0x1cbe991a14',
    tokenKind: 'hex',
    queryIndex: 0,
    tokenIndex: 1,
  };

  assert.equal(defaultNumericFieldDisplayMode(decimalField), 'decimal');
  assert.equal(defaultNumericFieldDisplayMode(hexField), 'hex');
  assert.equal(numericFieldInputDisplayValue(decimalField, 'hex'), '0x1cbe991a14');
  assert.equal(numericFieldInputDisplayValue(hexField, 'decimal'), '123456789012');
});

test('numericFieldCommitValue converts alternate display edits back to the source representation', () => {
  const decimalField: UrlField = {
    id: 'q:0:0',
    location: 'query',
    label: 'query id',
    value: '123456789012',
    tokenKind: 'int',
    queryIndex: 0,
    tokenIndex: 0,
  };
  const hexField: UrlField = {
    id: 'q:0:1',
    location: 'query',
    label: 'query color',
    value: '0X0A',
    tokenKind: 'hex',
    queryIndex: 0,
    tokenIndex: 1,
  };

  assert.equal(numericFieldCommitValue(decimalField, 'hex', '0x1cbe991a15'), '123456789013');
  assert.equal(numericFieldCommitValue(hexField, 'decimal', '15'), '0X0F');
});

test('numericFieldCommitValue rejects invalid alternate-base input', () => {
  const decimalField: UrlField = {
    id: 'q:0:0',
    location: 'query',
    label: 'query id',
    value: '42',
    tokenKind: 'int',
    queryIndex: 0,
    tokenIndex: 0,
  };

  assert.equal(numericFieldCommitValue(decimalField, 'hex', 'not-hex'), null);
});

test('fieldDigitWidthInputDisplay shows auto when no natural width is available', () => {
  const field = {
    id: 'q:0:0',
    location: 'query' as const,
    label: 'query page',
    value: '7',
    tokenKind: 'int' as const,
    queryIndex: 0,
    tokenIndex: 0,
  };

  assert.deepEqual(fieldDigitWidthInputDisplay(field, undefined, false), { value: '', placeholder: 'auto' });
  assert.deepEqual(fieldDigitWidthInputDisplay(field, undefined, true), { value: '', placeholder: '' });
});

test('fieldReservesTrailControlSlot reserves space for numeric step fields', () => {
  assert.equal(
    fieldReservesTrailControlSlot({
      id: 'q:0:0',
      location: 'query',
      label: 'query page',
      value: '7',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 0,
    }),
    true,
  );
  assert.equal(
    fieldReservesTrailControlSlot({
      id: 'q:0:1',
      location: 'query',
      label: 'query hash',
      value: 'ff',
      tokenKind: 'hex',
      queryIndex: 0,
      tokenIndex: 1,
    }),
    true,
  );
  assert.equal(
    fieldReservesTrailControlSlot({
      id: 'p:0:0',
      location: 'path',
      label: 'path page',
      value: '7',
      tokenKind: 'int',
      partIndex: 0,
      tokenIndex: 0,
    }),
    true,
  );
  assert.equal(
    fieldReservesTrailControlSlot({
      id: 'q:0:2',
      location: 'query',
      label: 'query slug',
      value: 'page',
      tokenKind: 'text',
      queryIndex: 0,
      tokenIndex: 2,
    }),
    false,
  );
});
