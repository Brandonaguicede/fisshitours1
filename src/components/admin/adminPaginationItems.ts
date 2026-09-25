export type AdminPaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

export const ADMIN_PAGE_SIZE_OPTIONS = [10, 25, 50];

export function getAdminPageCount(total: number, pageSize: number) {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampAdminPage(page: number, pages: number) {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, pages));
}

/**
 * Page buttons with ellipses, e.g. `1 2 3 4 5 … 10`, `1 … 4 5 6 … 10`, `1 … 6 7 8 9 10`.
 * The first and last page are always present, and an ellipsis only ever stands in for two or more pages,
 * so the row keeps the same number of slots (2 * siblings + 5) while paging.
 */
export function getAdminPaginationItems(page: number, pages: number, siblings = 1): AdminPaginationItem[] {
  const last = Math.max(1, Math.trunc(pages));
  const current = clampAdminPage(page, last);
  const edgeCount = 3 + 2 * siblings;
  if (last <= 2 * siblings + 5) return Array.from({ length: last }, (_, index) => index + 1);
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, last);
  const showStart = left > 3;
  const showEnd = right < last - 2;
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  if (!showStart) return [...range(1, edgeCount), 'ellipsis-end', last];
  if (!showEnd) return [1, 'ellipsis-start', ...range(last - edgeCount + 1, last)];
  return [1, 'ellipsis-start', ...range(left, right), 'ellipsis-end', last];
}
