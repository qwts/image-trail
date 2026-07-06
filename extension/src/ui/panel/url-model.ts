import { pruneInvalidFieldSplitSpecsFromState } from '../../core/actions.js';
import type { PanelState } from '../../core/types.js';
import { applyFieldSplitSpecs } from '../../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../../core/url/field-widths.js';
import { parseUrl } from '../../core/url/parse-url.js';
import type { ParsedUrlModel } from '../../core/url/types.js';

/** Parse a raw URL and apply the panel's field-split and digit-width specs, moved verbatim off `ImageTrailPanel`. */
export function urlModelFromRawUrl(url: string, state: PanelState): ParsedUrlModel {
  return applyFieldDigitWidthSpecs(applyFieldSplitSpecs(parseUrl(url), state.fieldSplitSpecs), state.fieldDigitWidthSpecs);
}

export function pruneInvalidFieldSplitSpecsForUrl(
  state: PanelState,
  url: string,
  options: { readonly preserveMessage?: boolean } = {},
): PanelState {
  if (state.fieldSplitSpecs.length === 0) return state;
  let model: ParsedUrlModel;
  try {
    model = parseUrl(url);
  } catch {
    return state;
  }
  const pruned = pruneInvalidFieldSplitSpecsFromState(state, model);
  if (pruned === state || options.preserveMessage !== true) return pruned;
  return { ...pruned, status: state.status, message: state.message, lastUpdatedAt: state.lastUpdatedAt };
}
