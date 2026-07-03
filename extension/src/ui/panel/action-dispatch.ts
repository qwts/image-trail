import type { PanelAction } from '../../core/types.js';

/**
 * Distributive per-name narrowing over the `PanelAction` union. `Extract<PanelAction, { name: N }>`
 * yields `never` for payload-less names because the union's catch-all first member carries a wide
 * `Exclude<PanelActionName, …>` name; intersecting each distributed member with `{ name: N }`
 * instead keeps the catch-all member (its name collapses to `N`) and still narrows multi-name
 * payload members (e.g. the shared `{ name: 'history/remove' | …; id }` member) to the one name.
 */
type NarrowByName<A, N extends string> = A extends { readonly name: infer AN extends string }
  ? N extends AN
    ? A & { readonly name: N }
    : never
  : never;

/** The action shape a handler registered under name `N` receives. */
export type PanelActionFor<N extends PanelAction['name']> = NarrowByName<PanelAction, N>;

/**
 * A single dispatched-action definition. One `ActionDef` per registered action name replaces one
 * `if (action.name === '…')` guard of the former ~520-line `ImageTrailPanel.dispatch` chain.
 *
 * `handle` is declared with METHOD syntax on purpose (same trick as `MessageDef` in
 * `background/message-dispatch.ts`): method parameters are checked bivariantly, so a narrowly-typed
 * entry (e.g. `ActionDef<PanelActionFor<'target/fill-screen'>>`) stays assignable to the erased
 * `AnyActionDef` used by the registry `satisfies` check and by {@link dispatchPanelAction}.
 * Rewriting it as an arrow property would make the parameter contravariant under
 * `strictFunctionTypes` and break both. Keep it a method.
 *
 * There is no schema member, unlike `MessageDef`: panel actions are constructed inside the
 * extension's own UI code, never parsed from wire input, so there is nothing to validate.
 */
export interface ActionDef<A extends PanelAction> {
  handle(action: A): void;
}

/** Identity helper mirroring `defineMessage`; captures each entry's `A` for precise inference. */
export function defineAction<A extends PanelAction>(def: ActionDef<A>): ActionDef<A> {
  return def;
}

export type AnyActionDef = ActionDef<PanelAction>;

/**
 * Entry table for one group of action names. Return-annotating a group builder with
 * `ActionEntries<GroupActionName>` gives every object-literal `handle(action)` its narrowed
 * parameter type contextually and enforces per-group totality plus excess-key rejection.
 */
export type ActionEntries<N extends PanelAction['name']> = {
  readonly [K in N]: ActionDef<PanelActionFor<K>>;
};

/**
 * Generic replacement for the former `if (action.name === '…')` dispatcher chain: look the action
 * up in the registry and run its handler, or hand the action to `fallback` when no entry is
 * registered — exactly the chain's old fall-through tail behavior.
 */
export function dispatchPanelAction(
  registry: Partial<Record<PanelAction['name'], AnyActionDef>>,
  action: PanelAction,
  fallback: (action: PanelAction) => void,
): void {
  const entry = registry[action.name];
  if (!entry) {
    fallback(action);
    return;
  }
  entry.handle(action);
}
