import { useEffect, useState } from 'react';

export interface ReorderableItem {
  id: string;
  sort_order: number;
}

/**
 * Shared drag-to-reorder state machine for Admin list tables (Tours,
 * Galería, Comentarios, Lugares de salida — anywhere `sort_order` decides
 * public presentation order). Native HTML5 drag events only — no DnD
 * library — since a handful of rows in a plain list doesn't need one.
 *
 * Normal mode: `reordering` is false, the table is a plain table.
 * Reorder mode (`start()`): rows become draggable; `order` reflects the
 * live drag position (top = 1st). `save(persist)` hands the caller the
 * final `{ id, sort_order }` pairs (1-based, top to bottom) to write;
 * `cancel()` discards the drag and restores the original order.
 */
export function useAdminReorder<T extends ReorderableItem>(items: T[]) {
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState<T[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!reordering) setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // `overrideItems` covers callers that need a fresh fetch before entering
  // reorder mode (e.g. a paginated list needs its *whole*, unpaginated set
  // to number 1..N correctly) — passing it here avoids the one-render lag
  // of setting `items` and calling `start()` in the same tick, which would
  // otherwise start from the stale `items` closure.
  //
  // Guarded with Array.isArray rather than trusting the caller: `onStart`
  // is easy to wire as `onClick={reorder.start}` (a natural-looking
  // shorthand), which silently passes the click's SyntheticEvent as
  // `overrideItems` instead of calling `start()` with no arguments —
  // corrupting `order` into a non-list. Failing safe to `items` here means
  // that mistake produces normal (if unintended) reorder-from-current-page
  // behavior instead of a broken screen.
  function start(overrideItems?: T[]) {
    setOrder(Array.isArray(overrideItems) ? overrideItems : items);
    setReordering(true);
  }

  function cancel() {
    setOrder(items);
    setDragId(null);
    setReordering(false);
  }

  function moveOver(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((current) => {
      const from = current.findIndex((item) => item.id === dragId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from === -1 || to === -1) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** Move a row by keyboard (Up/Down buttons) — same reordering, no drag needed. */
  function moveBy(id: string, delta: -1 | 1) {
    setOrder((current) => {
      const from = current.findIndex((item) => item.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function save(persist: (updates: Array<{ id: string; sort_order: number }>) => Promise<void>) {
    setSaving(true);
    try {
      await persist(order.map((item, index) => ({ id: item.id, sort_order: index + 1 })));
      setReordering(false);
    } finally {
      setSaving(false);
    }
  }

  /** Spread onto a `<tr>` to make it a drag source/target in reorder mode. */
  function dragHandlers(id: string) {
    return {
      draggable: true,
      onDragStart: () => setDragId(id),
      onDragOver: (event: { preventDefault: () => void }) => { event.preventDefault(); moveOver(id); },
      onDrop: (event: { preventDefault: () => void }) => event.preventDefault(),
      onDragEnd: () => setDragId(null),
    };
  }

  return { reordering, order, dragId, saving, start, cancel, setDragId, moveOver, moveBy, save, dragHandlers };
}
