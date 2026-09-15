import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export interface AdminPageResult<T> { rows: T[]; total: number }

export function useAdminPagedList<T>(name: string, filters: string, fetchPage: (page: number, size: number) => Promise<AdminPageResult<T>>) {
  const [state, setState] = useState({ filters, page: 1, size: 10 });
  useEffect(() => {
    setState((current) => current.filters === filters ? current : { ...current, filters, page: 1 });
  }, [filters]);
  // Derive the reset synchronously so a new filter never requests an old page.
  const page = state.filters === filters ? state.page : 1;
  const pageSize = state.size;
  const query = useQuery({
    queryKey: ['admin', name, filters, page, pageSize],
    queryFn: () => fetchPage(page, pageSize),
    placeholderData: keepPreviousData,
    retry: false,
    refetchInterval: 30_000,
  });
  const lastResult = useRef<{ filters: string; data: AdminPageResult<T> }>();
  if (query.data && !query.isPlaceholderData) lastResult.current = { filters, data: query.data };
  const data = query.data ?? (lastResult.current?.filters === filters ? lastResult.current.data : undefined);
  const total = data?.total ?? 0;
  useEffect(() => {
    if (!query.isFetching && !query.isError && query.data) {
      const lastPage = Math.max(1, Math.ceil(total / pageSize));
      if (page > lastPage) setState({ filters, page: lastPage, size: pageSize });
    }
  }, [filters, page, pageSize, total, query.data, query.isFetching, query.isError]);
  return {
    query,
    rows: data?.rows ?? [],
    total,
    page,
    pageSize,
    onPageChange: (next: number) => setState({ filters, page: next, size: pageSize }),
    onPageSizeChange: (size: number) => setState({ filters, page: 1, size }),
  };
}
