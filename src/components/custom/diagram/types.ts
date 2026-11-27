// ─────────────────────────────────────────────────────────────
// types.ts —— 公共类型（只含类型，无运行时代码）
//   1. Spec：作者在 MDX 里写的数据
//   2. Scene：compile() 的输出，渲染层只做循环输出
// ─────────────────────────────────────────────────────────────

// ───────── 基础类型 ─────────
export type Pt = [number, number];

/** 'id.side' 或 'id.side@offset'；side ∈ top|bottom|left|right|center，offset 为沿边方向的像素偏移 */
export type Anchor = string;

/** 点：绝对坐标，或节点/单元格的锚点 */
export type Place = Pt | Anchor;

/** 命名色（tokens.PALETTE 的键） | 任意 CSS 颜色 | 明暗双主题 */
export type Paint = string | { light: string; dark: string };

/** 命名字体（mono/sans/serif/math） | 任意 CSS font-family */
export type Font = string;

export type BraceSide = 'auto' | 'top' | 'bottom' | 'left' | 'right';
export type ArrowMode = 'end' | 'start' | 'both' | 'none' | 'each';

/** 虚线：单个数 = 线段与间隔等长（px）；[a, b] = 线段 a、间隔 b */
export type Dash = number | [number, number];

// ───────── Spec ─────────
export interface TextStyle {
  textColor?: Paint;
  fontSize?: number;
  font?: Font;
}

export interface BoxStyle extends TextStyle {
  /** 预设名：tokens.BOX_PRESETS 的键，或本图 presets 中自定义的键；默认 'box' */
  kind?: string;
  rx?: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
}

/** 预设 = 样式 + 默认尺寸（尺寸只对单个盒子有效） */
export interface BoxPreset extends BoxStyle {
  w?: number;
  h?: number;
}

/** 以 (x, y) 为中心的盒子 */
export interface NodeSpec extends BoxStyle {
  id?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label?: string;
}

/** 单元格：size 为沿排列方向的长度 */
export interface CellSpec extends BoxStyle {
  id?: string;
  size: number;
  label?: string;
  /** 等分为 n 格，用细线分隔 */
  divide?: number;
  /** 等分后每格的文字（长度应 ≤ divide） */
  parts?: string[];
}

/** 一排/一列连续（或等间隔）的单元格：内存布局、表格、缓存行等 */
export interface StripSpec extends BoxStyle {
  x: number; // 左上角
  y: number;
  dir?: 'h' | 'v'; // 排列方向，默认 'v'
  cross: number; // 垂直于排列方向的尺寸（dir='v' 时为宽，dir='h' 时为高）
  gap?: number; // 单元格间隔，默认 0
  cells: CellSpec[];
}

/** 折线（含单线段）。points 至少 2 个，可混用坐标与锚点 */
export interface EdgeSpec {
  points: Place[];
  color?: Paint;
  strokeWidth?: number;
  dash?: Dash;
  arrow?: ArrowMode; // 默认 'end'
}

/** 原样透传的 SVG path，不带自动箭头 */
export interface PathSpec {
  d: string;
  color?: Paint;
  strokeWidth?: number;
  dash?: Dash;
}

export interface BraceSpec extends TextStyle {
  from: Place;
  to: Place;
  side?: BraceSide; // 默认 'auto'
  color?: Paint;
  strokeWidth?: number;
  dash?: Dash;
  label?: string;
}

export interface DotSpec {
  x: number;
  y: number;
  r?: number;
  color?: Paint;
  /** 展开为 cols×rows 的点阵：第 (i, j) 个点在 (x + i·dx, y + j·dy) */
  grid?: { cols: number; rows: number; dx: number; dy: number };
}

export interface TextSpec {
  x: number;
  y: number;
  text: string;
  color?: Paint;
  fontSize?: number;
  font?: Font;
}

export interface Defaults extends TextStyle {
  /** 连线、path、圆点的默认颜色 */
  lineColor?: Paint;
  /** 大括号默认颜色，缺省跟随 lineColor */
  braceColor?: Paint;
}

export interface DiagramSpec {
  width: number;
  height: number;
  label?: string; // aria-label
  bg?: Paint;
  defaults?: Defaults;
  /** 本图自定义预设：{ mem: { rx: 0, stroke: 'violet' } }，之后写 kind: 'mem' */
  presets?: Record<string, BoxPreset>;
  /** 盒子与 strip 混排：数组顺序即绘制顺序（后者覆盖前者），容器写在前面 */
  boxes?: Array<NodeSpec | StripSpec>;
  edges?: EdgeSpec[];
  paths?: PathSpec[];
  braces?: BraceSpec[];
  dots?: DotSpec[];
  texts?: TextSpec[];
}

// ───────── Scene（compile 输出） ─────────
export interface Themed {
  light: string;
  dark: string;
}

export interface SceneRect {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  fill: Themed;
  stroke: Themed;
  strokeWidth: number;
}

export interface ScenePath {
  kind: 'path';
  d: string;
  stroke: Themed;
  strokeWidth: number;
  dash?: string;
  round?: boolean; // 圆头圆角（大括号用）
}

export interface ScenePolygon {
  kind: 'polygon';
  points: string; // "x,y x,y x,y"
  fill: Themed;
}

export interface SceneCircle {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill: Themed;
}

export interface SceneText {
  kind: 'text';
  x: number;
  anchor: 'start' | 'middle' | 'end';
  lines: { text: string; y: number }[];
  fontSize: number;
  font: string;
  fill: Themed;
}

export type SceneItem = SceneRect | ScenePath | ScenePolygon | SceneCircle | SceneText;

export interface Scene {
  width: number;
  height: number;
  label: string;
  bg: Themed;
  /** 按绘制顺序排列（后者覆盖前者） */
  items: SceneItem[];
}
