import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANONYMOUS_ZONE_USER_EMAIL,
  canReadConvenienceZone,
  zoneAccessDenied
} from './zone-access.ts';

test('canReadConvenienceZone allows the owner', () => {
  assert.equal(
    canReadConvenienceZone({ user_id: 'user-1' }, 'user-1'),
    true
  );
});

test('canReadConvenienceZone rejects anonymous access to owner-backed zones', () => {
  assert.equal(
    canReadConvenienceZone({ user_id: 'user-1' }, null),
    false
  );
});

test('canReadConvenienceZone treats anonymous-system zones as public', () => {
  assert.equal(
    canReadConvenienceZone(
      {
        user_id: 'anonymous-user',
        user: { email: ANONYMOUS_ZONE_USER_EMAIL }
      },
      null
    ),
    true
  );
});

test('zoneAccessDenied distinguishes anonymous and wrong-user requests', () => {
  assert.deepEqual(zoneAccessDenied(null), {
    ok: false,
    message: 'Authentication required',
    status: 401
  });
  assert.deepEqual(zoneAccessDenied('user-2'), {
    ok: false,
    message: 'Forbidden',
    status: 403
  });
});
