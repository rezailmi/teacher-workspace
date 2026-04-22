import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDraft, updateDraft } from './client';
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

  it('forwards an AbortSignal to fetch', async () => {
    const controller = new AbortController();
    await createDraft(base, { signal: controller.signal });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].signal).toBe(controller.signal);
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
