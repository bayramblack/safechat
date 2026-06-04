import { useEffect } from "react";
import { useIsMobile } from "./use-mobile";

const EDGE_THRESHOLD_PX = 28;
const HORIZONTAL_TRIGGER_PX = 80;
const MAX_VERTICAL_DRIFT_PX = 60;
const MAX_DURATION_MS = 600;

export function useSwipeBack(onBack: () => void, enabled = true) {
  const isMobile = useIsMobile();
  useEffect(() => {
    // Swipe-back is a mobile-only gesture; the desktop two-pane layout never
    // slides screens, so disable it there entirely.
    if (!enabled || !isMobile) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      if (t.clientX > EDGE_THRESHOLD_PX) {
        tracking = false;
        return;
      }
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const dt = Date.now() - startTime;
      if (dx >= HORIZONTAL_TRIGGER_PX && dy <= MAX_VERTICAL_DRIFT_PX && dt <= MAX_DURATION_MS) {
        onBack();
      }
    };

    const onTouchCancel = () => {
      tracking = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [onBack, enabled, isMobile]);
}
