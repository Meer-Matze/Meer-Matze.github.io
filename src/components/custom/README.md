# 🧩 custom/ — 自定义组件

存放为特定需求编写的自定义组件，不归属于框架的标准分类。每个组件自带独立的用法文档。

---

### 📐 DataFlowDiagram — 数据流图绘图组件

Svelte 5 组件，用于在 MDX 中绘制数据流图（寄存器、运算节点、连线、大括号等），自动跟随站点深色模式。

#### 1. 引入

```mdx
import DFD, {
  WHITE,
  BLACK,
  PINK,
  AMBER,
  ORANGE,
  LIME,
  GREEN,
  CYAN,
  TEAL,
  INDIGO,
  BLUE,
  VIOLET,
  PURPLE,
  ROSE,
} from "@/components/custom/DataFlowDiagram.svelte";
```

- 组件本体为默认导出。
- 命名导出为可选的尺寸/配色常量（见 §5）。

#### 2. Props

| Prop        | 类型             | 默认值             | 说明                                             |
| ----------- | ---------------- | ------------------ | ------------------------------------------------ |
| `width`     | `number`         | `520`              | SVG viewBox 宽度                                 |
| `height`    | `number`         | `480`              | SVG viewBox 高度                                 |
| `bg`        | `Color`          | 自动（主题背景色） | 覆盖背景色                                       |
| `ariaLabel` | `string`         | `'数据流图'`       | `role="img"` 的无障碍描述                        |
| `registers` | `BoxData[]`      | `[]`               | 寄存器风格矩形（圆角小，边框细）                 |
| `ops`       | `BoxData[]`      | `[]`               | 运算节点风格矩形（圆角大，边框粗）               |
| `custom`    | `BoxData[]`      | `[]`               | 完全自定义矩形，默认中性灰配色，不带任何预设语义 |
| `lines`     | `LineData[]`     | `[]`               | 直线，默认带箭头                                 |
| `polylines` | `PolylineData[]` | `[]`               | 折线                                             |
| `paths`     | `PathData[]`     | `[]`               | 任意 SVG path                                    |
| `braces`    | `BraceData[]`    | `[]`               | 大括号标注                                       |
| `circles`   | `CircleData[]`   | `[]`               | 圆点（无边框）                                   |
| `labels`    | `LabelData[]`    | `[]`               | 纯文字（无背景/边框）                            |

所有坐标以 `boxes`/`ops` 的中心点 `(x, y)`、`lines` 等的端点为准，单位与 `width`/`height` 一致。

#### 3. `Color` 类型

支持两种写法，可在同一图里混用：

```ts
type Color = string | { light: string; dark: string };
```

- 字符串：直接作为 CSS 颜色值使用，不随深色模式变化。
- `{ light, dark }`：组件按当前主题自动选取（见 §6）。所有元素类型（`boxes`/`ops`/`lines`/`polylines`/`paths`/`circles`/`braces`/`labels`）均支持此写法。

#### 4. 各元素字段

##### 4.1 `registers` / `ops` / `custom`

```ts
{
  x: number; y: number;           // 中心坐标（必填）
  label: string;                  // 文字（必填）
  w?: number; h?: number; rx?: number;
  fill?: Color; stroke?: Color; textColor?: Color;
  fontSize?: number; fontFamily?: string;
  strokeWidth?: number;
}
```

三者字段完全一致，区别只在于未指定字段时的默认值来源：

| 分组        | 默认尺寸                         | 默认配色                                               | 默认边框宽度 | 适用场景                                                             |
| ----------- | -------------------------------- | ------------------------------------------------------ | ------------ | -------------------------------------------------------------------- |
| `registers` | `w: 80, h: 36, rx: 4`            | 浅底细边框，色相跟随 `--hue`                           | `2`          | 寄存器一类的小型固定值节点                                           |
| `ops`       | `w: 88, h: 36, rx: 10`（大圆角） | 深一档底色 + 粗边框，色相在 `registers` 基础上偏移 45° | `2.5`        | ALU/运算类节点                                                       |
| `custom`    | `w: 88, h: 40, rx: 8`            | 中性灰（不跟随 `--hue`，无语义倾向）                   | `2`          | 不属于上面两类、需要自己指定外观的节点；`fill`/`stroke` 建议显式传入 |

三者都可以在单个元素上覆盖任意字段（包括新增的 `strokeWidth`），默认值只是兜底。

##### 4.2 `lines`

```ts
{ x1: number; y1: number; x2: number; y2: number; color: Color; noArrow?: boolean; dash?: number }
```

`dash` 取值 `0~1`，和 `polylines` / `paths` 一致：`0` 表示实线，越接近 `1` 虚线间隔越大（内部 clamp 到 `0.95`）。

##### 4.3 `polylines` / `paths`

```ts
// polylines
{ points: [number, number][]; color: Color; noArrow?: boolean; dash?: number }
// paths
{ d: string; color: Color; noArrow?: boolean; dash?: number }
```

`dash` 取值 `0~1`，表示虚线中"空白段"占比（`0` = 实线，越接近 `1` 空白越多，内部会 clamp 到 `0.95`）。

##### 4.4 `braces`

```ts
{
  x1: number; y1: number; x2: number; y2: number;
  side?: 'top' | 'bottom' | 'left' | 'right' | 'auto'; // 默认 auto：按跨度方向自动判断
  color?: Color; strokeWidth?: number; dash?: number;
  text?: string;                    // 默认不传，不渲染任何文字
  textColor?: Color; fontSize?: number; fontFamily?: string;
}
```

`text` 锚定在大括号中间突起的顶点（apex）外侧、留出固定间距处：水平大括号（`top`/`bottom`）文字水平居中，垂直大括号（`left`/`right`）文字垂直居中并朝远离大括号的方向对齐。不传 `text` 时不会渲染任何 `<text>` 元素。`text` 也支持换行，可以直接写真实换行或 `<br>`。

```mdx
braces={[
{
x1: 100,
y1: 80,
x2: 100,
y2: 220,
side: 'right',
text: '第一行\n第二行',
},
]}
```

##### 4.5 `circles`

```ts
{ cx: number; cy: number; r?: number /* 默认 5 */; color: Color }
```

##### 4.6 `labels`

```ts
{ x: number; y: number; text: string; color?: Color; fontSize?: number; fontFamily?: string; fontStyle?: string }
```

`text` 支持换行。可以直接写真实换行，也可以写 `<br>`；组件会按行拆开渲染。`y` 仍然是文字基线附近的参考坐标。

```mdx
labels={[
{ x: 200, y: 40, text: "第一行\n第二行" },
{ x: 200, y: 90, text: "高缓存命中率<br>低访存开销" },
]}
```

#### 5. 导出常量

1. 颜色

- `WHITE`/`BLACK`/`PINK`/`AMBER`/`ORANGE`/`LIME`/`GREEN`/`CYAN`/`TEAL`/`INDIGO`/`BLUE`/`VIOLET`/`PURPLE`/`ROSE`

2. 字体 默认为`FONT_MONO`

- `FONT_SANS`/`FONT_SERIF`/`FONT_MATH`/`FONT_MONO`

#### 6. 深色模式

- 组件挂载时同步读取 `document.documentElement` 是否带 `dark` class 作为初始值（避免 SSR/首帧闪烁）。
- 之后通过 `MutationObserver` 监听 `<html class>` 变化，并监听 `prefers-color-scheme`（仅当 `localStorage.theme` 未设置或为 `'system'` 时生效）。
- 所有 `{light, dark}` 颜色随主题切换自动重新渲染，无需手动传参。

#### 7. 示例

```mdx
<DFD
  client:load
  width={400}
  height={200}
  registers={[{ x: 60, y: 100, label: "%rax" }]}
  ops={[{ x: 200, y: 100, label: "ALU", fill: ORANGE }]}
  custom={[
    {
      x: 340,
      y: 100,
      label: "cache",
      w: 100,
      h: 50,
      rx: 12,
      fill: TEAL,
      stroke: TEAL,
      strokeWidth: 1.5,
    },
  ]}
  lines={[{ x1: 100, y1: 100, x2: 156, y2: 100, color: BLUE }]}
  labels={[{ x: 200, y: 40, text: "示意：寄存器 → ALU → 缓存" }]}
/>
```

#### 9. 扩展：把 `custom` 特化成可复用的预设风格

`registers`/`ops` 本质上就是「`custom` + 一组固定默认值」。在组件内部改动之前，可以先在调用侧用同样的模式沉淀新风格，验证效果后再决定要不要把它提进组件。

##### 9.1 数据层：定义默认值 + 合并函数

```js
// presets/cacheBox.js
import { TEAL } from "../components/DataFlowDiagram.svelte";

// 风格定义：字段名与 registers/ops 完全一致（w/h/rx/fill/stroke/textColor/strokeWidth...）
export const CACHE_BOX = {
  w: 100,
  h: 50,
  rx: 12,
  fill: TEAL,
  stroke: TEAL,
  strokeWidth: 1.5,
};

// 合并函数：单个节点的显式字段优先，缺省字段回退到风格默认值
// （与组件内部 normalizeBox 的合并顺序保持一致）
export function withPreset(items, preset) {
  return items.map((item) => ({ ...preset, ...item }));
}
```

##### 9.2 调用层：喂给 `custom`

```mdx
import DFD from "../components/DataFlowDiagram.svelte";
import { CACHE_BOX, withPreset } from "../presets/cacheBox.js";

<DFD
  custom={withPreset(
    [
      { x: 340, y: 100, label: "L1 cache" },
      { x: 340, y: 160, label: "L2 cache" },
    ],
    CACHE_BOX,
  )}
/>
```

调用方只需要写 `x/y/label`，风格细节（尺寸、配色、边框宽度）统一由 `CACHE_BOX` 决定，效果与内置的 `registers`/`ops` 一致。

##### 9.3 如果这个风格用得足够多：提进组件

等某个预设风格（比如上面的 cache）在多篇笔记里反复出现，值得把它提升为组件内置的第三个"一等公民" prop，做法是照抄 `ops` 的模式：

1. 仿照 `REGISTER_BOX`/`OP_BOX` 的写法，在组件内直接定义一个内联的 `CACHE_BOX = { w, h, rx, fill: {light,dark}, stroke: {light,dark}, strokeWidth }` 默认值对象——尺寸和配色都写在这一处，不需要额外导出常量（参考 §5 的做法：只服务于单一风格的值直接内联）。

2. 新增 `cache = []` prop，`let cacheBoxes = $derived(cache.map((b) => normalizeBox(b, CACHE_BOX)))`。
3. 模板里加一段 `{#each cacheBoxes as c}{@render nodeBox(c)}{/each}`。

因为 `normalizeBox`/`nodeBox` 已经是通用的，新增一个预设风格只需要重复这三步，不需要改渲染逻辑本身。
