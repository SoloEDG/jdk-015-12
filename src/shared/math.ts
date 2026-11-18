export const clamp = (n: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, n));
export const clampHz = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));
export const hzLabel = (hz: number) =>
  hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k` : `${Math.round(hz)}`;
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
