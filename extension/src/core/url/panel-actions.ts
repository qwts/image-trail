import type { UrlTemplateGrabStrategy } from './grab-strategies.js';
import type { UrlSteppingPresetId } from './stepping-presets.js';
import type { GrabSourcePattern, UrlTemplateMatchMode, UrlTemplateRecord } from './templates.js';

export type UrlTemplatePanelAction =
  | {
      readonly name: 'url-templates/load';
      readonly templates: readonly UrlTemplateRecord[];
      readonly identityKey: string | null;
      readonly activeTemplateId?: string | null;
    }
  | { readonly name: 'url-template/save-step-preset'; readonly presetId: UrlSteppingPresetId }
  | { readonly name: 'url-template/remove'; readonly id: string }
  | {
      readonly name: 'url-template/update-settings';
      readonly id: string;
      readonly matchMode?: UrlTemplateMatchMode;
      readonly hideExcludedFields?: boolean;
      readonly autoApplyEnabled?: boolean;
      readonly grabStrategy?: UrlTemplateGrabStrategy | null;
    }
  | { readonly name: 'url-template/update-fields'; readonly id: string; readonly includedFieldIds: readonly string[] }
  | { readonly name: 'grab-source-patterns/load'; readonly patterns: readonly GrabSourcePattern[] }
  | { readonly name: 'grab-source-pattern/remove'; readonly id: string }
  | {
      readonly name: 'grab-source-pattern/update-settings';
      readonly id: string;
      readonly matchMode?: UrlTemplateMatchMode;
      readonly grabStrategy?: UrlTemplateGrabStrategy | null;
    };
