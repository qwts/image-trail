export interface UndoCommand<TAction> {
  readonly label: string;
  readonly action: TAction;
}

export class UndoStack<TAction> {
  private readonly commands: UndoCommand<TAction>[] = [];

  constructor(private readonly limit = 10) {}

  push(command: UndoCommand<TAction>): void {
    this.commands.unshift(command);
    this.commands.length = Math.min(this.commands.length, this.limit);
  }

  pop(): UndoCommand<TAction> | undefined {
    return this.commands.shift();
  }

  get size(): number {
    return this.commands.length;
  }
}
