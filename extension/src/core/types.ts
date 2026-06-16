export type PanelStatus = 'idle' | 'ready' | 'closed' | 'unsupported' | 'error';

export interface PanelState {
  readonly visible: boolean;
  readonly status: PanelStatus;
  readonly message: string;
  readonly lastUpdatedAt: number;
}

export type PanelActionName = 'toggle-panel' | 'close-panel' | 'ping-status';

export interface PanelAction {
  readonly name: PanelActionName;
}
