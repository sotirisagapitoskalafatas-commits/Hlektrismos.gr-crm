/* Blink scheduling — random intervals, fast close-open, forced triggers. */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useJarvisBlink() {
  const [blink, setBlink] = useState(false);
  const lock = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const doBlink = useCallback(() => {
    if (lock.current) return;
    lock.current = true;
    setBlink(true);
    timer.current = window.setTimeout(() => {
      setBlink(false);
      lock.current = false;
    }, 150);
  }, []);

  useEffect(() => {
    const schedule = () => {
      const delay = 2200 + Math.random() * 4000;
      timer.current = window.setTimeout(() => {
        doBlink();
        schedule();
      }, delay);
    };
    schedule();
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [doBlink]);

  return { blink, doBlink };
}