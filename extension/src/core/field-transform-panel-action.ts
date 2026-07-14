import type { FieldTransformId } from './url/field-transforms.js';

export type FieldTransformPanelAction =
  | {
      readonly name: 'field/transform';
      readonly fieldId: string;
      readonly transformId: Extract<FieldTransformId, 'set-value'>;
      readonly value: string;
    }
  | {
      readonly name: 'field/transform';
      readonly fieldId: string;
      readonly transformId: Extract<FieldTransformId, 'step'>;
      readonly delta: 1 | -1;
    }
  | {
      readonly name: 'field/transform';
      readonly fieldId: string;
      readonly transformId: Extract<FieldTransformId, 'digit-width'>;
      readonly value: string;
    }
  | {
      readonly name: 'field/transform';
      readonly fieldId: string;
      readonly transformId: Extract<FieldTransformId, 'split-apply'>;
      readonly pattern: string;
    }
  | { readonly name: 'field/transform'; readonly fieldId: string; readonly transformId: Extract<FieldTransformId, 'split-clear'> }
  | { readonly name: 'field/transform'; readonly fieldId: string; readonly transformId: Extract<FieldTransformId, 'reset-field'> }
  | { readonly name: 'field/transform'; readonly transformId: Extract<FieldTransformId, 'reset-structure'> }
  | { readonly name: 'field/transform'; readonly transformId: Extract<FieldTransformId, 'reset-all'> };
