export function normalizeRoomName(roomName) {
	if (typeof roomName !== 'string') return '';
	return roomName.trim().toLowerCase();
}
