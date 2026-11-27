// ─────────────────────────────────────────────────────────────
// theme.ts —— 颜色/字体解析 + 明暗主题的 CSS 变量约定
//   这里只做"值"的转换；明暗切换本身完全交给 theme.css，运行时无 JS
// ─────────────────────────────────────────────────────────────
import { FONTS, PALETTE } from './tokens';
import type { Font, Paint, Themed } from './types';

function isThemed(p: Paint): p is Themed {
  return typeof p === 'object' && p !== null;
}

/** 解析单个字符串：命名色 → 其值；否则当作原始 CSS 颜色 */
function resolveToken(s: string): Paint {
  return Object.hasOwn(PALETTE, s) ? PALETTE[s] : s;
}

function pickSide(p: Paint, side: 'light' | 'dark'): string {
  const v = isThemed(p) ? p[side] : p;
  const r = resolveToken(v);
  return isThemed(r) ? r[side] : r;
}

/** Paint → { light, dark }；未传时用 fallback */
export function themed(p: Paint | undefined, fallback: Paint): Themed {
  const src = p ?? fallback;
  return { light: pickSide(src, 'light'), dark: pickSide(src, 'dark') };
}

/** 命名字体 → font-family；否则原样返回 */
export function fontOf(f: Font): string {
  return Object.hasOwn(FONTS, f) ? FONTS[f] : f;
}

/**
 * CSS 变量约定：每个"颜色属性"对应一对变量 --{name}-l / --{name}-d。
 * theme.css 里统一用 var(--{name}-l) 或 var(--{name}-d) 着色。
 * 例：themeVars({ stroke: t1, fill: t2 }) → "--stroke-l:..;--stroke-d:..;--fill-l:..;--fill-d:.."
 */
export function themeVars(vars: Record<string, Themed>): string {
  return Object.entries(vars)
    .map(([k, t]) => `--${k}-l:${t.light};--${k}-d:${t.dark}`)
    .join(';');
}
