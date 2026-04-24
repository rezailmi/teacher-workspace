import { describe, expect, it } from 'vitest';

import {
  __formReducer as formReducer,
  __INITIAL_STATE as INITIAL_STATE,
  type UploadingFile,
} from './CreatePostView';

function makeFileUpload(partial: Partial<UploadingFile> = {}): UploadingFile {
  return {
    localId: partial.localId ?? 'file-1',
    kind: 'file',
    name: partial.name ?? 'slip.pdf',
    size: partial.size ?? 1024,
    mimeType: partial.mimeType ?? 'application/pdf',
    status: partial.status ?? 'uploading',
    attachmentId: partial.attachmentId,
    url: partial.url,
    error: partial.error,
  };
}

describe('formReducer — uploads', () => {
  it('appends a new file upload with status: uploading', () => {
    const next = formReducer(INITIAL_STATE, {
      type: 'ADD_UPLOAD',
      kind: 'file',
      payload: { localId: 'a', name: 'x.pdf', size: 100, mimeType: 'application/pdf' },
    });
    expect(next.attachments).toHaveLength(1);
    expect(next.attachments[0]).toMatchObject({
      localId: 'a',
      kind: 'file',
      status: 'uploading',
    });
    expect(next.attachments[0].isCover).toBeUndefined();
  });

  it('marks the first added photo as cover, subsequent as non-cover', () => {
    const one = formReducer(INITIAL_STATE, {
      type: 'ADD_UPLOAD',
      kind: 'photo',
      payload: { localId: 'p1', name: '1.png', size: 100, mimeType: 'image/png' },
    });
    const two = formReducer(one, {
      type: 'ADD_UPLOAD',
      kind: 'photo',
      payload: { localId: 'p2', name: '2.png', size: 100, mimeType: 'image/png' },
    });
    expect(two.photos[0].isCover).toBe(true);
    expect(two.photos[1].isCover).toBe(false);
  });

  it('merges a patch into the matching upload by localId', () => {
    const withOne = formReducer(INITIAL_STATE, {
      type: 'ADD_UPLOAD',
      kind: 'file',
      payload: { localId: 'a', name: 'x.pdf', size: 100, mimeType: 'application/pdf' },
    });
    const next = formReducer(withOne, {
      type: 'UPDATE_UPLOAD',
      kind: 'file',
      localId: 'a',
      patch: { status: 'verifying', attachmentId: 42 },
    });
    expect(next.attachments[0]).toMatchObject({
      localId: 'a',
      name: 'x.pdf', // original fields preserved
      status: 'verifying',
      attachmentId: 42,
    });
  });

  it('leaves state unchanged when the patch targets an unknown localId', () => {
    const withOne = formReducer(INITIAL_STATE, {
      type: 'ADD_UPLOAD',
      kind: 'file',
      payload: { localId: 'a', name: 'x.pdf', size: 100, mimeType: 'application/pdf' },
    });
    const next = formReducer(withOne, {
      type: 'UPDATE_UPLOAD',
      kind: 'file',
      localId: 'does-not-exist',
      patch: { status: 'ready' },
    });
    expect(next.attachments[0].status).toBe('uploading');
  });

  it('drops the matching entry by localId', () => {
    const withTwo = [makeFileUpload({ localId: 'a' }), makeFileUpload({ localId: 'b' })];
    const state = { ...INITIAL_STATE, attachments: withTwo };
    const next = formReducer(state, { type: 'REMOVE_UPLOAD', kind: 'file', localId: 'a' });
    expect(next.attachments).toHaveLength(1);
    expect(next.attachments[0].localId).toBe('b');
  });

  it('promotes the first remaining photo to cover when the current cover is removed', () => {
    const state = {
      ...INITIAL_STATE,
      photos: [
        { ...makeFileUpload({ localId: 'p1' }), kind: 'photo' as const, isCover: true },
        { ...makeFileUpload({ localId: 'p2' }), kind: 'photo' as const, isCover: false },
        { ...makeFileUpload({ localId: 'p3' }), kind: 'photo' as const, isCover: false },
      ],
    };
    const next = formReducer(state, { type: 'REMOVE_UPLOAD', kind: 'photo', localId: 'p1' });
    expect(next.photos).toHaveLength(2);
    expect(next.photos[0].localId).toBe('p2');
    expect(next.photos[0].isCover).toBe(true);
    expect(next.photos[1].isCover).toBe(false);
  });

  it('leaves photos empty when the only photo is removed', () => {
    const state = {
      ...INITIAL_STATE,
      photos: [{ ...makeFileUpload({ localId: 'p1' }), kind: 'photo' as const, isCover: true }],
    };
    const next = formReducer(state, { type: 'REMOVE_UPLOAD', kind: 'photo', localId: 'p1' });
    expect(next.photos).toHaveLength(0);
  });

  it('moves isCover to the targeted photo and unsets others', () => {
    const state = {
      ...INITIAL_STATE,
      photos: [
        { ...makeFileUpload({ localId: 'p1' }), kind: 'photo' as const, isCover: true },
        { ...makeFileUpload({ localId: 'p2' }), kind: 'photo' as const, isCover: false },
      ],
    };
    const next = formReducer(state, { type: 'SET_COVER_PHOTO', localId: 'p2' });
    expect(next.photos[0].isCover).toBe(false);
    expect(next.photos[1].isCover).toBe(true);
  });
});
