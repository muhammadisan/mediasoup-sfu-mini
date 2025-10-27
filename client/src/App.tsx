import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoTile from "./components/VideoTile";
import { Logger } from "./lib/Logger";
import { useEvent } from "./lib/useEvent";
import { Sig } from "./ms/Socket";
import { MsClient } from "./ms/Client";
import type { NewProducerMsg, ProducerInfo, ProducerClosedMsg } from "./ms/types";

const SIGNALING_URL = "http://localhost:3001";

export default function App() {
  const [name, setName] = useState(() => `Guest-${Math.floor(Math.random() * 999)}`);
  const [roomId, setRoomId] = useState("ms-demo-room");
  const [joined, setJoined] = useState(false);

  const [logs, setLogs] = useState<any[]>([]);
  const logger = useMemo(() => new Logger((l) => setLogs((prev) => [...prev, l])), []);
  const log = useEvent((m: string, lvl?: "info" | "warn" | "error") => logger[lvl ?? "info"](m));

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const sigRef = useRef<Sig | null>(null);
  const msRef = useRef<MsClient | null>(null);

  const handleJoin = useEvent(async () => {
    try {
      log("Requesting camera + mic...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      const sig = new Sig(SIGNALING_URL);
      sigRef.current = sig;

      const ms = new MsClient(sig, log);
      msRef.current = ms;
      ms.setLocalStream(stream);

      // Socket events for dynamic subscription
      sig.on("connect", () => log(`Signaling connected (${(sig as any).socket.id})`));
      sig.on("disconnect", () => log("Signaling disconnected", "warn"));
      sig.on("newProducer", async (msg: NewProducerMsg) => {
        if (!msRef.current || !msRef.current.recvTransport) return;
        const rtpCaps = (msRef.current as any).device!.rtpCapabilities;
        await msRef.current.subscribe(msg, rtpCaps);
        forceRerender();
      });
      sig.on("producerClosed", (msg: ProducerClosedMsg) => {
        msRef.current?.handleProducerClosed(msg);
        forceRerender();
      });

      await ms.join(roomId, name);

      // Start publishing local tracks
      await ms.publish("audio");
      await ms.publish("video");

      // Subscribe to existing producers
      const existing: ProducerInfo[] = await sig.getProducers();
      const rtpCaps = (ms as any).device!.rtpCapabilities;
      for (const p of existing) {
        await ms.subscribe(p, rtpCaps);
      }

      setJoined(true);
      log(`Subscribed to ${existing.length} existing producer(s).`);
    } catch (e: any) {
      log(`JOIN error: ${e?.message || e}`, "error");
    }
  });

  const handleLeave = useEvent(() => {
    try {
      sigRef.current?.leave();
      msRef.current = null;
      setJoined(false);
      localStream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      log("Left room & stopped local tracks.", "warn");
    } catch (e: any) {
      log(`Leave error: ${e?.message || e}`, "error");
    }
  });

  const toggleMic = useEvent(() => {
    if (!localStream) return;
    const t = localStream.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled; setMicMuted(!t.enabled);
    log(`Mic ${t.enabled ? "unmuted" : "muted"}`);
  });

  const toggleCam = useEvent(() => {
    if (!localStream) return;
    const t = localStream.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled; setCamOff(!t.enabled);
    log(`Camera ${t.enabled ? "on" : "off"}`);
  });

  // derived list of remote streams (per peer)
  const [remoteStreamsVersion, setRSV] = useState(0);
  const forceRerender = () => setRSV(v => v + 1);
  const remote = Array.from(msRef.current?.remoteStreams.entries() ?? []);

  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  return (
    <div className="app">
      <div className="header">
        <div className="controls">
          {!joined ? (
            <>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Room ID" />
              <button className="primary" onClick={handleJoin}>Join</button>
            </>
          ) : (
            <>
              <button onClick={toggleMic}>{micMuted ? "Unmute Mic" : "Mute Mic"}</button>
              <button onClick={toggleCam}>{camOff ? "Camera On" : "Camera Off"}</button>
              <button className="danger" onClick={handleLeave}>Leave</button>
              <span style={{ marginLeft: 8, color: "#94a3b8" }}>Room: <b>{roomId}</b> · Remotes: <b>{remote.length}</b></span>
            </>
          )}
        </div>
      </div>

      <div className="grid">
        <VideoTile stream={localStream} label={`${name} (You)`} muted isMicMuted={micMuted} isCamOff={camOff} />
        {remote.map(([peerId, stream]) => (
          <VideoTile key={peerId} stream={stream} label={`Peer ${peerId.slice(0, 4)}…`} />
        ))}
      </div>

      <div className="panel">
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div>
            <div style={{ marginBottom: 6 }}>Logs</div>
            <div className="logs">
              {logs.map((l, i) => (
                <div key={i} className="log-line">
                  <span className="ts">[{l.ts}]</span>{" "}
                  <span className={l.level === "info" ? "ok" : l.level === "warn" ? "warn" : "err"}>{l.msg}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      <div className="footer">
        <small>Mediasoup SFU mini • Local demo. For public internet, set ANNOUNCED_IP and open UDP 40000‑49999.</small>
      </div>
    </div>
  );
}
