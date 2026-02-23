import { ReactNode, SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], .flatpickr-input';

type EditGuardProps = {
  onClickCapture: (event: SyntheticEvent<HTMLElement>) => void;
  onMouseDownCapture: (event: SyntheticEvent<HTMLElement>) => void;
  onFocusCapture: (event: SyntheticEvent<HTMLElement>) => void;
  onTouchStartCapture: (event: SyntheticEvent<HTMLElement>) => void;
};

type NoticePosition = {
  top: number;
  left: number;
};

const pointFromEvent = (event: SyntheticEvent<HTMLElement>): NoticePosition | null => {
  const native = event.nativeEvent as MouseEvent | TouchEvent | undefined;
  if (native && 'clientX' in native && typeof native.clientX === 'number' && typeof native.clientY === 'number') {
    return { left: native.clientX, top: native.clientY };
  }
  if (native && 'touches' in native && native.touches.length > 0) {
    return { left: native.touches[0].clientX, top: native.touches[0].clientY };
  }
  return null;
};

const clampToViewport = (point: NoticePosition): NoticePosition => {
  const gutter = 10;
  const halfWidth = 140;
  const halfHeight = 24;
  const maxLeft = Math.max(gutter + halfWidth, window.innerWidth - gutter - halfWidth);
  const maxTop = Math.max(gutter + halfHeight, window.innerHeight - gutter - halfHeight);
  return {
    left: Math.max(gutter + halfWidth, Math.min(point.left, maxLeft)),
    top: Math.max(gutter + halfHeight, Math.min(point.top, maxTop))
  };
};

export const useDetailPageLock = () => {
  const [locked, setLocked] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [noticePosition, setNoticePosition] = useState<NoticePosition | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const placeNoticeNear = useCallback((target: HTMLElement | null) => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setNoticePosition(clampToViewport({
      top: rect.top + rect.height / 2,
      left: rect.left + rect.width / 2
    }));
  }, []);

  const showLockedNotice = useCallback(
    (target?: HTMLElement | null) => {
      if (target) {
        placeNoticeNear(target);
      }
      setShowNotice(true);
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = window.setTimeout(() => {
        setShowNotice(false);
        noticeTimerRef.current = null;
      }, 2200);
    },
    [placeNoticeNear]
  );

  const showLockedNoticeAtEvent = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      const point = pointFromEvent(event);
      if (point) {
        setNoticePosition(clampToViewport(point));
        showLockedNotice();
        return;
      }
      const target = (event.currentTarget as HTMLElement | null) || (event.target as HTMLElement | null);
      showLockedNotice(target);
    },
    [showLockedNotice]
  );

  const blockWhenLocked = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      if (!locked) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest(EDITABLE_SELECTOR)) return;
      event.preventDefault();
      event.stopPropagation();
      if (target instanceof HTMLElement) {
        target.blur();
      }
      const point = pointFromEvent(event);
      if (point) {
        setNoticePosition(clampToViewport(point));
        showLockedNotice();
        return;
      }
      showLockedNotice(target);
    },
    [locked, showLockedNotice]
  );

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest(EDITABLE_SELECTOR)) {
      activeElement.blur();
    }
  }, [locked]);

  const editGuardProps = useMemo<EditGuardProps>(
    () => ({
      onClickCapture: blockWhenLocked,
      onMouseDownCapture: blockWhenLocked,
      onFocusCapture: blockWhenLocked,
      onTouchStartCapture: blockWhenLocked
    }),
    [blockWhenLocked]
  );

  return {
    locked,
    toggleLocked: () => setLocked((prev) => !prev),
    editGuardProps,
    showLockedNoticeAtEvent,
    lockNotice:
      showNotice && noticePosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="detail-lock-notice"
              role="status"
              aria-live="polite"
              style={{
                top: `${noticePosition.top}px`,
                left: `${noticePosition.left}px`,
                transform: 'translate(-50%, -50%)'
              }}
            >
              Unlock the page before making edits.
            </div>,
            document.body
          )
        : null
  };
};

type DetailPageLockTitleProps = {
  locked: boolean;
  onToggleLocked: () => void;
  children: ReactNode;
};

export const DetailPageLockTitle = ({ locked, onToggleLocked, children }: DetailPageLockTitleProps) => (
  <div className="detail-lock-title">
    <button
      type="button"
      className="detail-lock-toggle"
      onClick={onToggleLocked}
      aria-label={locked ? 'Unlock page editing' : 'Lock page editing'}
      aria-pressed={!locked}
      title={locked ? 'Unlock page editing' : 'Lock page editing'}
    >
      {locked ? '🔒' : '🔓'}
    </button>
    {children}
  </div>
);
