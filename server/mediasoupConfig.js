export const workerSettings = {
  rtcMinPort: 40000,
  rtcMaxPort: 49999,
  logLevel: "warn",
  logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
};

export const routerMediaCodecs = [
  // Opus audio
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  // VP8 video (keep it simple; you can add H264/VP9/AV1 later)
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 }
  }
];

export const webRtcTransportOptions = {
  listenIps: [
    // For localhost learning:
    { ip: process.env.LISTEN_IP || "127.0.0.1", announcedIp: process.env.ANNOUNCED_IP || undefined },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  enableSctp: true,
  initialAvailableOutgoingBitrate: 1000000,
  appData: {}
};
