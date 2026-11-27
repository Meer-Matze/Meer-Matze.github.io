// ─────────────────────────────────────────────────────────────
// geometry.ts —— 纯几何函数：不依赖 DOM、框架、主题
//   输入输出都是数字/数组/字符串，可直接单测
// ─────────────────────────────────────────────────────────────
import { ARROW_HALF_WIDTH, ARROW_LENGTH, BRACE_LABEL_GAP, LINE_HEIGHT_RATIO, TEXT_CENTER_EM } from './tokens';
import type { ArrowMode, BraceSide, CellSpec, Dash, DotSpec, Place, Pt, StripSpec } from './types';

export interface Rect {
  x: number; // 左上角
  y: number;
  w: number;
  h: number;
}

// ───────── 小工具 ─────────
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 数字格式化：去掉浮点噪声（0.1+0.2 → 0.3） */
export const fmt = (n: number) => +n.toFixed(3);

export function dashArray(dash: Dash | undefined): string | undefined {
  if (dash === undefined) return undefined;
  const [a, b] = typeof dash === 'number' ? [dash, dash] : dash;
  return a > 0 && b > 0 ? `${fmt(a)} ${fmt(b)}` : undefined;
}

// ───────── 文字 ─────────
/** 按 \n 或 <br> 分行；保留空行（用于手动留白）；未提供返回 [] */
export function splitLabel(text: string | undefined): string[] {
  if (text === undefined || text === '') return [];
  return text.replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/);
}

/**
 * 多行文字的基线位置：整块以 y 为中心垂直排布。
 * dyEm 为整体下移量（单位 em），盒子/竖直大括号内的文字用 TEXT_CENTER_EM 做视觉居中。
 * 空行只占位置、不输出（渲染层无需再过滤）。
 */
export function layoutText(text: string | undefined, y: number, fontSize: number, dyEm = 0) {
  const lines = splitLabel(text);
  const lh = Math.round(fontSize * LINE_HEIGHT_RATIO);
  const top = y - ((lines.length - 1) * lh) / 2 + dyEm * fontSize;
  return lines.map((t, i) => ({ text: t, y: top + i * lh })).filter((l) => l.text !== '');
}

// ───────── 箭头与折线 ─────────
type Vec = [number, number];
type Tri = [Pt, Pt, Pt];

function unit(a: Pt, b: Pt): { v: Vec; len: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return { v: len > 0 ? [dx / len, dy / len] : [0, 0], len };
}

/** 箭头三角形：尖端在 tip，朝向 dir（单位向量），尺寸随线宽缩放 */
export function arrowHead(tip: Pt, dir: Vec, strokeWidth: number): Tri {
  const L = ARROW_LENGTH * strokeWidth;
  const W = ARROW_HALF_WIDTH * strokeWidth;
  const bx = tip[0] - dir[0] * L;
  const by = tip[1] - dir[1] * L;
  const nx = -dir[1];
  const ny = dir[0];
  return [
    [bx + nx * W, by + ny * W],
    tip,
    [bx - nx * W, by - ny * W],
  ];
}

export interface EdgeGeometry {
  /** 需要描边的折线（每条 ≥ 2 点；有箭头的一端已缩短） */
  strokes: Pt[][];
  heads: Tri[];
}

/** 在折线末端加箭头：尖端落在原端点，描边在箭头底边处结束。零长线段不加。 */
function capEnd(pts: Pt[], sw: number, maxCut = Infinity): { pts: Pt[]; head?: Tri } {
  const tip = pts[pts.length - 1];
  const { v, len } = unit(pts[pts.length - 2], tip);
  if (len === 0) return { pts };
  const cut = Math.min(ARROW_LENGTH * sw, len, maxCut);
  return { pts: [...pts.slice(0, -1), [tip[0] - v[0] * cut, tip[1] - v[1] * cut]], head: arrowHead(tip, v, sw) };
}

/**
 * 折线 + 箭头。
 *   end / start / both —— 只在首/末端；each —— 每个线段末端都有；none —— 无。
 */
export function buildEdge(points: Pt[], arrow: ArrowMode, sw: number): EdgeGeometry {
  if (points.length < 2) return { strokes: [], heads: [] };
  if (arrow === 'none') return { strokes: [points], heads: [] };

  if (arrow === 'each') {
    const strokes: Pt[][] = [];
    const heads: Tri[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const r = capEnd([points[i], points[i + 1]], sw);
      if (!r.head) continue;
      strokes.push(r.pts);
      heads.push(r.head);
    }
    return { strokes, heads };
  }

  // 单线段两端都有箭头时，各自最多吃掉一半线长
  const maxCut = arrow === 'both' && points.length === 2 ? unit(points[0], points[1]).len / 2 : Infinity;
  let pts = points;
  const heads: Tri[] = [];
  if (arrow !== 'start') {
    const r = capEnd(pts, sw, maxCut);
    pts = r.pts;
    if (r.head) heads.push(r.head);
  }
  if (arrow !== 'end') {
    const r = capEnd([...pts].reverse(), sw, maxCut);
    pts = r.pts.reverse();
    if (r.head) heads.push(r.head);
  }
  return { strokes: [pts], heads };
}

export const pointsAttr = (pts: Pt[]) => pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ');

export const polylinePath = (pts: Pt[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p[0])} ${fmt(p[1])}`).join(' ');

// ───────── 大括号 ─────────
export interface BraceLine {
  from: Pt;
  to: Pt;
  side: BraceSide;
}

function braceGeometry({ from, to, side }: BraceLine) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  const resolved = side === 'auto' ? (horizontal ? 'bottom' : 'right') : side;
  const sign = resolved === 'top' || resolved === 'left' ? -1 : 1;
  const span = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  const outer = clamp(span * 0.12, 3, 14);
  const apex = clamp(span * 0.08, 2, 10) + outer;
  return { horizontal, sign, outer, apex };
}

export function bracePath(b: BraceLine): string {
  const [x1, y1] = b.from;
  const [x2, y2] = b.to;
  const { horizontal, sign, outer, apex } = braceGeometry(b);
  const f = fmt;
  if (horizontal) {
    const y = (y1 + y2) / 2;
    const mx = (x1 + x2) / 2;
    return [
      `M ${f(x1)} ${f(y)}`,
      `L ${f(x1)} ${f(y + sign * outer)}`,
      `L ${f(mx)} ${f(y + sign * outer)}`,
      `L ${f(mx)} ${f(y + sign * apex)}`,
      `L ${f(mx)} ${f(y + sign * outer)}`,
      `L ${f(x2)} ${f(y + sign * outer)}`,
      `L ${f(x2)} ${f(y)}`,
    ].join(' ');
  }
  const x = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return [
    `M ${f(x)} ${f(y1)}`,
    `L ${f(x + sign * outer)} ${f(y1)}`,
    `L ${f(x + sign * outer)} ${f(my)}`,
    `L ${f(x + sign * apex)} ${f(my)}`,
    `L ${f(x + sign * outer)} ${f(my)}`,
    `L ${f(x + sign * outer)} ${f(y2)}`,
    `L ${f(x)} ${f(y2)}`,
  ].join(' ');
}

export function braceLabelPos(b: BraceLine): {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** 文字整体下移量（em）：竖直大括号需要视觉居中，水平的不需要 */
  dyEm: number;
} {
  const [x1, y1] = b.from;
  const [x2, y2] = b.to;
  const { horizontal, sign, apex } = braceGeometry(b);
  if (horizontal) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 + sign * (apex + BRACE_LABEL_GAP), anchor: 'middle', dyEm: 0 };
  }
  return {
    x: (x1 + x2) / 2 + sign * (apex + BRACE_LABEL_GAP),
    y: (y1 + y2) / 2,
    anchor: sign > 0 ? 'start' : 'end',
    dyEm: TEXT_CENTER_EM,
  };
}

// ───────── 锚点 ─────────
const ANCHOR_RE = /^([A-Za-z_][\w-]*)\.(top|bottom|left|right|center)(?:@(-?\d+(?:\.\d+)?))?$/;

export function rectAnchor(r: Rect, side: string, offset = 0): Pt {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (side) {
    case 'top':
      return [cx + offset, r.y];
    case 'bottom':
      return [cx + offset, r.y + r.h];
    case 'left':
      return [r.x, cy + offset];
    case 'right':
      return [r.x + r.w, cy + offset];
    default:
      return [cx, cy];
  }
}

/** 把坐标或锚点字符串解析为坐标；失败时抛出带上下文的错误（构建期即可发现） */
export function resolvePlace(p: Place, rects: ReadonlyMap<string, Rect>, where: string): Pt {
  if (Array.isArray(p)) return [p[0], p[1]];
  const m = ANCHOR_RE.exec(p);
  if (!m) {
    throw new Error(`${where}: 无效的锚点 "${p}"，应为 'id.side' 或 'id.side@offset'（side: top|bottom|left|right|center）`);
  }
  const rect = rects.get(m[1]);
  if (!rect) {
    const known = [...rects.keys()].join(', ') || '（无）';
    throw new Error(`${where}: 未知的节点 id "${m[1]}"；已定义：${known}`);
  }
  return rectAnchor(rect, m[2], m[3] ? Number(m[3]) : 0);
}

// ───────── strip 布局 ─────────
export interface StripCellLayout {
  cell: CellSpec;
  rect: Rect;
  /** 等分线（每条为两个端点） */
  dividers: [Pt, Pt][];
  /** 文字块：中心点 + 文字 */
  labels: { cx: number; cy: number; text: string }[];
}

export function layoutStrip(strip: StripSpec): StripCellLayout[] {
  const dir = strip.dir ?? 'v';
  const gap = strip.gap ?? 0;
  let cursor = dir === 'v' ? strip.y : strip.x;
  const out: StripCellLayout[] = [];

  for (const cell of strip.cells) {
    const rect: Rect =
      dir === 'v'
        ? { x: strip.x, y: cursor, w: strip.cross, h: cell.size }
        : { x: cursor, y: strip.y, w: cell.size, h: strip.cross };
    cursor += cell.size + gap;

    const dividers: [Pt, Pt][] = [];
    const labels: StripCellLayout['labels'] = [];
    const n = cell.divide && cell.divide > 1 ? Math.floor(cell.divide) : 1;

    if (n > 1) {
      for (let i = 1; i < n; i++) {
        if (dir === 'h') {
          const x = rect.x + (rect.w * i) / n;
          dividers.push([[x, rect.y], [x, rect.y + rect.h]]);
        } else {
          const y = rect.y + (rect.h * i) / n;
          dividers.push([[rect.x, y], [rect.x + rect.w, y]]);
        }
      }
      (cell.parts ?? []).slice(0, n).forEach((text, i) => {
        if (!text) return;
        labels.push(
          dir === 'h'
            ? { cx: rect.x + (rect.w * (i + 0.5)) / n, cy: rect.y + rect.h / 2, text }
            : { cx: rect.x + rect.w / 2, cy: rect.y + (rect.h * (i + 0.5)) / n, text },
        );
      });
    } else if (cell.label) {
      labels.push({ cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, text: cell.label });
    }
    out.push({ cell, rect, dividers, labels });
  }
  return out;
}

// ───────── 点阵 ─────────
export function expandDots(d: DotSpec): Pt[] {
  if (!d.grid) return [[d.x, d.y]];
  const { cols, rows, dx, dy } = d.grid;
  const pts: Pt[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push([d.x + i * dx, d.y + j * dy]);
  return pts;
}
