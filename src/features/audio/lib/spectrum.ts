import type {
  Analysis,
  FftResolution,
  FrequencyScale,
  ResponseSpeed,
  SceneSpectrum,
  SpectrumConfig,
  SpectrumStatus,
} from "../../../shared/types";

/**
 * 响应预设：attack 是能量上升（鼓点）时间常数，release 是下降（衰减）时间常数。
 * 数值越短越跟手，越长越稳定。鼓点走独立的小窗分析器，不受频谱窗长影响。
 */
export const RESPONSE_PRESETS: Record<
  ResponseSpeed,
  { label: string; attackMs: number; releaseMs: number; hint: string }
> = {
  fast: {
    label: "敏捷",
    attackMs: 25,
    releaseMs: 110,
    hint: "鼓点即时跳动 / 看得到也听得到的跟手",
  },
  balanced: {
    label: "均衡",
    attackMs: 70,
    releaseMs: 260,
    hint: "兼顾层次与稳定 / 现场推荐",
  },
  smooth: {
    label: "绵密",
    attackMs: 180,
    releaseMs: 600,
    hint: "氛围铺底 / 平滑长线条",
  },
};

export const FFT_PRESETS: Record<
  FftResolution,
  { label: string; fftSize: number }
> = {
  low: { label: "标准 2048", fftSize: 2048 },
  high: { label: "高解析 8192", fftSize: 8192 },
  ultra: { label: "极致 16384", fftSize: 16384 },
};

export const SCALE_OPTIONS: { value: FrequencyScale; label: string }[] = [
  { value: "log", label: "对数 / 按音符" },
  { value: "linear", label: "线性 / 按频率" },
];

export const RANGE_PRESETS: { label: string; minHz: number; maxHz: number }[] =
  [
    { label: "低音区", minHz: 30, maxHz: 250 },
    { label: "全频段", minHz: 30, maxHz: 16000 },
    { label: "人声区", minHz: 200, maxHz: 4000 },
    { label: "高频区", minHz: 2000, maxHz: 16000 },
  ];

const MIN_FREQ = 20;
const REFRESH_MS = 1000 / 60;
// 重建状态后的保护帧：每帧只允许这么大幅度，杜绝一帧满屏峰值。
const GUARD_FRAMES = 12;
const GUARD_STEP = 0.18;

export interface RangeCheck {
  error: string;
  warning: string;
  minHz: number;
  maxHz: number;
}

/** 校验场景频段范围，返回裁剪后的明确结果与提示文案。 */
export function checkRange(
  raw: SceneSpectrum,
  nyquist: number,
  binHz: number,
): RangeCheck {
  const warning: string[] = [];
  let { minHz, maxHz } = raw;
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz))
    return {
      minHz: MIN_FREQ,
      maxHz: nyquist,
      error: "频段数值无效，已恢复为 20Hz–奈奎斯特范围。",
      warning: "",
    };
  if (minHz < MIN_FREQ) {
    warning.push(`下限低于可分析的 ${MIN_FREQ}Hz，已按 ${MIN_FREQ}Hz 处理`);
    minHz = MIN_FREQ;
  }
  if (maxHz > nyquist) {
    warning.push(
      `上限 ${Math.round(raw.maxHz)}Hz 超出有效频率（奈奎斯特 ${Math.round(
        nyquist,
      )}Hz），已按奈奎斯特处理`,
    );
    maxHz = nyquist;
  }
  if (maxHz <= minHz) {
    return {
      minHz: MIN_FREQ,
      maxHz: nyquist,
      error: `频段范围过窄（${Math.round(raw.minHz)}–${Math.round(
        raw.maxHz,
      )}Hz），无法形成有效频段，已恢复全范围。`,
      warning: "",
    };
  }
  if (maxHz - minHz < binHz * 2)
    warning.push(
      `范围窄于两个频率格（每格 ${binHz.toFixed(1)}Hz），相邻频段会共享同一格数据`,
    );
  return { minHz, maxHz, error: "", warning: warning.join("；") };
}

/** 按对数（等比/半音）或线性刻度生成 bands+1 条边界频率。 */
export function bandEdges(
  minHz: number,
  maxHz: number,
  bands: number,
  scale: FrequencyScale,
): number[] {
  const edges = new Array<number>(bands + 1);
  if (scale === "log") {
    const lo = Math.max(MIN_FREQ, minHz),
      span = Math.log(maxHz / lo);
    for (let i = 0; i <= bands; i++)
      edges[i] = lo * Math.exp((span * i) / bands);
  } else {
    for (let i = 0; i <= bands; i++)
      edges[i] = minHz + ((maxHz - minHz) * i) / bands;
  }
  return edges;
}

/** 每个频段覆盖的 FFT bin 区间（跳过直流 bin 0）。 */
export function bandBinRanges(
  edges: number[],
  binHz: number,
  binCount: number,
): { start: number; end: number }[] {
  const last = binCount - 1;
  return edges.slice(0, -1).map((lo, i) => ({
    start: Math.min(last, Math.max(1, Math.floor(lo / binHz))),
    end: Math.min(last, Math.max(1, Math.ceil(edges[i + 1] / binHz))),
  }));
}

function rawBands(freq: Uint8Array, ranges: { start: number; end: number }[]) {
  const out = new Array<number>(ranges.length);
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    let sum = 0;
    for (let b = start; b < end; b++) sum += freq[b];
    out[i] = sum / Math.max(1, end - start) / 255;
  }
  return out;
}

/**
 * 配置变更时按频段中心频率迁移旧平滑值，数量改变或采样率变化都不会丢状态或冲顶。
 */
function remapSmooth(
  prev: number[],
  prevEdges: number[],
  nextEdges: number[],
): number[] {
  if (!prev.length || !prevEdges.length) return new Array(nextEdges.length - 1).fill(0);
  const center = (edges: number[], i: number) =>
    Math.sqrt(edges[i] * edges[i + 1]);
  return nextEdges.slice(0, -1).map((_, i) => {
    const f = center(nextEdges, i);
    let k = 0;
    for (let j = 0; j < prev.length; j++) {
      if (center(prevEdges, j) <= f) k = j;
      else break;
    }
    const k2 = Math.min(prev.length - 1, k + 1);
    const a = center(prevEdges, k),
      b = center(prevEdges, k2);
    const mix = b === a ? 0 : (f - a) / (b - a);
    return prev[k] * (1 - mix) + prev[k2] * mix;
  });
}

const alphaFor = (tauMs: number, dtMs: number) =>
  1 - Math.exp(-dtMs / Math.max(1, tauMs));

export class SpectrumEngine {
  private ctx: AudioContext;
  private tap: GainNode;
  private monitor: GainNode;
  private mediaDest: MediaStreamAudioDestinationNode;
  private spectrum: AnalyserNode;
  private transient: AnalyserNode;
  private freqBytes: Uint8Array<ArrayBuffer>;
  private fastBytes: Uint8Array<ArrayBuffer>;
  private waveBytes: Uint8Array<ArrayBuffer>;
  private status: SpectrumStatus;

  private bands = 64;
  private scale: FrequencyScale = "log";
  private scene: SceneSpectrum = { minHz: 30, maxHz: 16000, response: "balanced" };
  private edges: number[] = [];
  private ranges: { start: number; end: number }[] = [];
  private smooth: number[] = [];
  private guard = 0;
  private lastTs = 0;
  private prevBass = 0;
  private beatCooldown = 0;
  private readonly now: () => number;

  constructor(
    ctx: AudioContext,
    status: SpectrumStatus,
    now: () => number = () => performance.now(),
  ) {
    this.ctx = ctx;
    this.status = status;
    this.now = now;
    status.sampleRate = ctx.sampleRate;
    status.nyquist = ctx.sampleRate / 2;
    // tap 是无源分支节点：只做分析/录制取信号，不触碰播放链路的音高与音色。
    this.tap = ctx.createGain();
    this.tap.gain.value = 1;
    this.monitor = ctx.createGain();
    this.monitor.gain.value = 0.65;
    this.mediaDest = ctx.createMediaStreamDestination();
    this.spectrum = ctx.createAnalyser();
    this.transient = ctx.createAnalyser();
    this.applyAnalyserSizes(FFT_PRESETS.high.fftSize, 1024);
    this.tap.connect(this.monitor);
    this.monitor.connect(ctx.destination);
    this.tap.connect(this.mediaDest);
    this.tap.connect(this.spectrum);
    this.tap.connect(this.transient);
    this.freqBytes = new Uint8Array(this.spectrum.frequencyBinCount);
    this.fastBytes = new Uint8Array(this.transient.frequencyBinCount);
    this.waveBytes = new Uint8Array(this.transient.fftSize);
  }

  get stream(): MediaStream {
    return this.mediaDest.stream;
  }

  setMonitorGain(g: number, muted: boolean) {
    this.monitor.gain.value = muted ? 0 : g;
  }

  attach(node: AudioNode) {
    node.connect(this.tap);
    // 换音源不重建分析器，但平滑状态需要软着陆，避免旧能量被当成新信号冲一帧。
    this.softReset();
  }

  /** 音源切换/暂停后的软衔接：保留衰减中的能量但限制跳变，并抑制一拍假触发。 */
  softReset() {
    this.guard = Math.max(this.guard, GUARD_FRAMES);
    this.beatCooldown = 8;
  }

  /** 测试用：清除保护帧，观察响应预设的原始时间常数差异。 */
  clearGuard() {
    this.guard = 0;
  }

  private applyAnalyserSizes(fftSize: number, fastSize: number) {
    this.spectrum.fftSize = fftSize;
    // 分析器自带平滑全部关闭，统一由按场景响应预设的逐频段 EMA 接管。
    this.spectrum.smoothingTimeConstant = 0;
    this.spectrum.minDecibels = -90;
    this.spectrum.maxDecibels = -10;
    this.transient.fftSize = fastSize;
    this.transient.smoothingTimeConstant = 0;
    this.transient.minDecibels = -90;
    this.transient.maxDecibels = -10;
    this.freqBytes = new Uint8Array(this.spectrum.frequencyBinCount);
    this.fastBytes = new Uint8Array(this.transient.frequencyBinCount);
    this.waveBytes = new Uint8Array(this.transient.fftSize);
  }

  private rebuildAnalysers(fftSize: number) {
    this.tap.disconnect();
    this.tap.connect(this.monitor);
    this.tap.connect(this.mediaDest);
    this.tap.connect(this.spectrum);
    this.tap.connect(this.transient);
    this.applyAnalyserSizes(fftSize, 1024);
    this.guard = Math.max(this.guard, GUARD_FRAMES);
  }

  /** 采样率（如切换不同采样率的音频设备/上下文）变化时整体重建并迁移状态。 */
  private syncSampleRate() {
    const rate = this.ctx.sampleRate;
    if (rate === this.status.sampleRate && this.status.nyquist > 0) return;
    const fftSize = this.spectrum.fftSize;
    this.tap.disconnect(this.spectrum);
    this.tap.disconnect(this.transient);
    this.spectrum.disconnect();
    this.transient.disconnect();
    this.spectrum = this.ctx.createAnalyser();
    this.transient = this.ctx.createAnalyser();
    this.tap.connect(this.spectrum);
    this.tap.connect(this.transient);
    this.applyAnalyserSizes(fftSize, 1024);
    this.guard = GUARD_FRAMES;
  }

  /** 响应全局/场景配置变化：重建频段映射，平滑状态按频率迁移而非清空。 */
  sync(cfg: SpectrumConfig, scene: SceneSpectrum) {
    this.syncSampleRate();
    const fftSize = FFT_PRESETS[cfg.fft].fftSize;
    if (fftSize !== this.spectrum.fftSize) this.rebuildAnalysers(fftSize);

    const nyquist = this.ctx.sampleRate / 2;
    const binHz = this.ctx.sampleRate / this.spectrum.fftSize;
    const check = checkRange(scene, nyquist, binHz);

    const prevEdges = this.edges;
    const prevSmooth = this.smooth;
    const edgesChanged =
      this.bands !== cfg.bands ||
      this.scale !== cfg.scale ||
      this.scene.minHz !== check.minHz ||
      this.scene.maxHz !== check.maxHz;

    this.bands = cfg.bands;
    this.scale = cfg.scale;
    this.scene = { ...scene, minHz: check.minHz, maxHz: check.maxHz };
    this.edges = bandEdges(check.minHz, check.maxHz, cfg.bands, cfg.scale);
    this.ranges = bandBinRanges(this.edges, binHz, this.freqBytes.length);

    if (edgesChanged || prevSmooth.length !== cfg.bands) {
      this.smooth = remapSmooth(prevSmooth, prevEdges, this.edges);
      this.guard = Math.max(this.guard, GUARD_FRAMES);
    }

    Object.assign(this.status, {
      sampleRate: this.ctx.sampleRate,
      nyquist,
      binHz,
      fftSize: this.spectrum.fftSize,
      bands: cfg.bands,
      minHz: check.minHz,
      maxHz: check.maxHz,
      error: check.error,
      warning: check.warning,
    });
  }

  private readBass(): number {
    this.transient.getByteFrequencyData(this.fastBytes);
    const binHz = this.ctx.sampleRate / this.transient.fftSize;
    const end = Math.min(this.fastBytes.length, Math.max(2, Math.round(160 / binHz)));
    let sum = 0;
    for (let i = 1; i < end; i++) sum += this.fastBytes[i];
    return sum / (end - 1) / 255;
  }

  read(time: number): Analysis {
    const now = this.now();
    const dt = this.lastTs ? Math.min(100, now - this.lastTs) : REFRESH_MS;
    this.lastTs = now;

    this.spectrum.getByteFrequencyData(this.freqBytes);
    this.transient.getByteTimeDomainData(this.waveBytes);
    const wave = Array.from(this.waveBytes, (v) => (v - 128) / 128);
    const rms = Math.sqrt(wave.reduce((s, v) => s + v * v, 0) / wave.length);

    const target = rawBands(this.freqBytes, this.ranges);
    const preset = RESPONSE_PRESETS[this.scene.response];
    const up = alphaFor(preset.attackMs, dt);
    const down = alphaFor(preset.releaseMs, dt);

    for (let i = 0; i < this.bands; i++) {
      const v = target[i] ?? 0;
      const prev = this.smooth[i] ?? 0;
      let next = prev + (v - prev) * (v > prev ? up : down);
      if (this.guard > 0 && next - prev > GUARD_STEP) next = prev + GUARD_STEP;
      this.smooth[i] = Math.max(0, Math.min(1, next));
    }
    if (this.guard > 0) this.guard--;

    // 鼓点/节拍走独立的 1024 小窗：约 23ms 延迟，长频谱窗不会拖慢鼓点。
    const bass = this.readBass();
    let beat = false;
    if (this.beatCooldown > 0) this.beatCooldown--;
    else if (bass > 0.23 && bass > this.prevBass * 1.12) {
      beat = true;
      this.beatCooldown = 6;
    }
    this.prevBass = bass;

    return {
      bands: this.smooth.slice(),
      wave,
      rms,
      bass,
      beat,
      time,
    };
  }
}
