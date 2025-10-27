export const rooms = new Map(); // roomId -> { router, peers: Map<socketId, Peer>, producers: Map<producerId, { producer, peerId, kind, name }> }

export function ensureRoom(roomId, router) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { router, peers: new Map(), producers: new Map() });
  }
  return rooms.get(roomId);
}

export function removePeer(room, socketId) {
  const peer = room.peers.get(socketId);
  if (!peer) return;
  // Close transports and their children
  for (const t of peer.transports) {
    try { t.close(); } catch {}
  }
  // Remove their producers
  const toDelete = [];
  for (const [prodId, info] of room.producers.entries()) {
    if (info.peerId === socketId) toDelete.push(prodId);
  }
  toDelete.forEach((id) => room.producers.delete(id));
  room.peers.delete(socketId);
}
