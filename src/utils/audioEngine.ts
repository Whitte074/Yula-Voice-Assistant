// Audio Engine for YULA: handles 16kHz PCM encoding, 24kHz gapless Live API playback,
// WAV TTS playback with timbre detune & real-time AnalyserNode spectrum extraction.

export function float32ToPcm16Base64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }
  return btoa(binary);
}

export function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const numSamples = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768.0;
  }
  return float32;
}

export class YulaSoundEngine {
  private outputCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private currentWavAudio: HTMLAudioElement | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;

  private ensureContext(): AudioContext {
    if (!this.outputCtx || this.outputCtx.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.outputCtx = new AudioCtx({ sampleRate: 24000 });
      this.analyser = this.outputCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.analyser.connect(this.outputCtx.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.outputCtx.state === "suspended") {
      this.outputCtx.resume().catch(() => {});
    }
    return this.outputCtx;
  }

  // Schedule gapless 24kHz PCM chunk from Gemini Live API
  public playLivePcmChunk(
    base64Pcm: string,
    detuneCents = 0,
    onEndedAll?: () => void
  ): void {
    const ctx = this.ensureContext();
    const float32 = base64ToFloat32Array(base64Pcm);
    if (float32.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    if (detuneCents !== 0 && source.detune) {
      source.detune.value = detuneCents;
    }
    source.connect(this.analyser || ctx.destination);

    const now = ctx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.02;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && onEndedAll) {
        onEndedAll();
      }
    };
  }

  // Play complete WAV base64 from Gemini TTS (gemini-3.8-flash-lite-tts) with timbre detune
  public async playWavBase64(
    base64Wav: string,
    detuneCents = 0,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stopAllPlayback();
    const ctx = this.ensureContext();

    try {
      const binary = atob(base64Wav);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const decodedBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = decodedBuffer;
      if (detuneCents !== 0 && source.detune) {
        source.detune.value = detuneCents;
      }
      source.connect(this.analyser || ctx.destination);

      this.activeSources.add(source);
      if (onStart) onStart();

      source.start(0);
      source.onended = () => {
        this.activeSources.delete(source);
        if (onEnd) onEnd();
      };
    } catch {
      const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
      this.currentWavAudio = audio;
      if (onStart) onStart();
      audio.onended = () => {
        this.currentWavAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = () => {
        this.currentWavAudio = null;
        if (onEnd) onEnd();
      };
      await audio.play();
    }
  }

  public stopAllPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    }
    if (this.currentWavAudio) {
      this.currentWavAudio.pause();
      this.currentWavAudio = null;
    }
  }

  // Returns normalized energy [0..1] and 32 frequency bands for the YULA Holographic Orb
  public getAudioTelemetry(): { energy: number; bands: number[] } {
    if (!this.analyser || !this.dataArray) {
      return { energy: 0, bands: new Array(32).fill(0) };
    }
    this.analyser.getByteFrequencyData(this.dataArray);
    let sum = 0;
    const bands: number[] = [];
    const step = Math.max(1, Math.floor(this.dataArray.length / 32));
    for (let i = 0; i < 32; i++) {
      const val = (this.dataArray[i * step] || 0) / 255;
      bands.push(val);
      sum += val;
    }
    return {
      energy: Math.min(1, (sum / 32) * 1.45),
      bands,
    };
  }

  // Subtle J.A.R.V.I.S.-style harmonic UI cues
  public playHudCue(type: "wake" | "confirm" | "alert" | "deactivate"): void {
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "wake") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === "confirm") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(990, now + 0.12);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === "deactivate") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.15);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === "alert") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174.66, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch {
      // Ignore if audio context not unlocked yet
    }
  }
}

export const soundEngine = new YulaSoundEngine();
