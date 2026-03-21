export const RECONNECT_GRACE_PERIOD = 2 * 60 * 1000;
export const READ_STATUS_GRACE_PERIOD = 60 * 1000;

export function createClientSessionId() {
	const storageKey = 'nodecrypt_client_session_id';
	try {
		const existing = window.localStorage.getItem(storageKey);
		if (existing && existing.trim()) {
			return existing;
		}
		const nextId = createMessageId();
		window.localStorage.setItem(storageKey, nextId);
		return nextId;
	} catch (error) {
		return createMessageId();
	}
}

export function createMessageId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function isReliableMessageType(msgType) {
	return msgType === 'text' || msgType === 'image' || msgType === 'text_private' || msgType === 'image_private';
}

export function getRecentTargetSessionIds(participantSessions, mySessionId, now = Date.now(), windowMs = RECONNECT_GRACE_PERIOD) {
	if (!participantSessions) return [];
	return Object.values(participantSessions)
		.filter(session => session && session.sessionId && session.sessionId !== mySessionId && (session.isOnline || ((now - (session.lastSeenAt || 0)) <= windowMs)))
		.map(session => session.sessionId)
		.filter((sessionId, index, list) => list.indexOf(sessionId) === index);
}

export function getReadProgress(targetSessionIds = [], readSessionIds = []) {
	const targets = targetSessionIds.filter(Boolean);
	const reads = readSessionIds.filter(sessionId => targets.includes(sessionId));
	return {
		total: targets.length,
		read: reads.length,
		allRead: targets.length > 0 && reads.length === targets.length
	};
}
