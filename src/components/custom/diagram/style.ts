// ─────────────────────────────────────────────────────────────
// style.ts —— 样式解析：把"元素自身样式 + 整图 defaults + 预设"收敛成确定值
//   compile 里所有"?? 默认值 / fontOf / themed"都只在这里出现一次。
// ─────────────────────────────────────────────────────────────
import { fontOf, themed } from './theme';
import { BOX_BASE, BOX_PRESETS, DEFAULT_FONT, FONT_SIZE, TEXT } from './tokens';
import type { BoxPreset, BoxStyle, DiagramSpec, Paint, TextStyle, Themed } from './types';

export interface ResolvedText {
  fontSize: number;
  font: string;
  fill: Themed;
}

export interface ResolvedBox {
  w: number;
  h: number;
  rx: number;
  fill: Themed;
  stroke: Themed;
  strokeWidth: number;
  text: ResolvedText;
}

export type Style = ReturnType<typeof createStyle>;

export function createStyle(spec: Pick<DiagramSpec, 'defaults' | 'presets'>) {
  const d = spec.defaults ?? {};
  const user = spec.presets ?? {};

  const text = (s: TextStyle = {}): ResolvedText => ({
    fontSize: s.fontSize ?? d.fontSize ?? FONT_SIZE,
    font: fontOf(s.font ?? d.font ?? DEFAULT_FONT),
    fill: themed(s.textColor, d.textColor ?? TEXT),
  });

  /** 连线 / path / 圆点 */
  const line = (c?: Paint) => themed(c, d.lineColor ?? TEXT);
  const brace = (c?: Paint) => themed(c, d.braceColor ?? d.lineColor ?? TEXT);

  const preset = (kind: string, where: string): BoxPreset => {
    const builtin = Object.hasOwn(BOX_PRESETS, kind) ? BOX_PRESETS[kind] : undefined;
    const custom = Object.hasOwn(user, kind) ? user[kind] : undefined;
    if (!builtin && !custom) {
      const known = [...new Set([...Object.keys(BOX_PRESETS), ...Object.keys(user)])].join(', ');
      throw new Error(`${where}: 未知的 kind "${kind}"；可用：${known}`);
    }
    return { ...builtin, ...custom };
  };

  /**
   * 盒子样式，层叠顺序（低 → 高）：BOX_BASE ← base(如 strip 的直角) ← 预设[kind] ← layers。
   * kind 取 layers 中最后出现的（单元格覆盖 strip）。
   */
  const box = (where: string, base: BoxPreset, ...layers: BoxStyle[]): ResolvedBox => {
    const kind = layers.reduce<string | undefined>((k, l) => l.kind ?? k, undefined) ?? 'box';
    const m: BoxPreset = Object.assign({}, BOX_BASE, base, preset(kind, where), ...layers);
    return {
      w: m.w ?? BOX_BASE.w,
      h: m.h ?? BOX_BASE.h,
      rx: m.rx ?? BOX_BASE.rx,
      fill: themed(m.fill, BOX_BASE.fill),
      stroke: themed(m.stroke, BOX_BASE.stroke),
      strokeWidth: m.strokeWidth ?? BOX_BASE.strokeWidth,
      text: text(m),
    };
  };

  return { text, line, brace, box };
}
