import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveOptions<TPayload> {
  /** Current payload. Hook serializes with JSON.stringify for change detection. */
  payload: TPayload;
  /** Called to persist. Must accept a signal and respect it. */
  save: (payload: TPayload, opts: { signal: AbortSignal }) => Promise<void>;
  /** Poll interval in ms. Defaults to 30_000. */
  intervalMs?: number;
  /** When false, autosave stops scheduling new ticks but doesn't cancel in-flight. */
  enabled?: boolean;
  /**
   * Return true when the payload has enough content to be worth saving.
   * Defaults to `() => true`.
   */
  shouldSave?: (payload: TPayload) => boolean;
}

export interface UseAutoSaveResult {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
  /** JSON.stringify of the payload at the moment of the last successful save. */
  lastSavedSerialized: string | null;
  /** Force an immediate save; aborts any in-flight autosave first. */
  saveNow: () => Promise<void>;
}

export function useAutoSave<TPayload>(options: UseAutoSaveOptions<TPayload>): UseAutoSaveResult {
  const { payload, save, intervalMs = 30_000, enabled = true, shouldSave } = options;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedSerialized, setLastSavedSerialized] = useState<string | null>(null);

  const payloadRef = useRef(payload);
  const saveRef = useRef(save);
  const shouldSaveRef = useRef(shouldSave);
  const lastSerializedRef = useRef<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  // Keep refs up-to-date without re-running the interval effect.
  useEffect(() => {
    payloadRef.current = payload;
    saveRef.current = save;
    shouldSaveRef.current = shouldSave;
  }, [payload, save, shouldSave]);

  const runSave = useCallback(async (): Promise<void> => {
    const current = payloadRef.current;
    if (shouldSaveRef.current && !shouldSaveRef.current(current)) return;

    const serialized = JSON.stringify(current);
    if (serialized === lastSerializedRef.current) return;

    // Abort any previous in-flight save.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setStatus('saving');
    try {
      await saveRef.current(current, { signal: controller.signal });
      // Only mark saved if this is still the latest request.
      if (inFlightRef.current === controller) {
        lastSerializedRef.current = serialized;
        setLastSavedSerialized(serialized);
        setLastSavedAt(new Date());
        setStatus('saved');
      }
    } catch (err) {
      if (controller.signal.aborted) return; // superseded, don't surface.
      setStatus('error');
      throw err;
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void runSave().catch(() => {
        // Errors already surfaced via setStatus('error').
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, runSave]);

  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

  const saveNow = useCallback(async () => {
    await runSave();
  }, [runSave]);

  return { status, lastSavedAt, lastSavedSerialized, saveNow };
}
