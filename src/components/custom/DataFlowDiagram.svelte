<script module>
  // ─── 导出常量（供 MDX 引用） ───
  // 色环上均匀拉开 30°（固定色相，避免 calc() 在 SSR 中解析失败）
  export const WHITE  = 'oklch(0.95 0.020 var(--hue))';
  export const BLACK  = 'oklch(0.12 0.020 var(--hue))';

  export const PINK   = 'oklch(0.65 0.15 10)';
  export const AMBER  = 'oklch(0.70 0.16 40)';
  export const ORANGE = 'oklch(0.65 0.18 70)';
  export const LIME   = 'oklch(0.68 0.16 100)';
  export const GREEN  = 'oklch(0.65 0.15 130)';
  export const CYAN   = 'oklch(0.62 0.15 160)';
  export const TEAL   = 'oklch(0.60 0.20 190)';
  export const INDIGO = 'oklch(0.58 0.16 220)';
  export const BLUE   = 'oklch(0.60 0.15 250)';
  export const VIOLET = 'oklch(0.62 0.18 280)';
  export const PURPLE = 'oklch(0.70 0.18 310)';
  export const ROSE   = 'oklch(0.65 0.18 340)';

  // 导出字体
  export const FONT_MATH = "Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif";
  export const FONT_SERIF = "'Times New Roman', 'Songti SC', 'SimSun', serif";
  export const FONT_SANS  = "Misans, 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
  export const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
</script>

<script>
  // ─── Props ───
  let {
    width = 520,
    height = 480,
    bg,                     // 可选，覆盖背景色；不传则自动跟随主题
    ariaLabel = '数据流图',
    registers = [],         // 寄存器风格盒子（原 boxes）：{ x, y, label, w?, h?, rx?, fill?, stroke?, textColor?, fontSize?, fontFamily?, strokeWidth? }
    ops = [],                // 运算节点风格盒子：字段同上
    custom = [],              // 完全自定义盒子：字段同上，默认值仅作兜底，不带寄存器/运算节点的语义配色
    lines = [],              // { x1, y1, x2, y2, color, noArrow? } — color 支持字符串或 {light,dark}
    polylines = [],          // { points: [[x,y],...], color, noArrow?, dash? }
    paths = [],               // { d: 'M...', color, noArrow?, dash? }
    braces = [],               // { x1, y1, x2, y2, side?, color?, strokeWidth?, dash? }
    circles = [],               // { cx, cy, r?, color }
    labels = [],                  // { x, y, text, color?, fontSize?, fontFamily? }
  } = $props();

  // ── 实例唯一前缀（避免同页多实例 marker id 冲突） ──
  const uid = Math.random().toString(36).slice(2, 8);

  // ── 深色模式 ──
  // 惰性求初始值，避免 SSR/首帧渲染用错主题导致的 hydration 闪烁（FOUC）
  let dark = $state(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  $effect(() => {
    dark = document.documentElement.classList.contains('dark');

    // 用 MutationObserver 监听 <html> 的 class 变化（覆盖手动切换和 system 模式）
    const observer = new MutationObserver(() => {
      dark = document.documentElement.classList.contains('dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // 兜底：监听系统偏好变化（当站点主题为 system 模式时）
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e) => {
      const stored = localStorage.getItem('theme');
      if (!stored || stored === 'system') dark = e.matches;
    };
    mq.addEventListener('change', onSystemChange);

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', onSystemChange);
    };
  });

  // ── 颜色工具 ──
  function resolve(c) {
    if (!c) return undefined;
    if (typeof c === 'string') return c;
    return dark ? c.dark : c.light;
  }

  // ── 默认常量 ──
  const BG   = { light: 'oklch(0.95 0.020 var(--hue))', dark: 'oklch(0.17 0.020 var(--hue))' };
  const TEXT_COLOR = { light: 'oklch(0.20 0.01 var(--hue))', dark: 'oklch(0.85 0.01 var(--hue))' };
  const FONT_SIZE = 13;
  const FONT_STYLE = 'normal';
  const BRACE_STROKE_WIDTH = 2.5;

  // ── 各盒子风格的默认值：尺寸/配色只服务于单一风格，直接内联，不再单独拆常量 ──
  const REGISTER_BOX = {
    w: 80, h: 36, rx: 4,
    fill:   { light: 'oklch(0.92 0.05 var(--hue))', dark: 'oklch(0.18 0.06 var(--hue))' },
    stroke: { light: 'oklch(0.55 0.18 var(--hue))', dark: 'oklch(0.65 0.15 var(--hue))' },
    strokeWidth: 2,
  };
  const OP_BOX = {
    w: 88, h: 36, rx: 10,
    // 需验证：module 顶部注释称 calc() 在 SSR 中解析失败,故导出常量固定了色相；
    // 这里仍用 calc(var(--hue) + 45)。若 SSR 构建有问题需要改成固定偏移色相。
    fill:   { light: 'oklch(0.93 0.05 calc(var(--hue) + 45))', dark: 'oklch(0.20 0.06 calc(var(--hue) + 45))' },
    stroke: { light: 'oklch(0.60 0.18 calc(var(--hue) + 45))', dark: 'oklch(0.70 0.15 calc(var(--hue) + 45))' },
    strokeWidth: 2.5,
  };
  const CUSTOM_BOX = {
    w: 88, h: 40, rx: 8,
    // 中性灰，不跟随 --hue，不带任何预设语义——用户不传 fill/stroke 时也只得到一个不抢眼的盒子
    fill:   BG,
    stroke: { light: 'oklch(0.65 0 0)', dark: 'oklch(0.55 0 0)' },
    strokeWidth: 2,
  };

  // ── 通用归一化 ──
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeDashRatio(dash = 0) {
    const ratio = clamp(dash, 0, 0.95);
    return ratio > 0 ? `${1 - ratio} ${ratio}` : undefined;
  }

  function normalizeBox(box, defaults) {
    return {
      x: box.x,
      y: box.y,
      w: box.w ?? defaults.w,
      h: box.h ?? defaults.h,
      rx: box.rx ?? defaults.rx,
      fill: resolve(box.fill ?? defaults.fill),
      stroke: resolve(box.stroke ?? defaults.stroke),
      textColor: resolve(box.textColor ?? TEXT_COLOR),
      fontSize: box.fontSize ?? FONT_SIZE,
      fontFamily: box.fontFamily ?? FONT_MONO,
      strokeWidth: box.strokeWidth ?? defaults.strokeWidth,
      label: box.label,
    };
  }

  function normalizeBrace(brace) {
    const label = braceLabelPos(brace);
    return {
      x1: brace.x1,
      y1: brace.y1,
      x2: brace.x2,
      y2: brace.y2,
      side: brace.side ?? 'auto',
      color: resolve(brace.color ?? TEXT_COLOR),
      strokeWidth: brace.strokeWidth ?? BRACE_STROKE_WIDTH,
      dash: brace.dash ?? 0,
      // 默认无内容：不传 text 时不渲染任何文字
      text: brace.text,
      textColor: resolve(brace.textColor ?? TEXT_COLOR),
      fontSize: brace.fontSize ?? FONT_SIZE,
      fontFamily: brace.fontFamily ?? FONT_MONO,
      labelX: label.x,
      labelY: label.y,
      labelAnchor: label.anchor,
    };
  }

  // 连线/圆点类元素的 color 统一走 resolve()，与 box/brace/label 保持一致的 {light,dark} 主题对象支持
  function normalizeLine(line) {
    return { ...line, color: resolve(line.color) };
  }

  function normalizePolyline(pl) {
    return { ...pl, color: resolve(pl.color) };
  }

  function normalizePath(p) {
    return { ...p, color: resolve(p.color) };
  }

  function normalizeCircle(c) {
    return { ...c, color: resolve(c.color) };
  }

  // ── 大括号 ──
  // 提取共用几何计算：bracePath（画线）和 braceLabelPos（文字定位）都基于同一套
  // horizontal/sign/apex 推导，避免两处重复计算导致后续改一处忘改另一处
  function braceGeometry({ x1, y1, x2, y2, side }) {
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const resolvedSide = side === 'auto' ? (horizontal ? 'bottom' : 'right') : side;
    const sign = resolvedSide === 'top' || resolvedSide === 'left' ? -1 : 1;
    const span = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
    const outer = clamp(span * 0.18, 4, 22);
    const apex = clamp(span * 0.08, 2, 14) + outer;
    return { horizontal, sign, outer, apex };
  }

  function bracePath(brace) {
    const { x1, y1, x2, y2 } = brace;
    const { horizontal, sign, outer, apex } = braceGeometry(brace);

    if (horizontal) {
      const y = (y1 + y2) / 2;
      const midX = (x1 + x2) / 2;
      return [
        `M ${x1} ${y}`,
        `L ${x1} ${y + sign * outer}`,
        `L ${midX} ${y + sign * outer}`,
        `L ${midX} ${y + sign * apex}`,
        `L ${midX} ${y + sign * outer}`,
        `L ${x2} ${y + sign * outer}`,
        `L ${x2} ${y}`,
      ].join(' ');
    }

    const x = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return [
      `M ${x} ${y1}`,
      `L ${x + sign * outer} ${y1}`,
      `L ${x + sign * outer} ${midY}`,
      `L ${x + sign * apex} ${midY}`,
      `L ${x + sign * outer} ${midY}`,
      `L ${x + sign * outer} ${y2}`,
      `L ${x} ${y2}`,
    ].join(' ');
  }

  // 文字锚点：突起顶点（apex）再往外留一点间距（BRACE_LABEL_GAP），避免和大括号重叠
  const BRACE_LABEL_GAP = 10;

  function braceLabelPos(brace) {
    const { x1, y1, x2, y2 } = brace;
    const { horizontal, sign, apex } = braceGeometry(brace);

    if (horizontal) {
      const y = (y1 + y2) / 2;
      const midX = (x1 + x2) / 2;
      // 水平大括号：文字在突起点正下方（bottom）或正上方（top），水平居中
      return { x: midX, y: y + sign * (apex + BRACE_LABEL_GAP), anchor: 'middle' };
    }

    const x = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    // 垂直大括号：文字在突起点右侧（right）或左侧（left），垂直居中（+4 为基线光学居中的手动微调）
    return { x: x + sign * (apex + BRACE_LABEL_GAP), y: midY + 4, anchor: sign > 0 ? 'start' : 'end' };
  }

  // ── 自动生成箭头标记 ──
  // id 前缀加入实例 uid，避免同页多个 DataFlowDiagram 实例间的 marker id 冲突
  function mid(color) { return `m-${uid}-` + color.replace(/[^a-zA-Z0-9]/g, ''); }

  let normalizedLines = $derived(lines.map(normalizeLine));
  let normalizedPolylines = $derived(polylines.map(normalizePolyline));
  let normalizedPaths = $derived(paths.map(normalizePath));
  let normalizedCircles = $derived(circles.map(normalizeCircle));

  let markerColors = $derived([...new Set(
    [...normalizedLines, ...normalizedPolylines, ...normalizedPaths]
      .filter(el => el.color && !el.noArrow)
      .map(el => el.color)
  )]);

  let registerBoxes = $derived(registers.map((box) => normalizeBox(box, REGISTER_BOX)));
  let opBoxes = $derived(ops.map((op) => normalizeBox(op, OP_BOX)));
  let customBoxes = $derived(custom.map((box) => normalizeBox(box, CUSTOM_BOX)));
  let braceItems = $derived(braces.map((brace) => normalizeBrace(brace)));
</script>

<svg
  viewBox="0 0 {width} {height}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label={ariaLabel}
  style="background:{resolve(bg ?? BG)}; width:100%; max-width:{width}px; display:block; margin: 0 auto; border-radius:8px;"
>
  <defs>
    {#each markerColors as color}
      <marker
        id={mid(color)}
        markerWidth="10" markerHeight="7"
        refX="10" refY="3.5"
        orient="auto" markerUnits="userSpaceOnUse"
      >
        <polygon points="0 0, 10 3.5, 0 7" fill={color} />
      </marker>
    {/each}
  </defs>

  <!-- registers（寄存器风格） -->
  {#each registerBoxes as b}
    {@render nodeBox(b)}
  {/each}

  <!-- ops（运算节点风格） -->
  {#each opBoxes as o}
    {@render nodeBox(o)}
  {/each}

  <!-- custom（完全自定义盒子，无预设语义配色，w/h/rx/fill/stroke/strokeWidth 均可自由覆盖） -->
  {#each customBoxes as c}
    {@render nodeBox(c)}
  {/each}

  <!-- lines -->
  {#each normalizedLines as { x1, y1, x2, y2, color, noArrow = false }}
    <line {x1} {y1} {x2} {y2}
      stroke={color} stroke-width="2"
      marker-end={color && !noArrow ? 'url(#' + mid(color) + ')' : undefined}
    />
  {/each}

  <!-- polylines -->
  {#each normalizedPolylines as { points, color, noArrow = false, dash = 0 }}
    <polyline
      points={points.map(p => p.join(',')).join(' ')}
      stroke={color} stroke-width="2" fill="none"
      pathLength="1"
      stroke-dasharray={normalizeDashRatio(dash)}
      marker-end={color && !noArrow ? 'url(#' + mid(color) + ')' : undefined}
    />
  {/each}

  <!-- paths -->
  {#each normalizedPaths as { d, color, noArrow = false, dash = 0 }}
    <path {d}
      stroke={color} stroke-width="2" fill="none"
      pathLength="1"
      stroke-dasharray={normalizeDashRatio(dash)}
      marker-end={color && !noArrow ? 'url(#' + mid(color) + ')' : undefined}
    />
  {/each}

  <!-- braces（大括号） -->
  {#each braceItems as brace}
    <path
      d={bracePath(brace)}
      stroke={brace.color}
      stroke-width={brace.strokeWidth}
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      pathLength="1"
      stroke-dasharray={normalizeDashRatio(brace.dash)}
    />
    {#if brace.text}
      <text
        x={brace.labelX} y={brace.labelY} text-anchor={brace.labelAnchor}
        font-family={brace.fontFamily} font-size={brace.fontSize}
        fill={brace.textColor}
      >
        {brace.text}
      </text>
    {/if}
  {/each}

  <!-- circles -->
  {#each normalizedCircles as { cx, cy, r = 5, color }}
    <circle {cx} {cy} {r} fill={color} />
  {/each}

  <!-- labels（纯文字，无背景和边框） -->
  {#each labels as l}
    <text
      x={l.x} y={l.y} text-anchor="middle"
      font-family={l.fontFamily ?? FONT_MONO}
      font-size={l.fontSize ?? FONT_SIZE}
      font-style={l.fontStyle ?? FONT_STYLE}
      fill={resolve(l.color ?? TEXT_COLOR)}
    >
      {l.text}
    </text>
  {/each}
</svg>

<!-- registers/ops/custom 渲染结构一致，仅默认值不同，提取为共享 snippet -->
{#snippet nodeBox(item)}
  <g>
    <rect
      x={item.x - item.w / 2} y={item.y - item.h / 2}
      width={item.w} height={item.h} rx={item.rx}
      fill={item.fill}
      stroke={item.stroke}
      stroke-width={item.strokeWidth}
    />
    <text
      x={item.x} y={item.y + 5} text-anchor="middle"
      font-family={item.fontFamily} font-size={item.fontSize}
      fill={item.textColor}
    >
      {item.label}
    </text>
  </g>
{/snippet}