// packages/shared/src/hooks/useDaemonStatus.ts
import { useEffect, useState } from 'react';
import { getPlatformBridge, DaemonStatus } from '../lib/bridge';

export function useDaemonStatus() {
  const [status, setStatus] = useState<DaemonStatus>({ running: false, port: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const bridge = getPlatformBridge();
        const currentStatus = await bridge.getDaemonStatus();
        if (mounted) {
          setStatus(currentStatus);
          setLoading(false);
        }
      } catch (error) {
        if (mounted) {
          setStatus({ running: false, port: 0 });
          setLoading(false);
        }
      }
    };

    checkStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return { status, loading };
}
