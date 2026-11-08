import { io } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const socketUrl = apiUrl.replace(/\/api\/?$/, '');

let clientSocket = null;
const registeredListeners = new Map();

function getOrCreateSocket() {
  if (!clientSocket) {
    clientSocket = io(socketUrl, {
      autoConnect: false,
      auth: (cb) => {
        cb({ token: localStorage.getItem('peerza_token') });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000
    });

    // Register existing listeners
    for (const [event, handlers] of registeredListeners) {
      for (const handler of handlers) {
        clientSocket.on(event, handler);
      }
    }

    clientSocket.on('connect_error', (err) => {
      console.warn('Realtime connection error:', err.message);
    });
  }
  return clientSocket;
}

export const socket = {
  get connected() {
    return Boolean(clientSocket?.connected);
  },
  on(event, handler) {
    if (!registeredListeners.has(event)) {
      registeredListeners.set(event, new Set());
    }
    registeredListeners.get(event).add(handler);
    if (clientSocket) {
      clientSocket.on(event, handler);
    }
    return this;
  },
  off(event, handler) {
    registeredListeners.get(event)?.delete(handler);
    if (clientSocket) {
      clientSocket.off(event, handler);
    }
    return this;
  },
  emit(...args) {
    const s = getOrCreateSocket();
    s.emit(...args);
    return this;
  },
  disconnect() {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    return this;
  }
};

export function connectRealtime() {
  const token = localStorage.getItem('peerza_token');
  if (!token) return null;
  const s = getOrCreateSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectRealtime() {
  if (clientSocket) {
    clientSocket.disconnect();
  }
}
