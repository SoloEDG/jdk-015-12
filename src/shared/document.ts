import { reactive } from "vue";
import type { StageDocument } from "./types";

const spectrum = (
  minHz: number,
  maxHz: number,
  response: "fast" | "balanced" | "smooth" = "balanced",
) => ({ minHz, maxHz, response });

export function createDocument(): StageDocument {
  return reactive({
    scenes: [
      {
        id: "s1",
        name: "Celestial orbit",
        kind: "orbit",
        theme: "violet",
        intensity: 0.8,
        speed: 1,
        // 环形偏低频表现，突出贝斯与底鼓的层次。
        spectrum: spectrum(30, 4000, "balanced"),
      },
      {
        id: "s2",
        name: "Frequency field",
        kind: "spectrum",
        theme: "mint",
        intensity: 0.75,
        speed: 1,
        // 柱状展示完整音乐频段，敏捷响应让每个音符都看得见。
        spectrum: spectrum(30, 16000, "fast"),
      },
      {
        id: "s3",
        name: "Liquid signal",
        kind: "wave",
        theme: "ember",
        intensity: 0.7,
        speed: 0.6,
        // 波形场景只用时域数据；频谱设置保留，切回频谱类场景即恢复。
        spectrum: spectrum(200, 4000, "smooth"),
      },
      {
        id: "s4",
        name: "Into the void",
        kind: "tunnel",
        theme: "ice",
        intensity: 0.9,
        speed: 1.2,
        spectrum: spectrum(40, 8000, "smooth"),
      },
    ],
    activeId: "s1",
    gain: 0.65,
    sensitivity: 1.2,
    transition: 1.2,
    blackout: false,
    frozen: false,
    strobe: false,
    master: 1,
    spectrum: {
      bands: 64,
      scale: "log",
      fft: "high",
    },
  });
}
