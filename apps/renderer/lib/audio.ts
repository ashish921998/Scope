export const float32ToPcm16Base64 = (input: Float32Array) => {
  const pcm16 = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const AUDIO_PROCESSOR_WORKLET = `
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}
registerProcessor("scope-audio-processor", AudioProcessor);
`;

export const captureMicPcm16Chunk = async (durationMs: number, sampleRate = 24000) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext({ sampleRate });

  const blob = new Blob([AUDIO_PROCESSOR_WORKLET], { type: "application/javascript" });
  const workletUrl = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(ctx, "scope-audio-processor");
  const chunks: Float32Array[] = [];

  workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
    chunks.push(event.data);
  };

  source.connect(workletNode);
  workletNode.connect(ctx.destination);
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  workletNode.disconnect();
  source.disconnect();
  stream.getTracks().forEach((track) => track.stop());
  await ctx.close();

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return float32ToPcm16Base64(merged);
};
