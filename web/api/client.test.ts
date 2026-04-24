import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDraft,
  rescheduleAnnouncementDraft,
  rescheduleConsentFormDraft,
  updateDraft,
} from './client';
import { PGCsrfError, PGRedirectError, PGTimeoutError } from './errors';
import type { PGApiCreateDraftPayload } from './types';

const base: PGApiCreateDraftPayload = {
  title: 'Draft',
  richTextContent: '{"type":"doc","content":[]}',
  enquiryEmailAddress: 'draft@moe.edu.sg',
  recipients: { classIds: [], customGroupIds: [], ccaIds: [], levelIds: [] },
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch({ body: { announcementDraftId: 42 }, resultCode: 1 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createDraft', () => {
  it('POSTs to /api/web/2/staff/announcements/drafts', async () => {
    await createDraft(base);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/announcements\/drafts$/);
    expect(call[1].method).toBe('POST');
  });

  it('returns the announcementDraftId from the envelope body', async () => {
    const out = await createDraft(base);
    expect(out).toEqual({ announcementDraftId: 42 });
  });

  it('accepts a payload with empty enquiryEmailAddress (partial draft)', async () => {
    // Mirrors PGW's draft-manager contract: empty form inputs should still be acceptable.
    await expect(createDraft({ ...base, enquiryEmailAddress: '' })).resolves.toEqual({
      announcementDraftId: 42,
    });
  });

  it('passes an AbortSignal to fetch that aborts when the caller aborts', async () => {
    const controller = new AbortController();
    await createDraft(base, { signal: controller.signal });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    // The composed signal is a child of the caller's signal — aborting the
    // caller cascades to the fetch's signal (compound AbortController pattern).
    expect(call[1].signal).toBeInstanceOf(AbortSignal);
    expect(call[1].signal.aborted).toBe(false);
    controller.abort();
    expect(call[1].signal.aborted).toBe(true);
  });
});

describe('rescheduleAnnouncementDraft (U3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(undefined, 204));
  });

  it('PUTs to /announcements/drafts/schedule/:id with the new scheduledSendAt', async () => {
    await rescheduleAnnouncementDraft(123, { scheduledSendAt: '2026-05-01T09:15:00+08:00' });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/announcements\/drafts\/schedule\/123$/);
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body as string)).toEqual({
      scheduledSendAt: '2026-05-01T09:15:00+08:00',
    });
  });
});

describe('rescheduleConsentFormDraft (U3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(undefined, 204));
  });

  it('PUTs to /consentForms/drafts/schedule/:id with the new scheduledSendAt', async () => {
    await rescheduleConsentFormDraft(401, { scheduledSendAt: '2026-05-02T10:00:00+08:00' });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/consentForms\/drafts\/schedule\/401$/);
    expect(call[1].method).toBe('PUT');
  });
});

describe('mutateApi CSRF retry (U7)', () => {
  function csrfErrorResponse() {
    return new Response(JSON.stringify({ resultCode: -4013, error: { errorReason: 'CSRF' } }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  function okResponse() {
    return new Response(JSON.stringify({ body: { announcementDraftId: 42 }, resultCode: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('replays the request once after a -4013 CSRF rejection', async () => {
    const fetchMock = vi
      .fn()
      // First call: the write endpoint returns -4013.
      .mockResolvedValueOnce(csrfErrorResponse())
      // Second call: the CSRF refresh probe against /session/current.
      .mockResolvedValueOnce(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      )
      // Third call: the write endpoint replay succeeds.
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const out = await createDraft(base);
    expect(out).toEqual({ announcementDraftId: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Replay hits the same write URL with the same body as the original attempt.
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/announcements\/drafts$/);
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/announcements\/drafts$/);
  });

  it('throws PGCsrfError when the replay also returns -4013 (no infinite loop)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrfErrorResponse())
      .mockResolvedValueOnce(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(csrfErrorResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(createDraft(base)).rejects.toBeInstanceOf(PGCsrfError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('mutateApi redirect handling (U10)', () => {
  it('throws PGRedirectError when PG returns a 302 with Location', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: '/login?reason=-4031' },
        }),
      ),
    );
    // Stub navigation so the assertion doesn't try to actually relocate jsdom.
    const locationHref = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return '';
        },
        set href(v: string) {
          locationHref(v);
        },
        origin: 'http://localhost',
        pathname: '/',
      },
    });

    const err = await createDraft(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PGRedirectError);
    expect((err as PGRedirectError).location).toBe('/login?reason=-4031');
    expect(locationHref).toHaveBeenCalledWith('/login?reason=-4031');
  });

  it('throws PGRedirectError with a null location when the browser hid the header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        // Emulate an opaqueredirect — Response headers are empty but status < 400
        // so isRedirectResponse still fires via the 3xx branch.
        new Response(null, { status: 302 }),
      ),
    );
    const err = await createDraft(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PGRedirectError);
    expect((err as PGRedirectError).location).toBeNull();
  });
});

describe('mutateApi timeout (U8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with PGTimeoutError when fetch never resolves within the budget', async () => {
    // A fetch that never resolves. The `signal` passed in by mutateApi is the
    // composed timeout signal — hook into it to resolve with an AbortError
    // when the internal timeout fires, mimicking a real fetch implementation.
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = createDraft(base, { timeoutMs: 100 });
    // Catch the rejection now so there's no "unhandled promise" noise.
    const assertion = expect(pending).rejects.toBeInstanceOf(PGTimeoutError);
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it('surfaces a caller-initiated abort as AbortError, not PGTimeoutError', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const pending = createDraft(base, { signal: controller.signal, timeoutMs: 30_000 });
    const assertion = expect(pending).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof DOMException &&
        err.name === 'AbortError' &&
        !(err instanceof PGTimeoutError),
    );
    controller.abort();
    await assertion;
  });

  it('does not reject fast fetches with a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ body: { announcementDraftId: 7 }, resultCode: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const out = await createDraft(base, { timeoutMs: 30_000 });
    expect(out).toEqual({ announcementDraftId: 7 });
  });
});

describe('updateDraft', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(undefined, 204));
  });

  it('PUTs to /api/web/2/staff/announcements/drafts/:id', async () => {
    await updateDraft(123, base);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/announcements\/drafts\/123$/);
    expect(call[1].method).toBe('PUT');
  });
});
