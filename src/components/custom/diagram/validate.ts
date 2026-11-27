// ─────────────────────────────────────────────────────────────
// validate.ts —— 运行时校验
//   MDX 的 props 没有类型检查，拼错字段或沿用旧写法会被静默忽略。
//   这里用"字段白名单"在构建期报错，并对旧 API 给出迁移提示。
//   白名单声明为 Record<keyof T, 1>：接口增减字段时，编译器会强制同步这里。
// ─────────────────────────────────────────────────────────────
import type {
  BoxPreset, BoxStyle, BraceSpec, CellSpec, Defaults, DiagramSpec, DotSpec,
  EdgeSpec, NodeSpec, PathSpec, StripSpec, TextSpec, TextStyle,
} from './types';

type Keys<T> = Record<keyof T, 1>;

const TEXT: Keys<TextStyle> = { textColor: 1, fontSize: 1, font: 1 };
const BOX: Keys<BoxStyle> = { ...TEXT, kind: 1, rx: 1, fill: 1, stroke: 1, strokeWidth: 1 };
const PRESET: Keys<BoxPreset> = { ...BOX, w: 1, h: 1 };
const NODE: Keys<NodeSpec> = { ...BOX, id: 1, x: 1, y: 1, w: 1, h: 1, label: 1 };
const STRIP: Keys<StripSpec> = { ...BOX, x: 1, y: 1, dir: 1, cross: 1, gap: 1, cells: 1 };
const CELL: Keys<CellSpec> = { ...BOX, id: 1, size: 1, label: 1, divide: 1, parts: 1 };
const EDGE: Keys<EdgeSpec> = { points: 1, color: 1, strokeWidth: 1, dash: 1, arrow: 1 };
const PATH: Keys<PathSpec> = { d: 1, color: 1, strokeWidth: 1, dash: 1 };
const BRACE: Keys<BraceSpec> = { ...TEXT, from: 1, to: 1, side: 1, color: 1, strokeWidth: 1, dash: 1, label: 1 };
const DOT: Keys<DotSpec> = { x: 1, y: 1, r: 1, color: 1, grid: 1 };
const GRID = { cols: 1, rows: 1, dx: 1, dy: 1 };
const TEXTSPEC: Keys<TextSpec> = { x: 1, y: 1, text: 1, color: 1, fontSize: 1, font: 1 };
const DEFAULTS: Keys<Defaults> = { ...TEXT, lineColor: 1, braceColor: 1 };
const TOP: Keys<DiagramSpec> = {
  width: 1, height: 1, label: 1, bg: 1, defaults: 1, presets: 1,
  boxes: 1, edges: 1, paths: 1, braces: 1, dots: 1, texts: 1,
};

/** 旧 API 字段 → 新写法 */
const LEGACY: Record<string, string> = {
  noArrow: "arrow: 'none'",
  x1: 'edges 用 points: [[x1,y1],[x2,y2]]；braces 用 from/to',
  y1: 'edges 用 points；braces 用 from/to',
  x2: 'edges 用 points；braces 用 from/to',
  y2: 'edges 用 points；braces 用 from/to',
  cx: 'dots 的 x', cy: 'dots 的 y',
  fontFamily: 'font（命名字体 mono/sans/serif/math 或 CSS font-family）',
  fontStyle: '已移除',
  ariaLabel: 'label',
  lines: 'edges', polylines: 'edges', circles: 'dots', labels: 'texts',
  registers: "boxes（kind: 'reg'）", ops: "boxes（kind: 'op'）", custom: 'boxes',
};

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function check(obj: unknown, allowed: object, where: string): asserts obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new Error(`${where}: 应为对象`);
  const names = Object.keys(allowed);
  for (const k of Object.keys(obj)) {
    if (names.includes(k)) continue;
    const near = names.find((n) => distance(k.toLowerCase(), n.toLowerCase()) <= 2);
    const hint = LEGACY[k] ? `（旧写法 → ${LEGACY[k]}）` : near ? `（是否想写 "${near}"？）` : '';
    throw new Error(`${where}: 未知字段 "${k}"${hint}；可用字段：${names.join(', ')}`);
  }
}

function list(v: unknown, where: string, each: (item: unknown, at: string) => void) {
  if (v === undefined) return;
  if (!Array.isArray(v)) throw new Error(`${where}: 应为数组`);
  v.forEach((item, i) => each(item, `${where}[${i}]`));
}

export function checkSpec(spec: unknown, name: string): void {
  check(spec, TOP, name);
  const at = (w: string) => `${name} ${w}`;
  if (spec.defaults !== undefined) check(spec.defaults, DEFAULTS, at('defaults'));
  if (spec.presets !== undefined) {
    const p = spec.presets;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new Error(at('presets: 应为对象'));
    for (const [k, v] of Object.entries(p)) check(v, PRESET, at(`presets.${k}`));
  }
  list(spec.boxes, at('boxes'), (b, w) => {
    if (typeof b === 'object' && b !== null && 'cells' in b) {
      check(b, STRIP, w);
      list(b.cells, `${w}.cells`, (c, cw) => check(c, CELL, cw));
    } else check(b, NODE, w);
  });
  list(spec.edges, at('edges'), (e, w) => check(e, EDGE, w));
  list(spec.paths, at('paths'), (p, w) => check(p, PATH, w));
  list(spec.braces, at('braces'), (b, w) => check(b, BRACE, w));
  list(spec.dots, at('dots'), (d, w) => {
    check(d, DOT, w);
    if (d.grid !== undefined) check(d.grid, GRID, `${w}.grid`);
  });
  list(spec.texts, at('texts'), (t, w) => check(t, TEXTSPEC, w));
}
