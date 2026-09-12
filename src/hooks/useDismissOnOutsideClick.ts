import { useEffect, type RefObject } from 'react';

/** Closes an open panel on an outside pointer press or Escape. Shared by the navbar mobile menu and floating filter/menu panels. */
export function useDismissOnOutsideClick(
  active: boolean,
  refs: RefObject<HTMLElement>[],
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
