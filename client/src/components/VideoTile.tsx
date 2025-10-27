import React, { useEffect, useRef } from "react";

export default function VideoTile({ stream, label, muted, isMicMuted, isCamOff }:
  { stream: MediaStream | null; label: string; muted?: boolean; isMicMuted?: boolean; isCamOff?: boolean; }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      if (stream) {
        ref.current.srcObject = stream;
        ref.current.play().catch(() => {});
      } else {
        (ref.current as any).srcObject = null;
      }
    }
  }, [stream]);
  return (
    <div className="tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <div className="badge">{label}</div>
      {isMicMuted && <div className="muted">🔇</div>}
      {isCamOff && <div className="muted" style={{ top: 28 }}>📷❌</div>}
    </div>
  );
}
