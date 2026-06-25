import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) {
    socket.disconnect();
  }

  // The socket authenticates with the same JWT access token already
  // used for REST calls — sent once at connect time via the `auth`
  // payload, no separate login flow for sockets.
  socket = io(SOCKET_URL, {
    auth: { token: getAccessToken() },
    withCredentials: true,
    transports: ["websocket", "polling"],
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}