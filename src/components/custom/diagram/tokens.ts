// ─────────────────────────────────────────────────────────────
// tokens.ts —— 设计常量（纯数据，无逻辑）
//   改配色/字体/默认尺寸只需要改这一个文件
// ─────────────────────────────────────────────────────────────
import type { BoxPreset, Paint, Themed } from './types';

// ───────── 中性色（跟随站点 --hue；回退 250，需验证站点实际 hue） ─────────
export const BG: Themed = {
  light: 'oklch(0.95 0.020 var(--hue, 250))',
  dark: 'oklch(0.17 0.020 var(--hue, 250))',
};
export const TEXT: Themed = {
  light: 'oklch(0.20 0.01 var(--hue, 250))',
  dark: 'oklch(0.85 0.01 var(--hue, 250))',
};
/** 浅色为近黑，深色为近白 */
export const WB: Themed = {
  light: 'oklch(0.12 0.020 var(--hue, 250))',
  dark: 'oklch(0.95 0.020 var(--hue, 250))',
};
/** 无语义的中性描边 */
export const NEUTRAL_STROKE: Themed = {
  light: 'oklch(0.65 0 0)',
  dark: 'oklch(0.55 0 0)',
};

// ───────── 命名色（色环上每 30° 一个） ─────────
export const PALETTE: Record<string, Paint> = {
  wb: WB,
  text: TEXT,
  pink: 'oklch(0.65 0.15 10)',
  amber: 'oklch(0.70 0.16 40)',
  orange: 'oklch(0.65 0.18 70)',
  lime: 'oklch(0.68 0.16 100)',
  green: 'oklch(0.65 0.15 130)',
  cyan: 'oklch(0.62 0.15 160)',
  teal: 'oklch(0.60 0.20 190)',
  indigo: 'oklch(0.58 0.16 220)',
  blue: 'oklch(0.60 0.15 250)',
  violet: 'oklch(0.62 0.18 280)',
  purple: 'oklch(0.70 0.18 310)',
  rose: 'oklch(0.65 0.18 340)',
};

// ───────── 字体 ─────────
export const FONTS: Record<string, string> = {
  math: "Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  serif: "'Times New Roman', 'Songti SC', 'SimSun', serif",
  sans: "Misans, 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

// ───────── 默认值 ─────────
export const DEFAULT_FONT = 'mono';
export const FONT_SIZE = 13;
export const LINE_HEIGHT_RATIO = 1.2; // 行高 = round(fontSize × 1.2)
export const EDGE_STROKE = 2;
export const BRACE_STROKE = 2.5;
export const DOT_R = 5;

// 文字垂直居中：基线下移 fontSize × TEXT_CENTER_EM（SVG 习惯值 0.35em；旧版在 13px 下约 0.38em）
export const TEXT_CENTER_EM = 0.35;
export const BRACE_LABEL_GAP = 10; // 大括号突起点到文字的距离（px）

// 箭头：长度、半宽均为 strokeWidth 的倍数（与旧 marker 完全一致）
export const ARROW_LENGTH = 3;
export const ARROW_HALF_WIDTH = 1.25;

// ───────── 盒子预设 ─────────
// 层叠顺序：BOX_BASE ← BOX_PRESETS[kind] ← 本图 presets[kind] ← 元素自身样式
// 新增内置预设：只需在 BOX_PRESETS 里加一项，其余文件无需改动。
export const BOX_BASE = {
  w: 88,
  h: 40,
  rx: 8,
  fill: BG,
  stroke: NEUTRAL_STROKE,
  strokeWidth: 2,
} satisfies BoxPreset;

/** strip 的单元格默认直角（相邻单元格贴边时圆角不好看） */
export const STRIP_BASE: BoxPreset = { rx: 0 };

// 固定色相：reg = 250，op = 295（即旧 --hue 与 --hue+45）
export const BOX_PRESETS: Record<string, BoxPreset> = {
  box: {},
  reg: {
    w: 80,
    h: 36,
    rx: 4,
    fill: { light: 'oklch(0.92 0.05 75)', dark: 'oklch(0.18 0.06 75)' },
    stroke: { light: 'oklch(0.55 0.18 75)', dark: 'oklch(0.65 0.15 75)' },
    strokeWidth: 2,
  },
  op: {
    w: 88,
    h: 36,
    rx: 10,
    fill: { light: 'oklch(0.93 0.05 120)', dark: 'oklch(0.20 0.06 120)' },
    stroke: { light: 'oklch(0.60 0.18 120)', dark: 'oklch(0.70 0.15 120)' },
    strokeWidth: 2.5,
  },
};
