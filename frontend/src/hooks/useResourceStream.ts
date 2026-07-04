import { useEffect, useRef } from 'react';
import { buildApiUrl } from '../api/client';

type UseResourceStreamOptions = {
  path?: string | null;
  event?: string;
  debounceMs?: number;
  onMessage: () => void;
};

export const useResourceStream = ({
  path,
  event = 'resource.updated',
  debounceMs = 300,
  onMessage
}: UseResourceStreamOptions) => {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!path || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(buildApiUrl(path), { withCredentials: true });
    let timerId: number | null = null;

    const scheduleRefresh = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        timerId = null;
        onMessageRef.current();
      }, debounceMs);
    };

    source.addEventListener(event, scheduleRefresh as EventListener);

    return () => {
      source.removeEventListener(event, scheduleRefresh as EventListener);
      source.close();
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [debounceMs, event, path]);
};
