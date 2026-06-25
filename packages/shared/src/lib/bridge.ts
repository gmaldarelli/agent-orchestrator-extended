export interface DaemonStatus {
  running: boolean;
  port: number;
}

export interface PlatformBridge {
  // Daemon lifecycle
  getDaemonStatus: () => Promise<DaemonStatus>;
  startDaemon: () => Promise<void>;
  stopDaemon: () => Promise<void>;

  // API base URL resolution
  getApiBaseUrl: () => string;
  subscribeApiBaseUrl: (callback: (url: string) => void) => () => void;
}

let platformBridgeInstance: PlatformBridge | null = null;

export function setPlatformBridge(bridge: PlatformBridge): void {
  platformBridgeInstance = bridge;
}

export function getPlatformBridge(): PlatformBridge {
  if (!platformBridgeInstance) {
    throw new Error('PlatformBridge not initialized. Call setPlatformBridge() first.');
  }
  return platformBridgeInstance;
}
