import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUEST_ZONE_CLAIMS_HEADER,
  getGuestZoneClaimTokenHashesFromHeaders,
  hashGuestZoneClaimToken
} from './guest-zone-claims.ts';

test('hashGuestZoneClaimToken returns stable non-raw token hashes', () => {
  const token = 'a-valid-guest-claim-token';
  const hash = hashGuestZoneClaimToken(token);

  assert.equal(hash, hashGuestZoneClaimToken(token));
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
});

test('getGuestZoneClaimTokenHashesFromHeaders parses comma-separated claims', () => {
  const headers = new Headers({
    [GUEST_ZONE_CLAIMS_HEADER]:
      'first-valid-guest-token, second-valid-guest-token'
  });

  assert.deepEqual(getGuestZoneClaimTokenHashesFromHeaders(headers), [
    hashGuestZoneClaimToken('first-valid-guest-token'),
    hashGuestZoneClaimToken('second-valid-guest-token')
  ]);
});

test('getGuestZoneClaimTokenHashesFromHeaders ignores invalid claim headers', () => {
  const headers = new Headers({ [GUEST_ZONE_CLAIMS_HEADER]: 'too-short' });

  assert.deepEqual(getGuestZoneClaimTokenHashesFromHeaders(headers), []);
});
