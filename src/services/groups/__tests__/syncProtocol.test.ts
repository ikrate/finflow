import {
  computeGroupHash,
  computeHandshakeProof,
  createHandshakeContext,
  generateGroupKey,
  verifyHandshakeContext,
} from '../sync/auth';
import {
  encodeAndChunkMessage,
  FrameAssembler,
  ProtocolMessage,
  SyncSession,
} from '../sync/protocol';
import { MockPeerTransport } from '../sync/mockTransport';
import { GroupEvent } from '../types';
import { createGroupEvent, deriveGroupState } from '../eventLog';

describe('Multipeer Sync Protocol & Auth', () => {
  const groupId = 'group-conv-123';
  const groupKey = generateGroupKey();

  describe('Handshake & Authentication', () => {
    test('computes deterministic 8-hex-character discovery hash', () => {
      const hash1 = computeGroupHash(groupId);
      const hash2 = computeGroupHash(groupId);
      expect(hash1).toHaveLength(8);
      expect(hash1).toBe(hash2);

      const otherHash = computeGroupHash('different-group-456');
      expect(otherHash).not.toBe(hash1);
    });

    test('generates valid handshake context and verifies successfully with matching groupKey', () => {
      const context = createHandshakeContext(groupKey, groupId);
      const res = verifyHandshakeContext(context, groupKey, groupId);
      expect(res.valid).toBe(true);
      expect(res.isMalformed).toBe(false);
    });

    test('rejects handshake context with incorrect groupKey', () => {
      const wrongKey = generateGroupKey();
      const context = createHandshakeContext(groupKey, groupId);
      const res = verifyHandshakeContext(context, wrongKey, groupId);
      expect(res.valid).toBe(false);
      expect(res.isMalformed).toBe(false);
    });

    test('rejects handshake context with mismatched groupId', () => {
      const context = createHandshakeContext(groupKey, groupId);
      const res = verifyHandshakeContext(context, groupKey, 'wrong-group-id');
      expect(res.valid).toBe(false);
      expect(res.isMalformed).toBe(false);
    });

    test('handles malformed or invalid context gracefully', () => {
      expect(verifyHandshakeContext('not-json', groupKey, groupId).isMalformed).toBe(true);
      expect(verifyHandshakeContext(JSON.stringify({ v: 2 }), groupKey, groupId).isMalformed).toBe(true);
      expect(verifyHandshakeContext('', groupKey, groupId).valid).toBe(false);
    });
  });

  describe('Frame Chunking & Reassembly', () => {
    test('chunks large message over 48 KB and reassembles correctly', () => {
      // Create random non-compressible content to exceed chunk size after compression
      const largeEvents: GroupEvent[] = [];
      for (let i = 1; i <= 600; i++) {
        // High-entropy random payload ensuring compressed size > 40KB
        const randomEntropy = Array.from({ length: 120 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
        largeEvents.push({
          id: `devA:${i}`,
          groupId,
          deviceId: 'devA',
          seq: i,
          lc: i,
          ts: 1700000000 + i,
          type: 'expense_upserted',
          payload: {
            expense: {
              id: `exp-${i}`,
              title: `Item-${randomEntropy}`,
              amountMinor: 2500,
              paidBy: 'member-1',
              splitType: 'equal',
              participants: [{ memberId: 'member-1' }, { memberId: 'member-2' }],
              date: 1700000000 + i,
            },
          },
        });
      }

      const originalMsg: ProtocolMessage = {
        v: 1,
        type: 'DELTA',
        groupId,
        events: largeEvents,
        vector: { devA: 600 },
        batchIndex: 0,
        totalBatches: 1,
      };

      const frames = encodeAndChunkMessage(originalMsg);
      expect(frames.length).toBeGreaterThan(1);

      const assembler = new FrameAssembler();
      let reassembled: ProtocolMessage | null = null;

      for (const frame of frames) {
        reassembled = assembler.addFrame(frame);
      }

      expect(reassembled).not.toBeNull();
      expect(reassembled?.type).toBe('DELTA');
      if (reassembled && reassembled.type === 'DELTA') {
        expect(reassembled.events).toHaveLength(600);
        expect(reassembled.events[0].id).toBe('devA:1');
        expect(reassembled.events[599].id).toBe('devA:600');
      }
    });
  });

  describe('Two-Peer Sync Convergence', () => {
    test('two peers with distinct events sync and achieve identical states', async () => {
      const [transportA, transportB] = MockPeerTransport.createPair(
        'peerA',
        'Alice Phone',
        'peerB',
        'Bob Phone'
      );

      // Initial events for Phone A with proper monotonic sequences
      const eA1 = createGroupEvent(groupId, 'devA', 'group_created', { name: 'Roadtrip', type: 'trip', currency: 'EUR' }, []);
      const eA2 = createGroupEvent(groupId, 'devA', 'member_added', { member: { id: 'memA', name: 'Alice', kind: 'device' } }, [eA1]);
      const eA3 = createGroupEvent(
        groupId,
        'devA',
        'expense_upserted',
        {
          expense: {
            id: 'exp-1',
            title: 'Fuel',
            amountMinor: 6000,
            paidBy: 'memA',
            splitType: 'equal',
            participants: [{ memberId: 'memA' }],
            date: 1000,
          },
        },
        [eA1, eA2]
      );
      let eventsA: GroupEvent[] = [eA1, eA2, eA3];

      // Initial events for Phone B with proper monotonic sequences
      const eB1 = createGroupEvent(groupId, 'devB', 'member_added', { member: { id: 'memB', name: 'Bob', kind: 'device' } }, []);
      const eB2 = createGroupEvent(
        groupId,
        'devB',
        'expense_upserted',
        {
          expense: {
            id: 'exp-2',
            title: 'Snacks',
            amountMinor: 2000,
            paidBy: 'memB',
            splitType: 'equal',
            participants: [{ memberId: 'memB' }],
            date: 2000,
          },
        },
        [eB1]
      );
      let eventsB: GroupEvent[] = [eB1, eB2];

      let completedA = false;
      let completedB = false;

      const sessionA = new SyncSession({
        transport: transportA,
        groupId,
        localDeviceId: 'devA',
        localMemberId: 'memA',
        getLocalEvents: () => eventsA,
        saveLocalEvents: (updated) => {
          eventsA = updated;
        },
        onComplete: () => {
          completedA = true;
        },
      });

      const sessionB = new SyncSession({
        transport: transportB,
        groupId,
        localDeviceId: 'devB',
        localMemberId: 'memB',
        getLocalEvents: () => eventsB,
        saveLocalEvents: (updated) => {
          eventsB = updated;
        },
        onComplete: () => {
          completedB = true;
        },
      });

      sessionA.attach('peerB');
      sessionB.attach('peerA');

      await transportA.start({ displayName: 'Alice', groupHash: computeGroupHash(groupId) });
      await transportB.start({ displayName: 'Bob', groupHash: computeGroupHash(groupId) });

      // Alice invites Bob
      const context = createHandshakeContext(groupKey, groupId);
      await transportA.invite('peerB', context);

      // Wait for invitation delivery and accept
      await new Promise<void>((resolve) => {
        transportB.onInvitation(async (inv) => {
          await transportB.respondToInvitation(inv.invitationId, true);
          resolve();
        });
      });

      // Wait for 2-way sync to complete
      const startMs = Date.now();
      while ((!completedA || !completedB) && Date.now() - startMs < 3000) {
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(completedA).toBe(true);
      expect(completedB).toBe(true);

      // Both logs have all 5 events
      expect(eventsA.length).toBe(5);
      expect(eventsB.length).toBe(5);

      // Verify identical derived state
      const stateA = deriveGroupState(groupId, eventsA);
      const stateB = deriveGroupState(groupId, eventsB);

      expect(stateA.expenses.length).toBe(2);
      expect(stateB.expenses.length).toBe(2);
      expect(stateA.members.length).toBe(2);
      expect(stateB.members.length).toBe(2);
      expect(stateA.versionVector).toEqual(stateB.versionVector);

      sessionA.cleanup();
      sessionB.cleanup();
    });

    test('sync is idempotent and safe to re-run immediately', async () => {
      const [transportA, transportB] = MockPeerTransport.createPair(
        'peerA',
        'Alice Phone',
        'peerB',
        'Bob Phone'
      );

      let eventsA: GroupEvent[] = [
        createGroupEvent(groupId, 'devA', 'group_created', { name: 'Trip', type: 'trip', currency: '$' }, []),
      ];
      let eventsB: GroupEvent[] = [...eventsA];

      let completedA = false;
      let completedB = false;

      const sessionA = new SyncSession({
        transport: transportA,
        groupId,
        localDeviceId: 'devA',
        getLocalEvents: () => eventsA,
        saveLocalEvents: (updated) => {
          eventsA = updated;
        },
        onComplete: () => {
          completedA = true;
        },
      });

      const sessionB = new SyncSession({
        transport: transportB,
        groupId,
        localDeviceId: 'devB',
        getLocalEvents: () => eventsB,
        saveLocalEvents: (updated) => {
          eventsB = updated;
        },
        onComplete: () => {
          completedB = true;
        },
      });

      sessionA.attach('peerB');
      sessionB.attach('peerA');

      await transportA.start({ displayName: 'Alice', groupHash: computeGroupHash(groupId) });
      await transportB.start({ displayName: 'Bob', groupHash: computeGroupHash(groupId) });

      const context = createHandshakeContext(groupKey, groupId);
      await transportA.invite('peerB', context);

      await new Promise<void>((resolve) => {
        transportB.onInvitation(async (inv) => {
          await transportB.respondToInvitation(inv.invitationId, true);
          resolve();
        });
      });

      const startMs = Date.now();
      while ((!completedA || !completedB) && Date.now() - startMs < 3000) {
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(completedA).toBe(true);
      expect(completedB).toBe(true);
      expect(eventsA.length).toBe(1);
      expect(eventsB.length).toBe(1);

      sessionA.cleanup();
      sessionB.cleanup();
    });

    test('multi-round sync enables identity registration round on same connection', async () => {
      const [transportA, transportB] = MockPeerTransport.createPair(
        'peerA',
        'Alice Phone',
        'peerB',
        'Bob Phone'
      );

      // Alice created group
      let eventsA: GroupEvent[] = [
        createGroupEvent(groupId, 'devA', 'group_created', { name: 'Trip', type: 'trip', currency: '$' }, []),
      ];
      // Bob joined from link (0 events initially)
      let eventsB: GroupEvent[] = [];

      let round1A = false;
      let round1B = false;
      let round2A = false;
      let round2B = false;

      let round = 1;

      const sessionA = new SyncSession({
        transport: transportA,
        groupId,
        localDeviceId: 'devA',
        getLocalEvents: () => eventsA,
        saveLocalEvents: (updated) => {
          eventsA = updated;
        },
        onComplete: (summary) => {
          if (round === 1) round1A = true;
          else round2A = true;
        },
      });

      const sessionB = new SyncSession({
        transport: transportB,
        groupId,
        localDeviceId: 'devB',
        getLocalEvents: () => eventsB,
        saveLocalEvents: (updated) => {
          eventsB = updated;
        },
        onComplete: (summary) => {
          if (round === 1) round1B = true;
          else round2B = true;
        },
      });

      sessionA.attach('peerB');
      sessionB.attach('peerA');

      await transportA.start({ displayName: 'Alice', groupHash: computeGroupHash(groupId) });
      await transportB.start({ displayName: 'Bob', groupHash: computeGroupHash(groupId) });

      const context = createHandshakeContext(groupKey, groupId);
      await transportA.invite('peerB', context);

      await new Promise<void>((resolve) => {
        transportB.onInvitation(async (inv) => {
          await transportB.respondToInvitation(inv.invitationId, true);
          resolve();
        });
      });

      // Wait for Round 1 to finish
      let startMs = Date.now();
      while ((!round1A || !round1B) && Date.now() - startMs < 3000) {
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(round1A).toBe(true);
      expect(round1B).toBe(true);
      expect(eventsB.length).toBe(1); // Bob got Alice's group_created

      // Bob now adds member_added (identity registration)
      round = 2;
      const addBobEvent = createGroupEvent(
        groupId,
        'devB',
        'member_added',
        { member: { id: 'm_bob', name: 'Bob', kind: 'device', joinedAt: Date.now(), deviceId: 'devB' } },
        eventsB
      );
      eventsB = [...eventsB, addBobEvent];

      // Bob triggers Round 2
      await sessionB.startNextRound();

      startMs = Date.now();
      while ((!round2A || !round2B) && Date.now() - startMs < 3000) {
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(round2A).toBe(true);
      expect(round2B).toBe(true);

      // Alice now has Bob's member_added event!
      expect(eventsA.length).toBe(2);
      expect(eventsB.length).toBe(2);

      const stateA = deriveGroupState(groupId, eventsA);
      expect(stateA.members.some((m) => m.name === 'Bob')).toBe(true);

      sessionA.cleanup();
      sessionB.cleanup();
    });
  });
});
