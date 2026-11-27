// ─────────────────────────────────────────────────────────────
// compile.ts —— DiagramSpec → Scene（纯函数，无副作用）
//   流程：校验 → 样式解析(style.ts) → 盒子展开与锚点登记 → 按绘制顺序产出图元
//   渲染层（Diagram.astro）只做遍历与格式化，不做任何几何、布局或默认值决策。
// ─────────────────────────────────────────────────────────────
import {
  bracePath,
  braceLabelPos,
  buildEdge,
  dashArray,
  expandDots,
  layoutStrip,
  layoutText,
  pointsAttr,
  polylinePath,
  resolvePlace,
  type Rect,
} from './geometry';
import { createStyle, type ResolvedBox, type ResolvedText } from './style';
import { themed } from './theme';
import { BG, BRACE_STROKE, TEXT_CENTER_EM, DOT_R, EDGE_STROKE, STRIP_BASE } from './tokens';
import { checkSpec } from './validate';
import type { DiagramSpec, NodeSpec, Pt, Scene, SceneItem, SceneText, StripSpec } from './types';

const ID_RE = /^[A-Za-z_][\w-]*$/;

/** 一个已定位、已定样式的盒子（节点，或 strip 中的一个单元格） */
interface BoxPart {
  id?: string;
  where: string;
  rect: Rect;
  style: ResolvedBox;
  dividers: [Pt, Pt][];
  labels: { cx: number; cy: number; text: string }[];
}

export function compile(spec: DiagramSpec): Scene {
  const name = `Diagram "${spec.label ?? '未命名'}"`;
  checkSpec(spec, name);
  if (!(spec.width > 0) || !(spec.height > 0)) throw new Error(`${name}: width/height 必须是正数`);

  const st = createStyle(spec);

  // ───────── 1. 盒子展开：每个节点/单元格 → 一个 BoxPart ─────────
  const expand = (b: NodeSpec | StripSpec, where: string): BoxPart[] => {
    if ('cells' in b) {
      return layoutStrip(b).map(({ cell, rect, dividers, labels }, i) => ({
        id: cell.id,
        where: `${where}.cells[${i}]`,
        rect,
        style: st.box(`${where}.cells[${i}]`, STRIP_BASE, b, cell),
        dividers,
        labels,
      }));
    }
    const style = st.box(where, {}, b);
    const w = b.w ?? style.w;
    const h = b.h ?? style.h;
    const label = b.label ? [{ cx: b.x, cy: b.y, text: b.label }] : [];
    return [{ id: b.id, where, rect: { x: b.x - w / 2, y: b.y - h / 2, w, h }, style, dividers: [], labels: label }];
  };
  const parts = (spec.boxes ?? []).flatMap((b, i) => expand(b, `${name} boxes[${i}]`));

  // ───────── 2. 锚点登记 ─────────
  const rects = new Map<string, Rect>();
  for (const p of parts) {
    if (p.id === undefined) continue;
    if (!ID_RE.test(p.id)) throw new Error(`${p.where}: id "${p.id}" 非法（须以字母/下划线开头，仅含字母数字 _ -）`);
    if (rects.has(p.id)) throw new Error(`${p.where}: id "${p.id}" 重复`);
    rects.set(p.id, p.rect);
  }
  const place = (p: Parameters<typeof resolvePlace>[0], where: string) => resolvePlace(p, rects, `${name} ${where}`);

  // ───────── 3. 按绘制顺序产出图元 ─────────
  const items: SceneItem[] = [];

  const label = (x: number, y: number, text: string | undefined, t: ResolvedText, anchor: SceneText['anchor'] = 'middle', dyEm = 0) => {
    const lines = layoutText(text, y, t.fontSize, dyEm);
    if (lines.length) items.push({ kind: 'text', x, anchor, lines, fontSize: t.fontSize, font: t.font, fill: t.fill });
  };

  for (const { rect, style, dividers, labels } of parts) {
    items.push({ kind: 'rect', ...rect, rx: style.rx, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth });
    for (const [a, b] of dividers) items.push({ kind: 'path', d: polylinePath([a, b]), stroke: style.stroke, strokeWidth: style.strokeWidth });
    for (const l of labels) label(l.cx, l.cy, l.text, style.text, 'middle', TEXT_CENTER_EM);
  }

  (spec.edges ?? []).forEach((e, i) => {
    if (e.points.length < 2) throw new Error(`${name} edges[${i}]: points 至少需要 2 个点`);
    const pts = e.points.map((p, j) => place(p, `edges[${i}].points[${j}]`));
    const sw = e.strokeWidth ?? EDGE_STROKE;
    const color = st.line(e.color);
    const { strokes, heads } = buildEdge(pts, e.arrow ?? 'end', sw);
    for (const s of strokes) items.push({ kind: 'path', d: polylinePath(s), stroke: color, strokeWidth: sw, dash: dashArray(e.dash) });
    for (const h of heads) items.push({ kind: 'polygon', points: pointsAttr(h), fill: color });
  });

  for (const p of spec.paths ?? []) {
    items.push({ kind: 'path', d: p.d, stroke: st.line(p.color), strokeWidth: p.strokeWidth ?? EDGE_STROKE, dash: dashArray(p.dash) });
  }

  (spec.braces ?? []).forEach((b, i) => {
    const line = { from: place(b.from, `braces[${i}].from`), to: place(b.to, `braces[${i}].to`), side: b.side ?? ('auto' as const) };
    items.push({ kind: 'path', d: bracePath(line), stroke: st.brace(b.color), strokeWidth: b.strokeWidth ?? BRACE_STROKE, dash: dashArray(b.dash), round: true });
    const pos = braceLabelPos(line);
    label(pos.x, pos.y, b.label, st.text(b), pos.anchor, pos.dyEm);
  });

  for (const dot of spec.dots ?? []) {
    const fill = st.line(dot.color);
    for (const [cx, cy] of expandDots(dot)) items.push({ kind: 'circle', cx, cy, r: dot.r ?? DOT_R, fill });
  }

  for (const t of spec.texts ?? []) label(t.x, t.y, t.text, st.text({ ...t, textColor: t.color }), 'middle', TEXT_CENTER_EM);

  return { width: spec.width, height: spec.height, label: spec.label ?? '示意图', bg: themed(spec.bg, BG), items };
}
