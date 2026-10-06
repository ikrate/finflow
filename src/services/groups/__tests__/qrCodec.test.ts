import {
  encodeQRBundle,
  parseQRFrame,
  QRBundle,
  QRFrameAssembler,
} from '../qrCodec';

describe('QR Codec: Compression, Framing, and Reassembly', () => {
  const sampleSummary: QRBundle = {
    v: 1,
    type: 'summary',
    groupId: 'grp-1234',
    name: 'Roadtrip',
    vector: { 'device-1': 5, 'device-2': 10 },
  };

  test('encodes single-frame bundle and decodes successfully', () => {
    const encoded = encodeQRBundle(sampleSummary);
    expect(encoded.totalFrames).toBe(1);
    expect(encoded.frames).toHaveLength(1);

    const assembler = new QRFrameAssembler();
    const result = assembler.addFrame(encoded.frames[0]);

    expect(result.status).toBe('complete');
    expect(result.bundle).toEqual(sampleSummary);
  });

  test('encodes multi-frame large bundle and reassembles out of order', () => {
    // Generate bundle with many events to trigger chunking
    const events = [];
    for (let i = 1; i <= 30; i++) {
      events.push({
        id: `dev-1:${i}`,
        groupId: 'grp-multi',
        deviceId: 'dev-1',
        seq: i,
        lc: i,
        ts: Date.now(),
        type: 'expense_upserted' as const,
        payload: {
          expense: {
            id: `exp-${i}`,
            title: `Large Multi Item Expense Number ${i} With Lots Of Extra Description Text`,
            amountMinor: 25000,
            paidBy: 'mem-1',
            splitType: 'equal' as const,
            participants: [{ memberId: 'mem-1' }, { memberId: 'mem-2' }, { memberId: 'mem-3' }],
            date: Date.now(),
          },
        },
      });
    }

    const largeBundle: QRBundle = {
      v: 1,
      type: 'delta',
      groupId: 'grp-multi',
      events,
      vector: { 'dev-1': 30 },
    };

    // Use smaller chunk size to guarantee multiple frames
    const encoded = encodeQRBundle(largeBundle, 300);
    expect(encoded.totalFrames).toBeGreaterThan(1);

    const assembler = new QRFrameAssembler();

    // Shuffle frames to simulate receiving out of order
    const shuffled = [...encoded.frames].sort(() => Math.random() - 0.5);

    let finalResult;
    for (const frame of shuffled) {
      finalResult = assembler.addFrame(frame);
    }

    expect(finalResult?.status).toBe('complete');
    expect(finalResult?.bundle).toEqual(largeBundle);
  });

  test('rejects corrupted frame checksum', () => {
    const encoded = encodeQRBundle(sampleSummary);
    // Tamper with payload
    const corruptedFrame = encoded.frames[0].slice(0, -5) + 'AAAAA';

    const assembler = new QRFrameAssembler();
    const result = assembler.addFrame(corruptedFrame);

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
  });

  test('handles frames from a different bundle cleanly', () => {
    const bundleA: QRBundle = { v: 1, type: 'summary', groupId: 'g1', vector: {}, name: 'A' };
    const bundleB: QRBundle = { v: 1, type: 'summary', groupId: 'g2', vector: {}, name: 'B' };

    // Force multi-frame
    const encA = encodeQRBundle(bundleA, 20);
    const encB = encodeQRBundle(bundleB, 20);

    const assembler = new QRFrameAssembler();
    assembler.addFrame(encA.frames[0]); // Starts bundle A

    // Receiving frame from bundle B
    const resultB = assembler.addFrame(encB.frames[0]);
    expect(resultB.status).toBe('different_bundle');
  });

  test('parses individual frames correctly', () => {
    const frame = 'FF1|testId|2|5|abcdef12|samplePayloadData';
    const parsed = parseQRFrame(frame);

    expect(parsed.valid).toBe(true);
    expect(parsed.bundleId).toBe('testId');
    expect(parsed.index).toBe(2);
    expect(parsed.total).toBe(5);
    expect(parsed.crc32Hex).toBe('abcdef12');
    expect(parsed.chunk).toBe('samplePayloadData');
  });
});
