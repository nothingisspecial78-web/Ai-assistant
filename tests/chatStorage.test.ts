import { describe, expect, it } from 'vitest';
import {
  clearThreadsList,
  createThreadInList,
  deleteThreadFromList,
  loadUserPersonalization,
  loadUserThreads,
  renameThreadInList,
  saveUserPersonalization,
  saveUserThreads,
  upsertThreadMessagesInList,
  type StorageLike,
} from '../packages/widget/src/hooks/useChatStorage.ts';

function makeMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('Per-user chat history CRUD & personalization storage', () => {
  it('isolates chat history CRUD cleanly across different user keys', () => {
    const mem = makeMemoryStorage();
    const userA = 'demo:admin:admin@islahululoom.edu';
    const userB = 'demo:student:S0125';

    const initA = loadUserThreads('khazna-ledger', userA, mem);
    expect(initA.threads.length).toBe(1);

    const updatedMsgsA = upsertThreadMessagesInList(initA.threads, initA.activeThreadId, [
      { id: 'u1', role: 'user', content: 'Download Class Report PDF' },
      { id: 'a1', role: 'assistant', content: 'Downloading PDF report now.' },
    ]);
    expect(updatedMsgsA[0].title).toBe('Download Class Report PDF');

    const createdA = createThreadInList(updatedMsgsA);
    expect(createdA.threads.length).toBe(2);

    const renamedA = renameThreadInList(createdA.threads, initA.activeThreadId, 'Monthly Audit Export');
    expect(renamedA.find((t) => t.id === initA.activeThreadId)?.title).toBe('Monthly Audit Export');
    saveUserThreads('khazna-ledger', userA, renamedA, createdA.activeThreadId, mem);

    const initB = loadUserThreads('khazna-ledger', userB, mem);
    expect(initB.threads.length).toBe(1);
    expect(initB.threads[0].messages.length).toBe(0);

    const loadedA = loadUserThreads('khazna-ledger', userA, mem);
    expect(loadedA.threads.length).toBe(2);

    const afterDeleteA = deleteThreadFromList(
      loadedA.threads,
      initA.activeThreadId,
      loadedA.activeThreadId
    );
    expect(afterDeleteA.threads.length).toBe(1);

    const afterClearA = clearThreadsList();
    expect(afterClearA.threads.length).toBe(1);
    expect(afterClearA.threads[0].messages.length).toBe(0);
  });

  it('isolates personalization settings per user key', () => {
    const mem = makeMemoryStorage();
    const adminKey = 'demo:admin:admin@islahululoom.edu';
    const studentKey = 'demo:student:S0125';

    saveUserPersonalization(
      'khazna-ledger',
      adminKey,
      {
        displayName: 'Principal',
        tone: 'concise',
        preferredLanguage: 'en',
        customInstructions: 'Show totals first',
        voiceAutoSend: true,
      },
      mem
    );

    saveUserPersonalization(
      'khazna-ledger',
      studentKey,
      {
        displayName: 'Safwan',
        tone: 'detailed',
        preferredLanguage: 'ml',
        customInstructions: 'Explain my sector balance in Malayalam',
        voiceAutoSend: false,
      },
      mem
    );

    const adminPrefs = loadUserPersonalization('khazna-ledger', adminKey, mem);
    const studentPrefs = loadUserPersonalization('khazna-ledger', studentKey, mem);

    expect(adminPrefs.displayName).toBe('Principal');
    expect(adminPrefs.tone).toBe('concise');
    expect(adminPrefs.voiceAutoSend).toBe(true);

    expect(studentPrefs.displayName).toBe('Safwan');
    expect(studentPrefs.tone).toBe('detailed');
    expect(studentPrefs.preferredLanguage).toBe('ml');
    expect(studentPrefs.voiceAutoSend).toBe(false);
  });
});
