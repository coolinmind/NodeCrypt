// Room management logic for NodeCrypt web client
// NodeCrypt 网页客户端的房间管理逻辑

import {
	createAvatarSVG
} from './util.avatar.js';
import {
	renderChatArea,
	addSystemMsg,
	updateChatInputStyle
} from './chat.js';
import {
	renderMainHeader,
	renderUserList
} from './ui.js';
import {
	escapeHTML
} from './util.string.js';
import {
	$id,
	createElement
} from './util.dom.js';
import { t } from './util.i18n.js';
let roomsData = [];
let activeRoomIndex = -1;
// 存储当前正在输入的用户集合
let typingUsers = new Set();

// Get a new room data object
// 获取一个新的房间数据对象
export function getNewRoomData() {
	return {
		roomName: '',
		userList: [],
		userMap: {},
		myId: null,
		myUserName: '',
		chat: null,
		messages: [],
		prevUserList: [],
		knownUserIds: new Set(),
		unreadCount: 0,
		privateChatTargetId: null,
		privateChatTargetName: null
	}
}

// Switch to another room by index
// 切换到指定索引的房间
export function switchRoom(index) {
	if (index < 0 || index >= roomsData.length) return;
	activeRoomIndex = index;
	const rd = roomsData[index];
	if (typeof rd.unreadCount === 'number') rd.unreadCount = 0;
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = rd.myUserName;
	setSidebarAvatar(rd.myUserName);
	renderRooms(index);
	renderMainHeader();
	renderUserList(false);
	renderChatArea();
	updateChatInputStyle()
}

// Set the sidebar avatar
// 设置侧边栏头像
export function setSidebarAvatar(userName) {
	if (!userName) return;
	const svg = createAvatarSVG(userName);
	const el = $id('sidebar-user-avatar');
	if (el) {
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		el.innerHTML = cleanSvg
	}
}

// Render the room list
// 渲染房间列表
export function renderRooms(activeId = 0) {
	const roomList = $id('room-list');
	roomList.innerHTML = '';
	roomsData.forEach((rd, i) => {
		const div = createElement('div', {
			class: 'room' + (i === activeId ? ' active' : ''),
			onclick: () => switchRoom(i)
		});
		const safeRoomName = escapeHTML(rd.roomName);
		let unreadHtml = '';
		if (rd.unreadCount && i !== activeId) {
			unreadHtml = `<span class="room-unread-badge">${rd.unreadCount>99?'99+':rd.unreadCount}</span>`
		}
		div.innerHTML = `<div class="info"><div class="title">#${safeRoomName}</div></div>${unreadHtml}`;
		roomList.appendChild(div)
	})
}

// Join a room
// 加入一个房间
export function joinRoom(userName, roomName, password, modal = null, onResult) {
	const newRd = getNewRoomData();
	newRd.roomName = roomName;
	newRd.myUserName = userName;
	newRd.password = password;
	roomsData.push(newRd);
	const idx = roomsData.length - 1;
	switchRoom(idx);
	const sidebarUsername = $id('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = userName;
	setSidebarAvatar(userName);
	let closed = false;
	const callbacks = {
		onServerClosed: () => {
			setStatus('Node connection closed');
			if (onResult && !closed) {
				closed = true;
				onResult(false)
			}
		},		onServerSecured: () => {
			if (modal) modal.remove();
			else {
				const loginContainer = $id('login-container');
				if (loginContainer) loginContainer.style.display = 'none';
				const chatContainer = $id('chat-container');
				if (chatContainer) chatContainer.style.display = '';
				

			}
			if (onResult && !closed) {
				closed = true;
				onResult(true)
			}
			addSystemMsg(t('system.secured', 'connection secured'))
		},
		onClientSecured: (user) => handleClientSecured(idx, user),
		onClientList: (list, selfId) => handleClientList(idx, list, selfId),
		onClientLeft: (clientId) => handleClientLeft(idx, clientId),
		onClientMessage: (msg) => handleClientMessage(idx, msg)
	};
	const chatInst = new window.NodeCrypt(window.config, callbacks);
	chatInst.setCredentials(userName, roomName, password);
	chatInst.connect();
	roomsData[idx].chat = chatInst
}

// Handle the client list update
// 处理客户端列表更新
export function handleClientList(idx, list, selfId) {
	const rd = roomsData[idx];
	if (!rd) return;
	const oldUserIds = new Set((rd.userList || []).map(u => u.clientId));
	const newUserIds = new Set(list.map(u => u.clientId));
	for (const oldId of oldUserIds) {
		if (!newUserIds.has(oldId)) {
			handleClientLeft(idx, oldId)
		}
	}
	rd.userList = list;
	rd.userMap = {};
	list.forEach(u => {
		rd.userMap[u.clientId] = u
	});
	rd.myId = selfId;
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	rd.initCount = (rd.initCount || 0) + 1;
	if (rd.initCount === 2) {
		rd.isInitialized = true;
		rd.knownUserIds = new Set(list.map(u => u.clientId))
	}
}

// Handle client secured event
// 处理客户端安全连接事件
export function handleClientSecured(idx, user) {
	const rd = roomsData[idx];
	if (!rd) return;
	rd.userMap[user.clientId] = user;
	const existingUserIndex = rd.userList.findIndex(u => u.clientId === user.clientId);
	if (existingUserIndex === -1) {
		rd.userList.push(user)
	} else {
		rd.userList[existingUserIndex] = user
	}
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	if (!rd.isInitialized) {
		return
	}
	const isNew = !rd.knownUserIds.has(user.clientId);
	if (isNew) {
		rd.knownUserIds.add(user.clientId);		const name = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
		const msg = `${name} ${t('system.joined', 'joined the conversation')}`;
		rd.messages.push({
			type: 'system',
			text: msg
		});
		if (activeRoomIndex === idx) addSystemMsg(msg, true);
		if (window.notifyMessage) {
			window.notifyMessage(rd.roomName, 'system', msg)
		}
	}
}

// Handle client left event
// 处理客户端离开事件
export function handleClientLeft(idx, clientId) {
	const rd = roomsData[idx];
	if (!rd) return;
	if (rd.privateChatTargetId === clientId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
		if (activeRoomIndex === idx) {
			updateChatInputStyle()
		}
	}
	const user = rd.userMap[clientId];
	const name = user ? (user.userName || user.username || user.name || 'Anonymous') : 'Anonymous';
	const msg = `${name} ${t('system.left', 'left the conversation')}`;
	rd.messages.push({
		type: 'system',
		text: msg
	});
	if (activeRoomIndex === idx) addSystemMsg(msg, true);
	
	// Remove the user from typingUsers set if they were typing when they left
	const potentialUserNames = new Set();
	if (user) {
		if (user.userName) potentialUserNames.add(user.userName);
		if (user.username) potentialUserNames.add(user.username);
		if (user.name) potentialUserNames.add(user.name);
	}
	
	let wasTyping = false;
	for (const potentialName of potentialUserNames) {
		if (typingUsers.has(potentialName)) {
			typingUsers.delete(potentialName);
			wasTyping = true;
		}
	}
	
	if (!wasTyping && user) {
		const userDisplayName = user.userName || user.username || user.name;
		if (userDisplayName) {
			for (const typingUserName of typingUsers) {
				if (typingUserName === userDisplayName) {
					typingUsers.delete(typingUserName);
					wasTyping = true;
					break;
				}
			}
		}
	}
	
	if (wasTyping && activeRoomIndex === idx) {
		let typingIndicator = document.getElementById('typing-indicator');
		
		if (typingUsers.size > 0) {
			const typingUsersArray = Array.from(typingUsers);
			let typingText = '';
			
			if (typingUsersArray.length === 1) {
				typingText = t('system.is_typing', '{user} is typing').replace('{user}', typingUsersArray[0]);
			} else if (typingUsersArray.length === 2) {
				typingText = t('system.are_typing', '{user1} and {user2} are typing')
					.replace('{user1}', typingUsersArray[0])
					.replace('{user2}', typingUsersArray[1]);
			} else {
				typingText = t('system.others_typing', '{user1}, {user2}, and others are typing')
					.replace('{user1}', typingUsersArray[0])
					.replace('{user2}', typingUsersArray[1]);
			}
			
			if (!typingIndicator) {
				typingIndicator = document.createElement('div');
				typingIndicator.id = 'typing-indicator';
				typingIndicator.className = 'typing-indicator';
				const textSpan = document.createElement('span');
				typingIndicator.appendChild(textSpan);
				const mainContainer = document.querySelector('.main');
				const chatArea = document.getElementById('chat-area');
				if (mainContainer && chatArea) {
					mainContainer.insertBefore(typingIndicator, chatArea);
				}
			}
			
			const textSpan = typingIndicator.querySelector('span');
			if (textSpan) {
				textSpan.textContent = typingText;
			}
			typingIndicator.style.display = 'block';
		} else {
			if (typingIndicator) {
				typingIndicator.style.display = 'none';
			}
		}
	}
	
	rd.userList = rd.userList.filter(u => u.clientId !== clientId);
	delete rd.userMap[clientId];
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
}

// Handle client message event
// 处理客户端消息事件
export function handleClientMessage(idx, msg) {
	const newRd = roomsData[idx];
	if (!newRd) return;

	// Prevent processing own messages unless it's a private message sent to oneself
	if (msg.clientId === newRd.myId && msg.userName === newRd.myUserName && !msg.type.includes('_private')) {
		return;
	}

	let msgType = msg.type || 'text';

	// Handle typing status messages
	if (msgType === 'typing' || msgType === 'typing_private') {
		// Only handle if it's the active room
		if (activeRoomIndex === idx) {
			let realUserName = msg.userName;
			if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
				realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
			}
			
			// Update typing status in UI
			updateTypingStatus(realUserName, msg.data);
		}
		return; // Typing messages are fully handled.
	}

	// Handle file messages
	if (msgType.startsWith('file_')) {
		// Part 1: Update message history and send notifications (for 'file_start' type)
		if (msgType === 'file_start' || msgType === 'file_start_private') {
			let realUserName = msg.userName;
			if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
				realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
			}
			const historyMsgType = msgType === 'file_start_private' ? 'file_private' : 'file';
			
			const fileId = msg.data && msg.data.fileId;
			if (fileId) { // Only proceed if we have a fileId
				const messageAlreadyInHistory = newRd.messages.some(
					m => m.msgType === historyMsgType && m.text && m.text.fileId === fileId && m.userName === realUserName
				);

				if (!messageAlreadyInHistory) {
					newRd.messages.push({
						type: 'other',
						text: msg.data, // This is the file metadata object
						userName: realUserName,
						avatar: realUserName,
						msgType: historyMsgType,
						timestamp: (msg.data && msg.data.timestamp) || Date.now() 
					});
				}
			}

			const notificationMsgType = msgType.includes('_private') ? 'private file' : 'file';
			if (window.notifyMessage && msg.data && msg.data.fileName) {
				window.notifyMessage(newRd.roomName, notificationMsgType, `${msg.data.fileName}`, realUserName);
			}
		}

		// Part 2: Handle UI interaction (rendering in active room, or unread count in inactive room)
		if (activeRoomIndex === idx) {
			// If it's the active room, delegate to util.file.js to handle UI and file transfer state.
			// This applies to all file-related messages (file_start, file_volume, file_end, etc.)
			if (window.handleFileMessage) {
				window.handleFileMessage(msg.data, msgType.includes('_private'));
			}
		} else {
			// If it's not the active room, only increment unread count for 'file_start' messages.
			if (msgType === 'file_start' || msgType === 'file_start_private') {
				newRd.unreadCount = (newRd.unreadCount || 0) + 1;
				renderRooms(activeRoomIndex);
			}
		}
		return; // File messages are fully handled.
	}

	// Handle image messages (both new and legacy formats)
	if (msgType === 'image' || msgType === 'image_private') {
		// Already has correct type
	} else if (!msgType.includes('_private')) {
		// Handle legacy image detection
		if (msg.data && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) {
			msgType = 'image';
		} else if (msg.data && typeof msg.data === 'object' && msg.data.image) {
			msgType = 'image';
		}
	}
	let realUserName = msg.userName;
	if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
		realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
	}

	// Add message to messages array for chat history
	roomsData[idx].messages.push({
		type: 'other',
		text: msg.data,
		userName: realUserName,
		avatar: realUserName,
		msgType: msgType,
		timestamp: Date.now()
	});

	// Only add message to chat display if it's for the active room
	if (activeRoomIndex === idx) {
		if (window.addOtherMsg) {
			window.addOtherMsg(msg.data, realUserName, realUserName, false, msgType);
		}
	} else {
		roomsData[idx].unreadCount = (roomsData[idx].unreadCount || 0) + 1;
		renderRooms(activeRoomIndex);
	}

	const notificationMsgType = msgType.includes('_private') ? `private ${msgType.split('_')[0]}` : msgType;
	if (window.notifyMessage) {
		window.notifyMessage(newRd.roomName, notificationMsgType, msg.data, realUserName);
	}
}

// Update typing status in UI
// 更新输入状态UI
export function updateTypingStatus(userName, isTyping) {
	let typingIndicator = document.getElementById('typing-indicator');
	
	if (isTyping) {
		// Add user to typing set
		typingUsers.add(userName);
	} else {
		// Remove user from typing set
		typingUsers.delete(userName);
	}
	
	// Create typing indicator if it doesn't exist
	if (!typingIndicator) {
		typingIndicator = document.createElement('div');
		typingIndicator.id = 'typing-indicator';
		typingIndicator.className = 'typing-indicator';
		// 创建一个span元素来容纳文本内容
		const textSpan = document.createElement('span');
		typingIndicator.appendChild(textSpan);
		// 将指示器添加到main容器中，放在chat-area上方
		const mainContainer = document.querySelector('.main');
		const chatArea = document.getElementById('chat-area');
		if (mainContainer && chatArea) {
			mainContainer.insertBefore(typingIndicator, chatArea);
		}
	}
	
	// Update typing indicator text based on number of typing users
	if (typingUsers.size > 0) {
		const typingUsersArray = Array.from(typingUsers);
		let typingText = '';
		
		if (typingUsersArray.length === 1) {
			// Single user typing - Telegram style: "User is typing"
			typingText = t('system.is_typing', '{user} is typing').replace('{user}', typingUsersArray[0]);
		} else if (typingUsersArray.length === 2) {
			// Two users typing - Telegram style: "User1 and User2 are typing"
			typingText = t('system.are_typing', '{user1} and {user2} are typing')
				.replace('{user1}', typingUsersArray[0])
				.replace('{user2}', typingUsersArray[1]);
		} else {
			// Multiple users typing - Telegram style: "User1, User2, and others are typing"
			typingText = t('system.others_typing', '{user1}, {user2}, and others are typing')
				.replace('{user1}', typingUsersArray[0])
				.replace('{user2}', typingUsersArray[1]);
		}
		
		// 将文本内容设置到span元素中
		const textSpan = typingIndicator.querySelector('span');
		if (textSpan) {
			textSpan.textContent = typingText;
		}
		typingIndicator.style.display = 'block';
	} else {
		// Hide typing indicator when no one is typing
		if (typingIndicator) {
			typingIndicator.style.display = 'none';
		}
	}
}

// Toggle private chat with a user
// 切换与某用户的私聊
export function togglePrivateChat(targetId, targetName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	if (rd.privateChatTargetId === targetId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null
	} else {
		rd.privateChatTargetId = targetId;
		rd.privateChatTargetName = targetName
	}
	renderUserList();
	updateChatInputStyle()
}


// Exit the current room
// 退出当前房间
export function exitRoom() {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const chatInst = roomsData[activeRoomIndex].chat;
		if (chatInst && typeof chatInst.destruct === 'function') {
			chatInst.destruct()
		} else if (chatInst && typeof chatInst.disconnect === 'function') {
			chatInst.disconnect()
		}
		roomsData[activeRoomIndex].chat = null;
		roomsData.splice(activeRoomIndex, 1);
		if (roomsData.length > 0) {
			switchRoom(0);
			return true
		} else {
			return false
		}
	}
	return false
}

// 定时清理5分钟前的聊天记录
// Clean up chat messages older than 5 minutes
function cleanupOldMessages() {
	const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
	let needsRender = false;
	
	roomsData.forEach((room, index) => {
		const originalLength = room.messages.length;
		room.messages = room.messages.filter(msg => {
			return msg.timestamp && msg.timestamp > fiveMinutesAgo;
		});
		
		// 如果当前房间是激活状态且消息被清理了，需要重新渲染
		if (index === activeRoomIndex && room.messages.length !== originalLength) {
			needsRender = true;
		}
	});
	
	if (needsRender) {
		renderChatArea();
	}
}

// 启动定时清理器，每30秒执行一次
// Start cleanup timer, run every 30 seconds
setInterval(cleanupOldMessages, 30000);

export { roomsData, activeRoomIndex };

// Listen for sidebar username update event
// 监听侧边栏用户名更新事件
window.addEventListener('updateSidebarUsername', () => {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const rd = roomsData[activeRoomIndex];
		const sidebarUsername = document.getElementById('sidebar-username');
		if (sidebarUsername && rd.myUserName) {
			sidebarUsername.textContent = rd.myUserName;
		}
		// Also update the avatar to ensure consistency
		if (rd.myUserName) {
			setSidebarAvatar(rd.myUserName);
		}
	}
});