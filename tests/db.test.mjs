import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlmsyDb, createMemoryBacking } from '../lib/db.js';

test('db: persists org profile, prevents decrementing nextSequence below highest issued, and simulates reload', async () => {
  const backing = createMemoryBacking();
  const db1 = createAlmsyDb({ backing });

  const initial = await db1.getOrgProfile();
  assert.equal(initial.receiptType, 'official');
  assert.equal(initial.nextSequence, 1);

  await db1.saveOrgProfile({
    legalName: 'Sri Ganesha Temple Society of Toronto',
    registrationNumber: '123456789RR0001',
    receiptPrefix: 'SGT-2026-',
    nextSequence: 10,
  });

  await db1.appendRegisterEntries([
    {
      serialNumber: 'SGT-2026-00010',
      prefix: 'SGT-2026-',
      sequenceNumber: 10,
      donorName: 'Anita Desai',
      amountCents: 10100,
      status: 'ISSUED',
      runId: 'run-1',
      createdAt: '2026-10-23T00:00:00Z',
    },
  ]);

  // Simulate reload with a fresh db instance sharing the same backing store
  const db2 = createAlmsyDb({ backing });
  const reloadedProfile = await db2.getOrgProfile();
  assert.equal(reloadedProfile.legalName, 'Sri Ganesha Temple Society of Toronto');

  // Attempt to set nextSequence backwards to 5 -> must clamp to 11 (highestIssued + 1)
  const clamped = await db2.saveOrgProfile({ nextSequence: 5 });
  assert.equal(clamped.nextSequence, 11);

  // Attempt to reuse serialNumber SGT-2026-00010 -> must throw
  await assert.rejects(() =>
    db2.appendRegisterEntries([
      {
        serialNumber: 'SGT-2026-00010',
        prefix: 'SGT-2026-',
        sequenceNumber: 10,
      },
    ])
  );
});
