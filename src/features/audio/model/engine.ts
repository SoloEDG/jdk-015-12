import { reactive, shallowRef } from "vue";
import type { Analysis, StageDocument, SpectrumStatus } from "../../../shared/types";
import { demoBuffer } from "../lib/demo";
import { SpectrumEngine } from "../lib/spectrum";

const EMPTY_BANDS = 64;

export function createAudio(doc: StageDocument) {
  const state = reactive({
    playing: false,
    source: "demo",
    name: "Midnight / 120 BPM",
    duration: 16,
    position: 0,
    error: "",
    loading: false,
  });
  const spectrumStatus = reactive<SpectrumStatus>({
    sampleRate: 0,
    nyquist: 0,
    binHz: 0,
    fftSize: 0,
    bands: doc.spectrum.bands,
    minHz: 0,
    maxHz: 0,
    error: "",
    warning: "",
  });
  const frame = shallowRef<Analysis>({
    bands: Array(EMPTY_BANDS).fill(0),
    wave: Array(256).fill(0),
    rms: 0,
    bass: 0,
    beat: false,
    time: 0,
  });
  let ctx: AudioContext,
    engine: SpectrumEngine;
  let buffer: AudioBuffer,
    node: AudioBufferSourceNode | MediaStreamAudioSourceNode | undefined,
    mic: MediaStream | undefined;
  let origin = 0,
    offset = 0,
    epoch = 0,
    raf = 0;

  function init() {
    if (ctx) return;
    ctx = new AudioContext();
    engine = new SpectrumEngine(ctx, spectrumStatus);
    buffer = demoBuffer(ctx);
  }

  function activeScene() {
    return doc.scenes.find((s) => s.id === doc.activeId) ?? doc.scenes[0];
  }

  function detach() {
    if (node) {
      if (node instanceof AudioBufferSourceNode) {
        node.onended = null;
        try {
          node.stop();
        } catch {}
      }
      node.disconnect();
      node = undefined;
    }
    mic?.getTracks().forEach((t) => t.stop());
    mic = undefined;
  }

  function pump() {
    if (!ctx) return;
    // 每帧按当前场景/全局配置同步；频段数量、范围、采样率变化都在这里平滑衔接。
    engine.sync(doc.spectrum, activeScene().spectrum);
    engine.setMonitorGain(doc.gain, state.source === "mic");
    state.position = state.playing ? offset + ctx.currentTime - origin : offset;
    frame.value = engine.read(state.position);
    raf = requestAnimationFrame(pump);
  }

  async function play() {
    init();
    await ctx.resume();
    if (state.playing) return;
    if (state.source === "mic") {
      await microphone();
      return;
    }
    node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    engine.attach(node);
    origin = ctx.currentTime;
    node.start(0, offset % buffer.duration);
    state.playing = true;
    if (!raf) pump();
  }

  function pause() {
    if (!state.playing) return;
    offset = state.position;
    detach();
    engine.softReset();
    state.playing = false;
  }

  async function file(file: File) {
    init();
    const ticket = ++epoch;
    state.loading = true;
    state.error = "";
    try {
      const next = await ctx.decodeAudioData(await file.arrayBuffer());
      if (ticket !== epoch) return;
      detach();
      buffer = next;
      offset = 0;
      state.position = 0;
      state.playing = false;
      state.source = "file";
      state.name = file.name;
      state.duration = next.duration;
      await play();
    } catch {
      if (ticket === epoch)
        state.error = "无法解码此音频，请选择有效的音频文件。";
    } finally {
      if (ticket === epoch) state.loading = false;
    }
  }

  async function microphone() {
    init();
    const ticket = ++epoch;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (ticket !== epoch) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      detach();
      mic = stream;
      node = ctx.createMediaStreamSource(stream);
      engine.attach(node);
      state.source = "mic";
      state.name = "Live microphone";
      state.playing = true;
      offset = 0;
      origin = ctx.currentTime;
      await ctx.resume();
      if (!raf) pump();
    } catch {
      state.error = "麦克风不可用或未获授权，原有音源已保留。";
    }
  }

  async function demo() {
    init();
    ++epoch;
    detach();
    buffer = demoBuffer(ctx);
    state.source = "demo";
    state.name = "Midnight / 120 BPM";
    offset = 0;
    state.playing = false;
    state.duration = 16;
    await play();
  }

  function dispose() {
    ++epoch;
    cancelAnimationFrame(raf);
    detach();
    void ctx?.close();
  }

  return {
    state,
    frame,
    spectrumStatus,
    play,
    pause,
    file,
    microphone,
    demo,
    dispose,
    stream: () => {
      init();
      return engine.stream;
    },
  };
}

export type AudioEngine = ReturnType<typeof createAudio>;
