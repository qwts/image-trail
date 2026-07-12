import type { PanelState } from '../core/types.js';
import { applyFieldSplitSpecs } from '../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../core/url/field-widths.js';
import { parseUrl } from '../core/url/parse-url.js';
import { findBestMatchingTemplate } from '../core/url/templates.js';
import { collectUrlFields, tokenValue } from '../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';
import type { EditableField } from './components/fields-view.js';

export interface ActiveUrlFields {
  readonly activeUrl: string;
  readonly fields: readonly UrlField[];
  readonly visibleFields: readonly UrlField[];
  readonly editableFields: readonly EditableField[];
  readonly activeTemplate: ReturnType<typeof findBestMatchingTemplate> | null;
}

export function activeUrlFieldsForState(state: PanelState, fallbackUrl: string): ActiveUrlFields {
  const editableUrl = state.draftUrl ?? state.target.selectedUrl;
  const activeUrl = editableUrl?.startsWith('data:') === true ? fallbackUrl : (editableUrl ?? fallbackUrl);
  const targetModel = parseActiveUrl(state, activeUrl);
  const fields = targetModel ? collectUrlFields(targetModel) : [];
  const activeTemplate = targetModel ? findBestMatchingTemplate(state.urlTemplates, targetModel) : null;
  const visibleFields =
    activeTemplate?.hideExcludedFields === true
      ? fields.filter((field) => activeTemplate.fields.some((templateField) => templateField.id === field.id))
      : fields;
  const editableFields = targetModel
    ? visibleFields.map((field) => ({
        field,
        value: fieldValueFor(targetModel, field),
      }))
    : [];
  return { activeUrl, fields, visibleFields, editableFields, activeTemplate };
}

function parseActiveUrl(state: PanelState, activeUrl: string): ParsedUrlModel | null {
  try {
    return applyFieldDigitWidthSpecs(applyFieldSplitSpecs(parseUrl(activeUrl), state.fieldSplitSpecs), state.fieldDigitWidthSpecs);
  } catch {
    return null;
  }
}

function fieldValueFor(model: ParsedUrlModel, field: UrlField): string {
  if (field.location === 'path' && field.partIndex !== undefined) {
    const part = model.pathParts[field.partIndex];
    if (!part || part.type !== 'segment') return '';
    const token = part.tokens[field.tokenIndex];
    return token ? tokenValue(token) : '';
  }

  if (field.location === 'query' && field.queryIndex !== undefined) {
    const queryField = model.queryFields[field.queryIndex];
    const token = queryField?.valueTokens[field.tokenIndex];
    return token ? tokenValue(token) : '';
  }

  return '';
}
