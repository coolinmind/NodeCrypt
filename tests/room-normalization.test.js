import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from 'js-sha256';

import { normalizeRoomName } from '../client/js/util.room.js';
import { getReadProgress, getRecentTargetSessionIds, READ_STATUS_GRACE_PERIOD } from '../client/js/util.message.js';

test('normalizeRoomName trims and lowercases user input', () => {
	assert.equal(normalizeRoomName(' RoomA '), 'rooma');
	assert.equal(normalizeRoomName('ROOM-a'), 'room-a');
});

test('different room name casing resolves to the same hashed channel', () => {
	const canonicalHash = sha256(normalizeRoomName('NodeCrypt'));

	assert.equal(sha256(normalizeRoomName('nodecrypt')), canonicalHash);
	assert.equal(sha256(normalizeRoomName(' NODECRYPT ')), canonicalHash);
});

test('non-string room names normalize to empty string', () => {
	assert.equal(normalizeRoomName(null), '');
	assert.equal(normalizeRoomName(undefined), '');
	assert.equal(normalizeRoomName(123), '');
});

test('getReadProgress marks all-read only when every target session has acknowledged', () => {
	assert.deepEqual(
		getReadProgress(['s1', 's2', 's3'], ['s1', 's3']),
		{ total: 3, read: 2, allRead: false }
	);

	assert.deepEqual(
		getReadProgress(['s1', 's2'], ['s2', 's1', 'ignored']),
		{ total: 2, read: 2, allRead: true }
	);
});

test('getRecentTargetSessionIds keeps online and grace-period sessions excluding self', () => {
	const now = 10_000;
	const sessions = {
		a: { sessionId: 'self', isOnline: true, lastSeenAt: now },
		b: { sessionId: 'user-1', isOnline: true, lastSeenAt: now },
		c: { sessionId: 'user-2', isOnline: false, lastSeenAt: now - 30_000 },
		d: { sessionId: 'user-3', isOnline: false, lastSeenAt: now - 500_000 }
	};

	assert.deepEqual(
		getRecentTargetSessionIds(sessions, 'self', now, 120_000),
		['user-1', 'user-2']
	);
});

test('read-status target calculation drops users gone for over one minute', () => {
	const now = 50_000;
	const sessions = {
		a: { sessionId: 'self', isOnline: true, lastSeenAt: now },
		b: { sessionId: 'user-1', isOnline: true, lastSeenAt: now },
		c: { sessionId: 'user-2', isOnline: false, lastSeenAt: now - (READ_STATUS_GRACE_PERIOD - 1_000) },
		d: { sessionId: 'user-3', isOnline: false, lastSeenAt: now - (READ_STATUS_GRACE_PERIOD + 1_000) }
	};

	assert.deepEqual(
		getRecentTargetSessionIds(sessions, 'self', now, READ_STATUS_GRACE_PERIOD),
		['user-1', 'user-2']
	);

	assert.deepEqual(
		getReadProgress(
			getRecentTargetSessionIds(sessions, 'self', now, READ_STATUS_GRACE_PERIOD),
			['user-1', 'user-2', 'user-3']
		),
		{ total: 2, read: 2, allRead: true }
	);
});

test('offline participant lastSeenAt must not be refreshed repeatedly', () => {
	const leaveAt = 10_000;
	const later = leaveAt + READ_STATUS_GRACE_PERIOD + 5_000;
	const sessions = {
		a: { sessionId: 'self', isOnline: true, lastSeenAt: later },
		b: { sessionId: 'reader', isOnline: true, lastSeenAt: later },
		c: { sessionId: 'left-user', isOnline: false, lastSeenAt: leaveAt }
	};

	assert.deepEqual(
		getRecentTargetSessionIds(sessions, 'self', later, READ_STATUS_GRACE_PERIOD),
		['reader']
	);

	assert.deepEqual(
		getReadProgress(['reader'], ['reader']),
		{ total: 1, read: 1, allRead: true }
	);
});
