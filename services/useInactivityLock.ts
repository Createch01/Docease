import { useEffect, useRef } from 'react';
import { securityService } from './securityService';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
const TOUCH_EVERY_MS = 15_000;

// Verrouille après `minutes` minutes sans activité. Rust applique le même délai
// (access::gate ferme la session inactive) : ce hook signale l'activité réelle avec
// `session_touch` et affiche l'écran de verrouillage dès que le délai est écoulé ou
// que Rust a déjà fermé la session. `minutes` = 0 : désactivé (aussi en développement).
export function useInactivityLock(active: boolean, minutes: number, onLock: () => void) {
  const lockRef = useRef(onLock);
  lockRef.current = onLock;

  useEffect(() => {
    if (!active || minutes <= 0) return;
    let last = Date.now();
    let lastSent = 0;

    const bump = () => {
      last = Date.now();
      if (last - lastSent > TOUCH_EVERY_MS) {
        lastSent = last;
        void securityService.touch();
      }
    };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, bump, { passive: true }));

    const idleTimer = setInterval(() => {
      if (Date.now() - last > minutes * 60_000) lockRef.current();
    }, 5_000);
    // Session déjà fermée côté Rust (ex. application restée ouverte en veille).
    const sessionTimer = setInterval(async () => {
      try { if (!(await securityService.currentSession())) lockRef.current(); } catch { lockRef.current(); }
    }, 30_000);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, bump));
      clearInterval(idleTimer);
      clearInterval(sessionTimer);
    };
  }, [active, minutes]);
}
