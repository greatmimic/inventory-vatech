import { useEffect } from 'react';

// Number inputs otherwise change value on scroll, which silently corrupts quantities.
export function useNoWheel() {
  useEffect(() => {
    const onWheel = (e) => {
      if (document.activeElement?.type === 'number') e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);
}
