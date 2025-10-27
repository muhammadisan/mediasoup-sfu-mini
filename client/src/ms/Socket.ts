import { io, Socket } from "socket.io-client";

export class Sig {
  socket: Socket;
  constructor(url: string) { this.socket = io(url, { autoConnect: false }); }
  connect() { if (!this.socket.connected) this.socket.connect(); }
  disconnect() { if (this.socket.connected) this.socket.disconnect(); }
  on(ev: string, cb: (...args: any[]) => void) { this.socket.on(ev, cb); }
  off(ev: string, cb?: (...args: any[]) => void) { /* @ts-ignore */ this.socket.off(ev, cb); }

  join(roomId: string, name: string) {
    this.connect();
    return new Promise<void>((res, rej) => {
      this.socket.emit("join", { roomId, name }, (r: any) => r?.ok ? res() : rej(r?.error || "join failed"));
    });
  }

  getRouterRtpCapabilities() {
    return new Promise<any>((res, rej) => {
      this.socket.emit("getRouterRtpCapabilities", (r: any) => r?.ok ? res(r.rtpCapabilities) : rej(r?.error));
    });
  }

  createWebRtcTransport(direction: "send" | "recv") {
    return new Promise<any>((res, rej) => {
      this.socket.emit("createWebRtcTransport", { direction }, (r: any) => r?.ok ? res(r.params) : rej(r?.error));
    });
  }

  connectWebRtcTransport(transportId: string, dtlsParameters: any) {
    return new Promise<void>((res, rej) => {
      this.socket.emit("connectWebRtcTransport", { transportId, dtlsParameters }, (r: any) => r?.ok ? res() : rej(r?.error));
    });
  }

  produce(transportId: string, kind: "audio" | "video", rtpParameters: any) {
    return new Promise<string>((res, rej) => {
      this.socket.emit("produce", { transportId, kind, rtpParameters }, (r: any) => r?.ok ? res(r.id) : rej(r?.error));
    });
  }

  getProducers() {
    return new Promise<any[]>((res, rej) => {
      this.socket.emit("getProducers", (r: any) => r?.ok ? res(r.producers) : rej(r?.error));
    });
  }

  consume(producerId: string, rtpCapabilities: any) {
    return new Promise<any>((res, rej) => {
      this.socket.emit("consume", { producerId, rtpCapabilities }, (r: any) => r?.ok ? res(r.params) : rej(r?.error));
    });
  }

  leave() { this.socket.emit("leave"); this.disconnect(); }
}
