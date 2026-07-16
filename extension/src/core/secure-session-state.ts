export type SecureSessionStatus =
  | {
      readonly unlocked: true;
      readonly keyReference: string;
      readonly hasKey: true;
      readonly reason?: undefined;
      readonly message?: undefined;
    }
  | {
      readonly unlocked: false;
      readonly keyReference: null;
      readonly hasKey: boolean;
      readonly reason?: 'manual' | 'timeout' | 'worker-restart' | undefined;
      readonly message?: string | undefined;
    };

export function secureSessionRequiresUnlock(status: Pick<SecureSessionStatus, 'unlocked' | 'hasKey'>): boolean {
  return status.hasKey && !status.unlocked;
}
