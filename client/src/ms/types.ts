export type NewProducerMsg = { producerId: string; peerId: string; kind: "audio" | "video"; name: string };
export type ProducerClosedMsg = { producerId: string };
export type ProducerInfo = { producerId: string; peerId: string; kind: "audio" | "video"; name: string };
