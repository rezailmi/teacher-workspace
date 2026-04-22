import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoSave } from './useAutoSave';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoSave', () => {
  it('calls save after the interval elapses when payload changes', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ payload }: { payload: { a: number } }) => useAutoSave({ payload, save, intervalMs: 1000 }),
      { initialProps: { payload: { a: 1 } } },
    );

    rerender({ payload: { a: 2 } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ a: 2 });
  });

  it('skips the save when the serialized payload is unchanged', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ payload }: { payload: { a: number } }) => useAutoSave({ payload, save, intervalMs: 1000 }),
      { initialProps: { payload: { a: 1 } } },
    );

    // First tick — payload is { a: 1 }, initial snapshot is null so first save fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Rerender with same payload; next tick should not fire save again.
    rerender({ payload: { a: 1 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not save when shouldSave returns false', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useAutoSave({
        payload: { title: '' },
        save,
        intervalMs: 1000,
        shouldSave: (p: { title: string }) => p.title.length > 0,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('exposes status transitions idle → saving → saved on successful save', async () => {
    let resolveSave!: () => void;
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveSave = r;
        }),
    );

    const { result } = renderHook(() => useAutoSave({ payload: { a: 1 }, save, intervalMs: 1000 }));

    expect(result.current.status).toBe('idle');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.status).toBe('saving');

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
    expect(result.current.lastSavedSerialized).toBe(JSON.stringify({ a: 1 }));
  });

  it('saveNow aborts an in-flight save and runs a fresh one', async () => {
    const signalsSeen: AbortSignal[] = [];
    let callCount = 0;
    const save = vi
      .fn()
      .mockImplementation(async (_p: unknown, { signal }: { signal: AbortSignal }) => {
        signalsSeen.push(signal);
        callCount++;
        // First call hangs until aborted; second call resolves immediately.
        if (callCount === 1) {
          return new Promise<void>((_, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          });
        }
      });

    const { result, rerender } = renderHook(
      ({ payload }: { payload: { a: number } }) => useAutoSave({ payload, save, intervalMs: 1000 }),
      { initialProps: { payload: { a: 1 } } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).toHaveBeenCalledTimes(1);

    rerender({ payload: { a: 2 } });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(signalsSeen[0].aborted).toBe(true);
  });
});
