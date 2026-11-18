<script setup lang="ts">
import { computed } from "vue";
import type { AudioEngine } from "../model/engine";
import type {
  FftResolution,
  FrequencyScale,
  ResponseSpeed,
  StageDocument,
} from "../../../shared/types";
import { clampHz, hzLabel } from "../../../shared/math";
import {
  FFT_PRESETS,
  RANGE_PRESETS,
  RESPONSE_PRESETS,
  SCALE_OPTIONS,
} from "../lib/spectrum";

const props = defineProps<{ engine: AudioEngine; doc: StageDocument }>();

const scene = computed(
  () => props.doc.scenes.find((s) => s.id === props.doc.activeId) ??
    props.doc.scenes[0],
);
const isWave = computed(() => scene.value.kind === "wave");
const status = computed(() => props.engine.spectrumStatus);
const responseOrder: ResponseSpeed[] = ["fast", "balanced", "smooth"];

function setMin(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(v)) scene.value.spectrum.minHz = clampHz(v, 20, scene.value.spectrum.maxHz - 1);
}
function setMax(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(v)) scene.value.spectrum.maxHz = clampHz(v, scene.value.spectrum.minHz + 1, status.value.nyquist || 24000);
}
function applyPreset(p: (typeof RANGE_PRESETS)[number]) {
  const hi = Math.min(p.maxHz, status.value.nyquist || p.maxHz);
  scene.value.spectrum.minHz = clampHz(p.minHz, 20, hi - 1);
  scene.value.spectrum.maxHz = hi;
}
</script>

<template>
  <section class="panel spectrum-panel">
    <div class="panel-heading">
      <span>02 / SPECTRUM MAPPING</span><span>{{ doc.spectrum.bands }} BANDS</span>
    </div>
    <h3>按音乐分布的可调频段</h3>

    <label class="control"
      >频段数量 <b>{{ doc.spectrum.bands }}</b
      ><input
        type="range"
        min="16"
        max="128"
        step="8"
        v-model.number="doc.spectrum.bands"
    /></label>

    <div class="seg-group">
      <span class="seg-label">频率刻度</span>
      <button
        v-for="o in SCALE_OPTIONS"
        :key="o.value"
        :class="{ selected: doc.spectrum.scale === (o.value as FrequencyScale) }"
        @click="doc.spectrum.scale = o.value as FrequencyScale"
      >
        {{ o.label }}
      </button>
    </div>

    <div class="seg-group">
      <span class="seg-label">分析精度</span>
      <button
        v-for="(p, key) in FFT_PRESETS"
        :key="key"
        :class="{ selected: doc.spectrum.fft === (key as FftResolution) }"
        @click="doc.spectrum.fft = key as FftResolution"
      >
        {{ p.label }}
      </button>
    </div>
    <small class="muted fft-note"
      >每格 {{ status.binHz ? status.binHz.toFixed(1) : "–" }}Hz · 采样率
      {{ status.sampleRate ? Math.round(status.sampleRate) : "–" }}Hz ·
      鼓点由独立小窗分析，不受此窗长影响</small
    >

    <div class="scene-spectrum" :class="{ disabled: isWave }">
      <div class="range-head">
        <strong>「{{ scene.name }}」频段范围</strong>
        <small v-if="isWave" class="wave-note"
          >波形场景只画时域波形，频率设置已保留，切回环形/柱状即恢复</small
        >
      </div>

      <div class="range-inputs">
        <label
          >下限 Hz
          <input
            type="number"
            min="20"
            :value="scene.spectrum.minHz"
            :disabled="isWave"
            @change="setMin"
        /></label>
        <span>—</span>
        <label
          >上限 Hz
          <input
            type="number"
            :max="Math.round(status.nyquist)"
            :value="scene.spectrum.maxHz"
            :disabled="isWave"
            @change="setMax"
        /></label>
      </div>
      <small class="muted range-readout"
        >实际生效 {{ hzLabel(status.minHz) }}Hz –
        {{ hzLabel(status.maxHz) }}Hz / 奈奎斯特
        {{ hzLabel(status.nyquist) }}Hz</small
      >

      <div class="range-presets">
        <button
          v-for="p in RANGE_PRESETS"
          :key="p.label"
          :disabled="isWave"
          @click="applyPreset(p)"
        >
          {{ p.label }}
        </button>
      </div>

      <span class="seg-label response-label">响应速度</span>
      <div class="seg-group response-group">
        <button
          v-for="r in responseOrder"
          :key="r"
          :class="{ selected: scene.spectrum.response === r }"
          :disabled="isWave"
          @click="scene.spectrum.response = r"
        >
          {{ RESPONSE_PRESETS[r].label }}
        </button>
      </div>
      <small class="muted response-hint">{{
        RESPONSE_PRESETS[scene.spectrum.response].hint
      }}</small>
    </div>

    <p v-if="status.error" role="alert" class="spectrum-message error">
      {{ status.error }}
    </p>
    <p v-else-if="status.warning" role="status" class="spectrum-message warning">
      {{ status.warning }}
    </p>
  </section>
</template>
