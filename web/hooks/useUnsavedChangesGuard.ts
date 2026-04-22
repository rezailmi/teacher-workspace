import { useEffect } from 'react';

/**
 * Registers a `beforeunload` listener while `isDirty` is true.
 * The browser shows its default "Leave site?" prompt — copy is not customizable.
 *
 * Does NOT guard in-app React Router navigation (that needs `useBlocker`
 * from react-router-dom v7; tracked as a follow-up).
 */
export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Legacy browsers need returnValue set to anything truthy.
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}
