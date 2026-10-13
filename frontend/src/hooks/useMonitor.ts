// Shared logic of the Social and App Store pages: list + tab counts, selected detection, review actions with optimistic updates
// (rollback on failure), excluded / false-positive panels, source status, scan.
import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { sm } from '../api/sm';
import type { Category, DetectionDetail, DetectionList, DetectionRow, DetectionStatus } from '../api/types';
import { useApi } from './useApi';
import { refreshBrand } from './useBrand';
import { useScan } from './useScan';

export type ReviewAction = 'confirmed' | 'reviewing' | 'dismissed';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function useMonitor(category: Category) {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<string>(
    // The design opens App Store Monitoring on Google Play; a deep link (?detection=) keeps "all" so any store's detection is listed.
    category === 'apps' && !params.get('detection') ? 'google_play' : 'all'
  ); // 'all' | detection type (social) | platform slug (apps)
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const n = Number(params.get('detection'));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const filterKey = category === 'social' ? 'type' : 'platform';
  const list = useApi(
    (signal) => sm.detections({ category, [filterKey]: filter === 'all' ? undefined : filter }, signal),
    [category, filter]
  );
  const sources = useApi((signal) => sm.sourcesByKind(category === 'social' ? 'social' : 'store', signal), [category]);
  const excluded = useApi((signal) => sm.excluded(category, signal), [category]);
  const guard = useApi((signal) => sm.falsePositives(category, signal), [category]);

  const items = list.data?.items ?? [];
  // Selected = the one asked for (deep link or click) if it is listed, else the first row (highest risk).
  const selectedRow = items.find((d) => d.id === selectedId) ?? items[0] ?? null;
  const activeId = selectedRow?.id ?? selectedId;

  const detail = useApi((signal) => sm.detection(activeId as number, signal), [activeId], activeId !== null && !!selectedRow);

  // Keep the deep link in the URL in sync once the person picks something else.
  const select = (id: number) => {
    setActionError(null);
    setSelectedId(id);
    if (params.get('detection')) {
      const next = new URLSearchParams(params);
      next.delete('detection');
      setParams(next, { replace: true });
    }
  };

  const reloadAll = useCallback(() => {
    list.reload();
    sources.reload();
    excluded.reload();
    guard.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.reload, sources.reload, excluded.reload, guard.reload]);

  const scan = useScan(category === 'social' ? 'social' : 'apps', () => {
    reloadAll();
    detail.reload();
    void refreshBrand();
  });

  // Counts are those the server computed for the current filters; an optimistic action keeps them (status is not a tab).
  const detailRef = useRef(detail);
  detailRef.current = detail;

  /** confirm / keep reviewing / dismiss: update the row and the detail at once, roll both back if the server refuses. */
  const review = async (id: number, status: ReviewAction) => {
    const prevList = list.data;
    const prevDetail = detailRef.current.data;
    setActionError(null);
    setBusyId(id);
    list.setData((d) => (d ? { ...d, items: d.items.map((r) => (r.id === id ? { ...r, status: status as DetectionStatus } : r)) } : d));
    detailRef.current.setData((d) => (d && d.id === id ? { ...d, status: status as DetectionStatus } : d));
    try {
      const updated = await sm.setStatus(id, status);
      detailRef.current.setData((d) => (d && d.id === id ? { ...d, ...updated } : d));
    } catch (e) {
      list.setData(prevList);
      detailRef.current.setData(prevDetail);
      setActionError(errText(e, 'Could not update the detection. Nothing was changed.'));
    } finally {
      setBusyId(null);
    }
  };

  /** Mark as official: the row leaves the list at once (it becomes an allowlist entry); restored if the server refuses. */
  const markOfficial = async (id: number) => {
    const prevList = list.data;
    const prevDetail = detailRef.current.data;
    const prevSelected = selectedId;
    setActionError(null);
    setBusyId(id);
    list.setData((d) =>
      d
        ? {
            ...d,
            total: Math.max(0, d.total - 1),
            counts: { ...d.counts, all: Math.max(0, d.counts.all - 1) },
            items: d.items.filter((r) => r.id !== id),
          }
        : d
    );
    setSelectedId(null);
    try {
      await sm.markOfficial(id);
      excluded.reload();
      guard.reload();
      list.reload(); // tab counts change too
      void refreshBrand(); // "N official assets" in the sidebar
    } catch (e) {
      list.setData(prevList);
      detailRef.current.setData(prevDetail);
      setSelectedId(prevSelected);
      setActionError(errText(e, 'Could not mark it as official. Nothing was changed.'));
    } finally {
      setBusyId(null);
    }
  };

  return {
    list: list as ReturnType<typeof useApi<DetectionList>>,
    items: items as DetectionRow[],
    filter,
    setFilter,
    selectedRow,
    select,
    detail: detail as ReturnType<typeof useApi<DetectionDetail>>,
    sources,
    excluded,
    guard,
    scan,
    review,
    markOfficial,
    actionError,
    clearActionError: () => setActionError(null),
    busyId,
    reloadAll,
  };
}
