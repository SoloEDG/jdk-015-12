# Resonance

安装：`npm ci`

本地启动：`npm run dev`

Docker 启动：`docker compose up --build`，访问 http://localhost:8015。

## 可调频谱引擎（SPECTRUM MAPPING）

频谱不再使用所有场景共用的固定 FFT 输出，而是按音乐频率分布生成可调频段：

- **频段数量**：16–128，运行中可改；切换时平滑状态按频段中心频率迁移，不会出现一帧满屏峰值。
- **频率刻度**：对数（等比/半音分布，低频相邻音符可分辨）或线性。
- **分析精度**：2048 / 8192 / 16384 三档 FFT；高解析下 48kHz 采样率每格约 5.9Hz，可区分 A1（55Hz）与 A#1（58Hz）。
- **每场景独立频段范围与响应速度**：环形（orbit）、柱状（spectrum）、波形（wave）、隧道（tunnel）各自保存 `minHz / maxHz / response`。环形与柱状读取同一份频段能量数组，对同一频段的理解完全一致。
- **响应速度**：敏捷 / 均衡 / 绵密三档，基于逐频段 attack/release EMA（分析器自带平滑已关闭），时间常数差异可直接听看感知。
- **鼓点独立小窗**：节拍检测走 1024 点（约 23ms 延迟）分析器，长频谱窗口不会拖慢鼓点。
- **波形场景隔离**：wave 只绘制时域波形，不消费频率数据；其频谱设置仍被保留，切回频谱类场景即恢复。
- **范围校验**：下限低于 20Hz、上限超过奈奎斯特会被裁剪并给出明确提示；范围过窄或数值无效会恢复全范围并显示错误；窄于两个频率格会警告数据合并。
- **状态衔接**：文件↔麦克风切换、暂停恢复、采样率变化、频段数量/范围修改均做软衔接（保护帧限幅 + 频率重映射），杜绝满屏峰值与假节拍。
- **录制与音高**：分析链路是无源 tap 分支，只读取不处理音频，不改变原音乐音高；录制取同一 tap 信号，频谱响应与舞台完全一致。

## 测试

频谱引擎的纯逻辑与衔接行为由独立测试覆盖（需 Node 22）：

```bash
cd ../spectrum-tests
../jdk-015-feature迭代-12/node_modules/.bin/esbuild spectrum.test.ts \
  --bundle --platform=node --format=esm --outfile=dist.test.mjs
node dist.test.mjs
```

类型检查：`npm run typecheck`；生产构建：`npm run build`。
