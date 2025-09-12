import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from '@mygame/shared';
import { getSocket } from '../lib/socket';
import type { BoardCategory } from '../state/store';

export type BoardProps = {
  roomId: string | null;
  board: BoardCategory[];
  canPick: boolean;
};

// Snapshot of board layout by roomId to persist across unmounts during a round
const boardSnapshotByRoom: Map<string, { cats: string[]; costs: number[] }> = new Map();

export function Board({ roomId, board, canPick }: BoardProps) {
  const roomKey = roomId || '__global__';
  const grid = useMemo(() => {
    const currentCats = board.map((c) => c.title);
    const valuesSet = new Set<number>();
    board.forEach((c) => c.values.forEach((v) => valuesSet.add(v)));
    const MAX_ROWS = 5;
    const computedCosts = Array.from(valuesSet).sort((a, b) => a - b).slice(0, MAX_ROWS);
    const snap = boardSnapshotByRoom.get(roomKey);
    const cats = snap?.cats?.length ? snap.cats : currentCats;
    const costs = snap?.costs?.length ? snap.costs : computedCosts;
    return { cats, costs };
  }, [board, roomKey]);

  // Capture or update snapshot: set once per room for a round;
  // reset if categories clearly change (new round with new titles)
  useEffect(() => {
    const currentCats = board.map((c) => c.title);
    const valuesSet = new Set<number>();
    board.forEach((c) => c.values.forEach((v) => valuesSet.add(v)));
    const MAX_ROWS = 5;
    const computedCosts = Array.from(valuesSet).sort((a, b) => a - b).slice(0, MAX_ROWS);
    const snap = boardSnapshotByRoom.get(roomKey);
    if (!snap) {
      if (currentCats.length || computedCosts.length) {
        boardSnapshotByRoom.set(roomKey, { cats: currentCats, costs: computedCosts });
      }
      return;
    }
    // If we detect new category titles not present in the snapshot, treat as a new board
    const snapSet = new Set(snap.cats);
    const hasNewTitle = currentCats.some((t) => !snapSet.has(t));
    if (hasNewTitle && (currentCats.length > 0 || computedCosts.length > 0)) {
      boardSnapshotByRoom.set(roomKey, { cats: currentCats, costs: computedCosts });
    }
  }, [board, roomKey]);

  const headerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const MAX_HEADER_H = 112;

  const [headerFontSizes, setHeaderFontSizes] = useState<number[]>([]);
  useEffect(() => {
    const fitAll = () => {
      const isWide = window.innerWidth >= 1024;
      const isMd = window.innerWidth >= 640;
      const MAX_FS = isWide ? 20 : isMd ? 18 : 16;
      const MIN_FS = 11;
      const next: number[] = new Array(grid.cats.length).fill(MIN_FS);
      headerRefs.current.forEach((el, i) => {
        if (!el) return;
        el.style.wordBreak = 'normal';
        el.style.overflowWrap = 'normal';
        let lo = MIN_FS;
        let hi = MAX_FS;
        let best = MIN_FS;
        for (let k = 0; k < 12; k++) {
          const mid = Math.floor((lo + hi) / 2);
          el.style.fontSize = `${mid}px`;
          const wOk = el.scrollWidth <= el.clientWidth + 1;
          const hOk = el.scrollHeight <= MAX_HEADER_H;
          if (wOk && hOk) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        next[i] = best;
      });
      setHeaderFontSizes(next);
    };
    const id = requestAnimationFrame(fitAll);
    window.addEventListener('resize', fitAll);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', fitAll);
    };
  }, [grid.cats]);

  useEffect(() => {
    const measure = () => {
      const heights = headerRefs.current.map((el) => el?.offsetHeight ?? 0);
      if (!heights.length) return;
      const max = Math.max(...heights);
      setHeaderHeight(Math.min(max, MAX_HEADER_H));
    };
    const id = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
    };
  }, [grid.cats, headerFontSizes]);

  const onPickCell = (category: string, value: number) => {
    if (!roomId || !canPick) return;
    const socket: Socket | null = getSocket();
    socket?.emit('board:pick', { roomId, category, value });
  };

  return (
    <div
      className="grid gap-2 sm:gap-3"
      style={{ gridTemplateColumns: `repeat(${grid.cats.length}, minmax(0, 1fr))` }}
    >
      {grid.cats.map((c, i) => (
        <div key={c} className="flex flex-col gap-2 sm:gap-3">
          <div
            ref={(el) => (headerRefs.current[i] = el)}
            className="rounded bg-indigo-900 text-white text-center font-semibold flex items-center justify-center px-2 py-2 overflow-hidden whitespace-normal break-normal leading-tight"
            style={{
              height: headerHeight || undefined,
              fontSize: headerFontSizes[i] ? `${headerFontSizes[i]}px` : undefined,
            }}
          >
            {c}
          </div>
          {grid.costs.map((cost) => {
            const cat = board.find((bc) => bc.title === c);
            const available = !!cat?.values.includes(cost);
            const isUsed = !available;
            const disabled = !canPick || isUsed;
            const cls = isUsed
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : canPick
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-300 text-gray-600 cursor-not-allowed';
            return (
              <button
                key={`${c}-${cost}`}
                className={`rounded py-3 sm:py-4 text-base sm:text-lg disabled:opacity-60 ${cls}`}
                disabled={disabled}
                onClick={() => onPickCell(c, cost)}
                title={canPick ? 'Выбрать вопрос' : 'Сейчас выбор недоступен'}
              >
                {cost}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
