import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodeInviteLink,
  encodeInviteLink,
  InvitePayload,
} from '../invite';

describe('Invite Link Codec & Validation', () => {
  const samplePayload: InvitePayload = {
    v: 1,
    groupId: 'test-group-12345',
    name: 'Weekend Trip',
    type: 'trip',
    currency: 'USD',
    inviterName: 'Alice',
    groupKey: 'c29tZS1zZWN1cmUtMzItYnl0ZS1yYW5kb20ta2V5LTAwMQ',
  };

  test('encodes and decodes an invite link successfully', () => {
    const link = encodeInviteLink(samplePayload);
    expect(link.startsWith('finflow://join?d=')).toBe(true);
    expect(link.length).toBeLessThan(600);

    const decoded = decodeInviteLink(link);
    expect(decoded).toEqual(samplePayload);
  });

  test('decodes when passed raw query string or raw base64url string', () => {
    const link = encodeInviteLink(samplePayload);
    const rawD = link.replace('finflow://join?d=', '');

    // From query string
    expect(decodeInviteLink(`?d=${rawD}`)).toEqual(samplePayload);
    // From raw base64url
    expect(decodeInviteLink(rawD)).toEqual(samplePayload);
  });

  test('falls back to default currency when currency is missing or empty', () => {
    const json = JSON.stringify({
      v: 1,
      groupId: 'g-1',
      name: 'Dinner',
      type: 'event',
      currency: '',
      inviterName: 'Bob',
      groupKey: 'abcdefghijklmnopqrstuvwxyz123456',
    });
    const bytes = new TextEncoder().encode(json);
    const raw = bytesToBase64Url(bytes);

    const decoded = decodeInviteLink(raw, 'EUR');
    expect(decoded.currency).toBe('EUR');
  });

  test('enforces max length of 40 characters on group name and inviter name', () => {
    expect(() => {
      encodeInviteLink({
        ...samplePayload,
        name: 'A'.repeat(41),
      });
    }).toThrow(/Group name must be between 1 and 40 characters/);

    expect(() => {
      encodeInviteLink({
        ...samplePayload,
        inviterName: 'B'.repeat(41),
      });
    }).toThrow(/Inviter name must be between 1 and 40 characters/);
  });

  test('rejects unsupported versions and invalid types', () => {
    const invalidVersionJson = JSON.stringify({
      ...samplePayload,
      v: 2,
    });
    const b64v2 = bytesToBase64Url(new TextEncoder().encode(invalidVersionJson));
    expect(() => decodeInviteLink(b64v2)).toThrow(/Unsupported invite version/);

    const invalidTypeJson = JSON.stringify({
      ...samplePayload,
      type: 'business',
    });
    const b64Type = bytesToBase64Url(new TextEncoder().encode(invalidTypeJson));
    expect(() => decodeInviteLink(b64Type)).toThrow(/Invalid group type/);
  });

  test('rejects malformed inputs and invalid group keys', () => {
    expect(() => decodeInviteLink('')).toThrow();
    expect(() => decodeInviteLink('finflow://join')).toThrow(/Missing query parameter/);
    expect(() => decodeInviteLink('finflow://join?other=123')).toThrow(/Missing 'd' parameter/);
    expect(() => decodeInviteLink('!!!not_base64!!!')).toThrow();

    const shortKeyJson = JSON.stringify({
      ...samplePayload,
      groupKey: 'short',
    });
    const b64ShortKey = bytesToBase64Url(new TextEncoder().encode(shortKeyJson));
    expect(() => decodeInviteLink(b64ShortKey)).toThrow(/Invalid group key/);
  });

  test('bytesToBase64Url and base64UrlToBytes round trip', () => {
    const data = new Uint8Array([0, 1, 2, 255, 254, 128, 64, 32, 16, 8, 4, 2, 1]);
    const b64 = bytesToBase64Url(data);
    const roundTrip = base64UrlToBytes(b64);
    expect(Array.from(roundTrip)).toEqual(Array.from(data));
  });
});
