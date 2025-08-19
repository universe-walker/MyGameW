import { useEffect, useMemo, useRef, useState } from 'react';

// Simple in-app log console. Captures console.* calls and displays them.
// Enabled only when the component is rendered (controlled by parent via env flag).

type Level = 'log' | 'info' | 'warn' | 'error' | 'debug';
interface Entry {
  id: number;
  level: Level;
  time: string;
  message: string;
}

function formatArg(arg: unknown): string {
  try {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
    return JSON.stringify(arg, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v), 2);
  } catch {
    try {
      return String(arg);
    } catch {
      return '[Unserializable]';
    }
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(formatArg).join(' ');
}

export default function DebugConsole() {
  const idRef = useRef(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [visible, setVisible] = useState(true);
  const [maxItems] = useState(200);
  const listRef = useRef<HTMLDivElement | null>(null);

  const originals = useRef<{ [K in Level]?: (...args: any[]) => void }>({});

  const push = (level: Level, ...args: unknown[]) => {
    const ts = new Date();
    const time = ts.toLocaleTimeString();
    const message = formatArgs(args);
    setEntries((prev) => {
      const next: Entry[] = [...prev, { id: idRef.current++, level, time, message }];
      if (next.length > maxItems) next.splice(0, next.length - maxItems);
      return next;
    });
  };

  // Patch console methods
  useEffect(() => {
    const levels: Level[] = ['log', 'info', 'warn', 'error', 'debug'];
    levels.forEach((lvl) => {
      const orig = console[lvl] as any;
      originals.current[lvl] = orig;
      (console as any)[lvl] = (...args: unknown[]) => {
        try { push(lvl, ...args); } catch {}
        try { orig?.apply(console, args as any); } catch {}
      };
    });

    // Capture global errors
    const onError = (event: ErrorEvent) => {
      push('error', 'window.onerror:', event.message, event.filename, event.lineno, event.colno, event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      push('error', 'unhandledrejection:', event.reason);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    // Expose manual hook
    (window as any).__MYGAME_DEBUG_LOG__ = (...args: unknown[]) => push('log', ...args);

    return () => {
      // Restore console
      levels.forEach((lvl) => {
        const orig = originals.current[lvl];
        if (orig) (console as any)[lvl] = orig;
      });
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // Auto-scroll on new entries
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const levelColor = useMemo(
    () => ({
      log: 'text-gray-800',
      info: 'text-blue-700',
      warn: 'text-yellow-700',
      error: 'text-red-700',
      debug: 'text-purple-700',
    } as Record<Level, string>),
    [],
  );

  if (!visible) {
    return (
      <button
        className="fixed bottom-4 right-4 z-50 px-3 py-2 rounded bg-gray-800 text-white text-sm shadow"
        onClick={() => setVisible(true)}
      >
        🐞 Logs
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(90vw,520px)] h-[320px] bg-white border border-gray-300 rounded shadow-lg flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t">
        <div className="font-semibold text-sm">Debug Logs</div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300"
            onClick={() => setEntries([])}
            title="Очистить"
          >
            Clear
          </button>
          <button
            className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300"
            onClick={() => setVisible(false)}
            title="Свернуть"
          >
            Close
          </button>
        </div>
      </div>
      <div ref={listRef} className="px-3 py-2 text-xs font-mono overflow-auto whitespace-pre-wrap break-words grow">
        {entries.length === 0 ? (
          <div className="text-gray-400">Нет логов</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="mb-1">
              <span className="text-gray-400">[{e.time}]</span>{' '}
              <span className={levelColor[e.level]}>[{e.level}]</span>{' '}
              <span>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
