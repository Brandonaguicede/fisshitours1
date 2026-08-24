import { Badge } from './Badge';

interface GalleryPaginationProps {
  currentPage: number;
  pageSize: number;
  total: number;
}

export function GalleryPagination({ currentPage, pageSize, total }: GalleryPaginationProps) {
  const reached = Math.min((currentPage + 1) * pageSize, total);
  return <Badge aria-live="polite" className="px-3 py-1 text-white/85" role="status">{reached} / {total}</Badge>;
}
