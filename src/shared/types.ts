export type SceneKind = "orbit" | "spectrum" | "wave" | "tunnel";
export type FrequencyScale = "log" | "linear";
export type ResponseSpeed = "fast" | "balanced" | "smooth";
export type FftResolution = "low" | "high" | "ultra";
export interface SceneSpectrum {
  minHz: number;
  maxHz: number;
  response: ResponseSpeed;
}
export interface SpectrumConfig {
  bands: number;
  scale: FrequencyScale;
  fft: FftResolution;
}
export interface Scene {
  id: string;
  name: string;
  kind: SceneKind;
  theme: string;
  intensity: number;
  speed: number;
  spectrum: SceneSpectrum;
}
export interface Analysis {
  bands: number[];
  wave: number[];
  rms: number;
  bass: number;
  beat: boolean;
  time: number;
}
export interface SpectrumStatus {
  sampleRate: number;
  nyquist: number;
  binHz: number;
  fftSize: number;
  bands: number;
  minHz: number;
  maxHz: number;
  error: string;
  warning: string;
}
export interface StageDocument {
  scenes: Scene[];
  activeId: string;
  gain: number;
  sensitivity: number;
  transition: number;
  blackout: boolean;
  frozen: boolean;
  strobe: boolean;
  master: number;
  spectrum: SpectrumConfig;
}
export interface Take {
  id: string;
  url: string;
  size: number;
  duration: number;
  name: string;
  mime: string;
}
export interface Theme {
  id: string;
  name: string;
  colors: [string, string, string];
  background: string;
}
