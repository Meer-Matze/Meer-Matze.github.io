# 🧩 custom/ — 自定义组件

存放为特定需求编写的自定义组件，不归属于框架的标准分类。每个组件自带独立的用法文档。

---

### 📐 DataFlowDiagram — 数据流图绘图组件

通用的 SVG 数据流图组件，支持深色/浅色模式自动切换，可在 MDX 中声明式绘制。

#### 基本用法

```mdx
import DFD, {
  TEAL,
  PINK,
  ORANGE,
  RW,
  RH,
  OW,
  OH,
} from "@/components/custom/DataFlowDiagram.svelte";

<DFD
  client:load
  boxes={[
    { x: 76, y: 52, label: "%rax" },
    { x: 196, y: 52, label: "%rdx" },
    { x: 316, y: 52, label: "%xmm0" },
  ]}
  ops={[
    { x: 432, y: 132, label: "load" },
    { x: 432, y: 206, label: "mul" },
    { x: 432, y: 280, label: "add" },
    { x: 432, y: 352, label: "cmp" },
  ]}
  lines={[
    { x1: 76, y1: 70, x2: 76, y2: 426, color: TEAL },
    { x1: 196, y1: 132, x2: 388, y2: 132, color: TEAL },
  ]}
  polylines={[
    {
      points: [
        [316, 70],
        [316, 206],
        [388, 206],
      ],
      color: PINK,
    },
  ]}
  paths={[{ d: "M 476 216 C 518 216 518 196 476 196", color: PINK }]}
  circles={[{ cx: 76, cy: 358, color: ORANGE }]}
/>
```

#### 坐标系

SVG 采用**左上角原点**坐标系：

```
(0,0) ────→ X 正方向
  │
  │
  ↓
Y 正方向
```

- `x` 属性：距画布**左边缘**的像素距离
- `y` 属性：距画布**上边缘**的像素距离
- 所有框和节点的 `x, y` 都是**中心点坐标**（组件会自动偏移一半宽高来定位矩形）

示例——`{ x: 76, y: 52 }` 在画布左上角偏右 76px、偏下 52px 的位置。

#### Props

| Prop        | 类型                        | 默认值       | 说明                     |
| ----------- | --------------------------- | ------------ | ------------------------ |
| `width`     | `number`                    | `520`        | 画布宽度                 |
| `height`    | `number`                    | `480`        | 画布高度                 |
| `bg`        | `string \| { light, dark }` | 自动跟随主题 | 画布背景色               |
| `ariaLabel` | `string`                    | `'数据流图'` | 无障碍标签               |
| `boxes`     | `Box[]`                     | `[]`         | 寄存器风格矩形           |
| `ops`       | `Op[]`                      | `[]`         | 运算节点风格矩形         |
| `lines`     | `Line[]`                    | `[]`         | 直线（自动加箭头）       |
| `polylines` | `Polyline[]`                | `[]`         | 折线（自动加箭头）       |
| `paths`     | `Path[]`                    | `[]`         | 贝塞尔曲线（自动加箭头） |
| `circles`   | `Circle[]`                  | `[]`         | 圆点                     |
| `labels`    | `Label[]`                   | `[]`         | 纯文字标签（透明背景）   |

#### 直线（lines）语法

每条线默认自动加箭头。如果不需要箭头，加 `noArrow: true`：

```svelte
<DFD lines={[
  { x1: 76, y1: 70, x2: 76, y2: 426, color: TEAL },
  { x1: 196, y1: 132, x2: 388, y2: 132, color: TEAL, noArrow: true },
]}/>
```

#### 折线（polylines）语法

`points` 传入坐标点数组，依次连线：

```svelte
<DFD polylines={[
  // L 型折线：起点 → 转折 → 终点
  { points: [[316, 70], [316, 206], [388, 206]], color: RED },
  // 多段折线
  { points: [[432, 224], [432, 408], [316, 408], [316, 426]], color: RED, noArrow: true },
]}/>
```

#### 路径（paths）语法

`paths` 用于绘制曲线、自环等 SVG `<path>` 图形，`d` 属性直接写 SVG path 命令：

| 命令                                          | 含义           | 示例                        |
| --------------------------------------------- | -------------- | --------------------------- |
| `M x y`                                       | 移动到 (x, y)  | `M 100 100`                 |
| `L x y`                                       | 直线到 (x, y)  | `L 200 200`                 |
| `C x1 y1 x2 y2 x y`                           | 三次贝塞尔曲线 | `C 150 100 250 100 200 200` |
| `Q x1 y1 x y`                                 | 二次贝塞尔曲线 | `Q 150 100 200 200`         |
| `A rx ry x-axis-rotation large-arc sweep x y` | 圆弧           | `A 30 30 0 0 1 100 100`     |

示例——自环（三次贝塞尔曲线回到起点右侧）：

```svelte
<DFD paths={[
  { d: "M 476 216 C 518 216 518 196 476 196", color: RED },
]}/>
```

等价写法——起点 `M 476 216`，控制点 1 `518 216`，控制点 2 `518 196`，终点 `476 196`。<br>
如果不需要箭头，加 `noArrow: true`：

```svelte
<DFD paths={[
  { d: "M 100 100 Q 200 50 300 100", color: TEAL, noArrow: true },
]}/>
```

#### 圆点（circles）语法

```svelte
<DFD circles={[
  { cx: 76, cy: 358, r: 5, color: ORANGE },   // r 默认 5
  { cx: 196, cy: 132, color: TEAL },            // 省略 r 则用 5
]}/>
```

#### 文字标签（labels）语法

透明背景、无边框的纯文字，常用于图注/标注：

```svelte
<DFD labels={[
  // 基础：跟随主题色，默认字号 13
  { x: 200, y: 100, text: "循环开始" },
  // 自定义颜色和字号
  { x: 200, y: 130, text: "关键路径",
    color: "#e05252", fontSize: 16 },
  // 使用导出色板常量
  { x: 200, y: 160, text: "数据依赖", color: TEAL, fontSize: 14 },
  // 自定义字体
  { x: 200, y: 190, text: "标注",
    fontFamily: "'Inter', sans-serif", fontSize: 12 },
]}/>
```

每个 label 的属性：

| 属性         | 类型                        | 默认值                            | 说明         |
| ------------ | --------------------------- | --------------------------------- | ------------ |
| `x`, `y`     | `number`                    | —                                 | 文字中心坐标 |
| `text`       | `string`                    | —                                 | 显示内容     |
| `color`      | `string \| { light, dark }` | 跟随主题文字色                    | 字体颜色     |
| `fontSize`   | `number`                    | `13`                              | 字号         |
| `fontFamily` | `string`                    | `'JetBrains Mono', monospace ...` | 字体         |

#### 颜色系统

颜色支持三种传入方式：

- **固定色**：`"#FFA500"` — 深/浅模式保持同一颜色
- **主题色**：`{ light: "#c47a00", dark: "#FFA500" }` — 分别指定两种模式下的颜色
- **站点主题联动**：使用 `oklch(... var(--hue))` — 跟随用户在站点设置中选的主题色相

第三种方式是默认行为——组件内置色板全部使用 `oklch()` + `var(--hue)`，当用户修改站点主题色相时，所有框、节点、连线的颜色会自动联动。`boxes` 和 `ops` 还通过 `calc(var(--hue) + 45)` 做了色相偏移以保持视觉区分度。

示例：自定义一个始终为绿色的框

```svelte
<DFD boxes={[
  { x: 100, y: 100, label: "常量",
    fill: "#d4edda", stroke: "#28a745", textColor: "#155724" }
]}/>
```

示例：自定义一个跟随主题切换的框

```svelte
<DFD boxes={[
  { x: 100, y: 100, label: "动态",
    fill: { light: "#fff3cd", dark: "#3d2e00" },
    stroke: { light: "#ffc107", dark: "#ffab00" } }
]}/>
```

示例：使用 oklch 跟随站点主题色相

```svelte
<DFD boxes={[
  { x: 100, y: 100, label: "跟随主题",
    fill: "oklch(0.92 0.05 var(--hue))",
    stroke: "oklch(0.55 0.18 var(--hue))" }
]}/>
```

#### 导出色板常量

组件导出以下常量，可在 MDX 中直接引用：

| 常量       | 值                     | 用途                         |
| ---------- | ---------------------- | ---------------------------- |
| `ORANGE`   | `oklch(0.65 0.18 70)`  | 主线色                       |
| `GREEN`    | `oklch(0.65 0.15 130)` | 辅助线色（偏移 60°）         |
| `TEAL`     | `oklch(0.60 0.20 250)` | 运算数据流色（偏移 120°）    |
| `BLUE`     | `oklch(0.60 0.15 310)` | 控制/元数据流色（偏移 180°） |
| `PURPLE`   | `oklch(0.70 0.18 370)` | 地址/内存流色（偏移 240°）   |
| `PINK`     | `oklch(0.65 0.15 430)` | 特殊/异常流色（偏移 300°）   |
| `RW`, `RH` | `80`, `36`             | 寄存器盒宽高                 |
| `RRX`      | `4`                    | 寄存器盒圆角半径             |
| `OW`, `OH` | `88`, `36`             | 运算节点宽高                 |
| `ORX`      | `10`                   | 运算节点圆角半径             |

#### 颜色不随主题变化

如果希望某个元素在深/浅模式下颜色一致，直接传 hex 字符串即可，不要用 `{ light, dark }` 对象。

#### 去掉箭头

每条线默认自动加箭头。如果某条线不需要箭头，加 `noArrow: true`：

```svelte
<DFD lines={[
  { x1: 0, y1: 0, x2: 100, y2: 0, color: TEAL, noArrow: true },
]}/>
```

#### 添加新的框格风格

如需新增一类矩形（比如"内存块"），复制 `boxes`/`ops` 的渲染逻辑即可。打开 `DataFlowDiagram.svelte`，在 `<script>` 中新增色板常量：

```js
const MEM_FILL = { light: "#e8e8ff", dark: "#1a1a3e" };
const MEM_STROKE = { light: "#6366f1", dark: "#818cf8" };
```

然后在模板中新增 `{#each}`：

```svelte
<!-- memory blocks -->
{#each mems as m}
  <g>
    <rect x={m.x - (m.w ?? RW)/2} y={m.y - (m.h ?? RH)/2}
      width={m.w ?? RW} height={m.h ?? RH} rx={4}
      fill={resolve(m.fill ?? MEM_FILL)}
      stroke={resolve(m.stroke ?? MEM_STROKE)} stroke-width="2"
    />
    <text x={m.x} y={m.y + 5} text-anchor="middle"
      font-family="'Courier New', monospace" font-size="13"
      fill={resolve(m.textColor ?? TEXT)}>{m.label}</text>
  </g>
{/each}
```

然后在 Props 中新增 `mems` 属性，MDX 中即可使用 `mems={[...]}`。
