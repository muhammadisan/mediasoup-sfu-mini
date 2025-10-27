import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import * as mediasoup from "mediasoup";
import { workerSettings, routerMediaCodecs, webRtcTransportOptions } from "./mediasoupConfig.js";
import { rooms, ensureRoom, removePeer } from "./rooms.js";

const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ["http://localhost:5173"], methods: ["GET", "POST"] } });

// Create a mediasoup Worker and a single Router shared across rooms (learning purpose)
const worker = await mediasoup.createWorker(workerSettings);
const router = await worker.createRouter({ mediaCodecs: routerMediaCodecs });

io.on("connection", (socket) => {
  console.log("[io] client connected:", socket.id);

  socket.on("join", async ({ roomId, name }, ack) => {
    try {
      if (!roomId || !name) return ack({ ok: false, error: "roomId and name required" });
      socket.join(roomId);

      const room = ensureRoom(roomId, router);
      room.peers.set(socket.id, { name, transports: new Set(), consumers: new Set(), producers: new Set(), rtpCapabilities: null });

      socket.data.roomId = roomId;
      socket.data.name = name;

      console.log(`[io] ${name} joined ${roomId}`);
      ack({ ok: true });
    } catch (e) {
      console.error("[io] join error:", e);
      ack({ ok: false, error: String(e) });
    }
  });

  socket.on("getRouterRtpCapabilities", (ack) => {
    try { ack({ ok: true, rtpCapabilities: router.rtpCapabilities }); }
    catch (e) { ack({ ok: false, error: String(e) }); }
  });

  socket.on("createWebRtcTransport", async ({ direction }, ack) => {
    try {
      const roomId = socket.data.roomId; if (!roomId) return ack({ ok: false, error: "not in room" });
      const room = rooms.get(roomId);
      const transport = await router.createWebRtcTransport(webRtcTransportOptions);

      room.peers.get(socket.id).transports.add(transport);

      transport.on("dtlsstatechange", (state) => {
        console.log(`[transport] ${direction} dtlsstate:`, state);
        if (state === "closed") transport.close();
      });

      transport.on("icestatechange", (state) => console.log(`[transport] ${direction} icestate:`, state));

      ack({ ok: true, params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters ?? undefined,
      }});

      // tag
      transport.appData = { direction, peerId: socket.id };
      socket.data[direction === "send" ? "sendTransport" : "recvTransport"] = transport;
    } catch (e) {
      console.error("[io] createWebRtcTransport error:", e);
      ack({ ok: false, error: String(e) });
    }
  });

  socket.on("connectWebRtcTransport", async ({ transportId, dtlsParameters }, ack) => {
    try {
      const roomId = socket.data.roomId; if (!roomId) return ack({ ok: false, error: "not in room" });
      const room = rooms.get(roomId);
      const peer = room.peers.get(socket.id);

      const transport = [...peer.transports].find(t => t.id === transportId);
      if (!transport) return ack({ ok: false, error: "transport not found" });

      await transport.connect({ dtlsParameters });
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: String(e) }); }
  });

  socket.on("produce", async ({ transportId, kind, rtpParameters }, ack) => {
    try {
      const roomId = socket.data.roomId; if (!roomId) return ack({ ok: false, error: "not in room" });
      const room = rooms.get(roomId);
      const peer = room.peers.get(socket.id);
      const transport = [...peer.transports].find(t => t.id === transportId);
      if (!transport) return ack({ ok: false, error: "send transport not found" });

      const producer = await transport.produce({ kind, rtpParameters });
      peer.producers.add(producer);
      room.producers.set(producer.id, { producer, peerId: socket.id, kind, name: socket.data.name });

      socket.to(roomId).emit("newProducer", { producerId: producer.id, peerId: socket.id, kind, name: socket.data.name });
      console.log(`[produce] ${socket.data.name} -> ${kind} (${producer.id})`);

      producer.on("transportclose", () => producer.close());
      producer.on("close", () => console.log(`[producer] closed ${producer.id}`));

      ack({ ok: true, id: producer.id });
    } catch (e) { ack({ ok: false, error: String(e) }); }
  });

  socket.on("getProducers", (ack) => {
    try {
      const roomId = socket.data.roomId; if (!roomId) return ack({ ok: false, error: "not in room" });
      const room = rooms.get(roomId);
      const list = [];
      for (const [id, info] of room.producers) {
        if (info.peerId !== socket.id) list.push({ producerId: id, peerId: info.peerId, kind: info.kind, name: info.name });
      }
      ack({ ok: true, producers: list });
    } catch (e) { ack({ ok: false, error: String(e) }); }
  });

  socket.on("consume", async ({ producerId, rtpCapabilities }, ack) => {
    try {
      const roomId = socket.data.roomId; if (!roomId) return ack({ ok: false, error: "not in room" });
      const room = rooms.get(roomId);
      const peer = room.peers.get(socket.id);
      const producerInfo = room.producers.get(producerId);
      if (!producerInfo) return ack({ ok: false, error: "producer not found" });

      if (!router.canConsume({ producerId, rtpCapabilities })) return ack({ ok: false, error: "incompatible rtpCapabilities" });

      const recvTransport = socket.data.recvTransport; // created earlier
      if (!recvTransport) return ack({ ok: false, error: "recv transport missing" });

      const consumer = await recvTransport.consume({ producerId, rtpCapabilities, paused: false });
      peer.consumers.add(consumer);

      consumer.on("transportclose", () => consumer.close());
      consumer.on("producerclose", () => {
        consumer.close();
        socket.emit("producerClosed", { producerId });
      });

      ack({ ok: true, params: {
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        producerId,
        peerId: producerInfo.peerId,
        name: producerInfo.name,
      }});
    } catch (e) { ack({ ok: false, error: String(e) }); }
  });

  const clean = () => {
    const roomId = socket.data.roomId; if (!roomId) return;
    const room = rooms.get(roomId); if (!room) return;

    for (const [prodId, info] of room.producers) {
      if (info.peerId === socket.id) socket.to(roomId).emit("producerClosed", { producerId: prodId });
    }

    removePeer(room, socket.id);
    socket.leave(roomId);
    console.log(`[io] ${socket.data.name || socket.id} left ${roomId}`);
  };

  socket.on("leave", clean);
  socket.on("disconnect", clean);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`\n[server] mediasoup SFU on http://localhost:${PORT}\n`));
