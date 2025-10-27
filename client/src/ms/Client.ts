import { Device } from "mediasoup-client";
import type { LogFn } from "../lib/Logger";
import { Sig } from "./Socket";
import type { NewProducerMsg, ProducerClosedMsg, ProducerInfo } from "./types";

export class MsClient {
  private sig: Sig;
  private log: LogFn;
  public device: Device | null = null;

  public sendTransport: any = null;
  public recvTransport: any = null;

  public localStream: MediaStream | null = null;
  public remoteStreams = new Map<string /*peerId*/, MediaStream>();
  public consumers = new Map<string /*consumerId*/, { peerId: string; consumer: any; kind: string }>();

  constructor(sig: Sig, log: LogFn) { this.sig = sig; this.log = log; }

  async join(roomId: string, name: string) {
    await this.sig.join(roomId, name);
    this.log(`Joined room ${roomId} as ${name}`);

    const rtpCapabilities = await this.sig.getRouterRtpCapabilities();
    this.log("Got router RTP capabilities.");

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
    this.log(`Device loaded. canProduce audio=${this.device.canProduce("audio")} video=${this.device.canProduce("video")}`);

    // Create transports
    const sendParams = await this.sig.createWebRtcTransport("send");
    this.sendTransport = this.device.createSendTransport(sendParams);

    this.sendTransport.on("connect", async ({ dtlsParameters }: any, cb: any, errb: any) => {
      try { await this.sig.connectWebRtcTransport(this.sendTransport.id, dtlsParameters); cb(); this.log("sendTransport CONNECTED"); }
      catch (e) { errb(e); }
    });

    this.sendTransport.on("connectionstatechange", (state: any) => this.log(`sendTransport state: ${state}`));

    this.sendTransport.on("produce", async ({ kind, rtpParameters }: any, cb: any, errb: any) => {
      try { const id = await this.sig.produce(this.sendTransport.id, kind, rtpParameters); cb({ id }); this.log(`Produced ${kind}: ${id}`); }
      catch (e) { errb(e); }
    });

    const recvParams = await this.sig.createWebRtcTransport("recv");
    this.recvTransport = this.device.createRecvTransport(recvParams);

    this.recvTransport.on("connect", async ({ dtlsParameters }: any, cb: any, errb: any) => {
      try { await this.sig.connectWebRtcTransport(this.recvTransport.id, dtlsParameters); cb(); this.log("recvTransport CONNECTED"); }
      catch (e) { errb(e); }
    });

    this.recvTransport.on("connectionstatechange", (state: any) => this.log(`recvTransport state: ${state}`));
  }

  setLocalStream(stream: MediaStream) { this.localStream = stream; }

  async publish(kind: "audio" | "video") {
    if (!this.device || !this.sendTransport || !this.localStream) throw new Error("not ready to publish");
    if (!this.device.canProduce(kind)) throw new Error(`device cannot produce ${kind}`);

    const track = (kind === "audio" ? this.localStream.getAudioTracks()[0] : this.localStream.getVideoTracks()[0]);
    if (!track) throw new Error(`${kind} track missing`);

    await this.sendTransport.produce({ track, encodings: kind === "video" ? [{ maxBitrate: 1000000 }] : undefined });
  }

  async subscribe(info: ProducerInfo, rtpCapabilities: any) {
    const params = await this.sig.consume(info.producerId, rtpCapabilities);
    const consumer = await this.recvTransport.consume({ id: params.id, producerId: params.producerId, kind: params.kind, rtpParameters: params.rtpParameters });

    let stream = this.remoteStreams.get(info.peerId);
    if (!stream) { stream = new MediaStream(); this.remoteStreams.set(info.peerId, stream); }
    stream.addTrack(consumer.track);

    // annotate track with consumer id to help later removal (optional)
    (consumer.track as any)._consumerId = consumer.id;

    this.consumers.set(consumer.id, { peerId: info.peerId, consumer, kind: params.kind });
    this.log(`Consuming ${params.kind} from ${info.name}`);

    return { stream, peerId: info.peerId, kind: params.kind, consumerId: consumer.id };
  }

  handleProducerClosed(msg: ProducerClosedMsg) {
    for (const [cid, { peerId, consumer }] of this.consumers) {
      if (consumer.producerId === msg.producerId) {
        consumer.close();
        this.consumers.delete(cid);
        const ms = this.remoteStreams.get(peerId);
        if (ms) {
          ms.getTracks().forEach(t => {
            if ((t as any)._consumerId === cid) t.stop();
          });
        }
      }
    }
  }
}
