<script module>
  // ─── 导出常量（供 MDX 引用） ───
  // 色环上均匀拉开 60°（固定色相，避免 calc() 在 SSR 中解析失败）
  export const ORANGE = 'oklch(0.65 0.18 70)';
  export const GREEN  = 'oklch(0.65 0.15 130)';
  export const TEAL   = 'oklch(0.60 0.20 190)';
  export const BLUE   = 'oklch(0.60 0.15 250)';
  export const PURPLE = 'oklch(0.70 0.18 310)';
  export const PINK   = 'oklch(0.65 0.15 10)';

  export const RW = 80, RH = 36, RRX = 4; // 寄存器盒尺寸
  export const OW = 88, OH = 36, ORX = 10; // 运算节点尺寸
</script>

<script>
  // ─── Props ───
  let {
    width = 520,
    height = 480,
    bg,                     // 可选，覆盖背景色；不传则自动跟随主题
    ariaLabel = '数据流图',
    boxes = [],             // { x, y, label, w?, h?, rx?, fill?, stroke?, textColor? }
    ops = [],               // { x, y, label, w?, h?, rx?, fill?, stroke?, textColor? }
    lines = [],             // { x1, y1, x2, y2, color, noArrow? }
    polylines = [],         // { points: [[x,y],...], color, noArrow? }
    paths = [],             // { d: 'M...', color, noArrow? }
    circles = [],           // { cx, cy, r?, color }
    labels = [],            // { x, y, text, color?, fontSize?, fontFamily? }
  } = $props();

  // ── 深色模式 ──
  let dark = $state(false);

  $effect(() => {
    dark = document.documentElement.classList.contains('dark');
    const onThemeChange = () => { dark = document.documentElement.classList.contains('dark'); };
    window.addEventListener('theme-change', onThemeChange);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e) => {
      const stored = localStorage.getItem('theme');
      if (!stored || stored === 'system') dark = e.matches;
    };
    mq.addEventListener('change', onSystemChange);
    return () => {
      window.removeEventListener('theme-change', onThemeChange);
      mq.removeEventListener('change', onSystemChange);
    };
  });

  // ── 颜色工具 ──
  // resolve(c) 接受 "#hex" 或 { light: "#hex", dark: "#hex" }，返当前主题色
  function resolve(c) {
    if (!c) return undefined;
    if (typeof c === 'string') return c;
    return dark ? c.dark : c.light;
  }

  // ── 默认色板（hex 作为 SSR 安全后备，运行时会通过 oklch + var(--hue) 跟随主题）
  //    注：fill/stroke 等 SVG 属性支持 oklch()，但内联 style 中的 oklch 在 SSR 时可能解析失败，
  //    故 BG 用纯 hex 避免构建问题；fill/stroke 用 oklch 则无此限制。
  const BG         = { light: 'oklch(0.95 0.020 var(--hue))', dark: 'oklch(0.17 0.020 var(--hue))' };
  const BOX_FILL   = { light: 'oklch(0.92 0.05 var(--hue))',  dark: 'oklch(0.18 0.06 var(--hue))' };
  const BOX_STROKE = { light: 'oklch(0.55 0.18 var(--hue))', dark: 'oklch(0.65 0.15 var(--hue))' };
  const OP_FILL    = { light: 'oklch(0.93 0.05 calc(var(--hue) + 45))',  dark: 'oklch(0.20 0.06 calc(var(--hue) + 45))' };
  const OP_STROKE  = { light: 'oklch(0.60 0.18 calc(var(--hue) + 45))', dark: 'oklch(0.70 0.15 calc(var(--hue) + 45))' };
  const TEXT       = { light: 'oklch(0.20 0.01 var(--hue))', dark: 'oklch(0.85 0.01 var(--hue))' };

  // ── 自动生成箭头标记 ──
  let markerColors = $derived([...new Set(
    [...lines, ...polylines, ...paths]
      .filter(el => el.color && !el.noArrow)
      .map(el => el.color)
  )]);

  function mid(color) { return 'm-' + color.replace(/[^a-zA-Z0-9]/g, ''); }
</script>

<svg
  viewBox="0 0 {width} {height}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label={ariaLabel}
  style="background:{resolve(bg ?? BG)}; width:100%; max-width:{width}px; display:block; border-radius:8px;"
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

  <!-- lines -->
  {#each lines as { x1, y1, x2, y2, color, noArrow = false }}
    <line {x1} {y1} {x2} {y2}
      stroke={color} stroke-width="2"
      marker-end={color && !noArrow ? 'url(#' + mid(color) + ')' : undefined}
    />
  {/each}

  <!-- polylines -->
  {#each polylines as { points, color, noArrow = false }}
    <polyline
      points={points.map(p => p.join(',')).join(' ')}
      stroke={color} stroke-width="2" fill="none"
      marker-end={color && !noArrow ? 'url(#' + mid(color) + ')' : undefined}
    />
  {/each}

  <!-- paths -->
  {#each paths as { d, color, noArrow = false }}
    <path {d}
      stroke={color} stroke-width="2" fill="none"
      marker-end={color && !noArrow ? 'url(#' + mid(color) + ')' : undefined}
    />
  {/each}

  <!-- circles -->
  {#each circles as { cx, cy, r = 5, color }}
    <circle {cx} {cy} {r} fill={color} />
  {/each}

  <!-- boxes（寄存器风格） -->
  {#each boxes as b}
    <g>
      <rect
        x={b.x - (b.w ?? RW) / 2} y={b.y - (b.h ?? RH) / 2}
        width={b.w ?? RW} height={b.h ?? RH} rx={b.rx ?? RRX}
        fill={resolve(b.fill ?? BOX_FILL)}
        stroke={resolve(b.stroke ?? BOX_STROKE)}
        stroke-width="2"
      />
      <text
        x={b.x} y={b.y + 5} text-anchor="middle"
        font-family="'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" font-size="13"
        fill={resolve(b.textColor ?? TEXT)}
      >
        {b.label}
      </text>
    </g>
  {/each}

  <!-- ops（运算节点风格） -->
  {#each ops as o}
    <g>
      <rect
        x={o.x - (o.w ?? OW) / 2} y={o.y - (o.h ?? OH) / 2}
        width={o.w ?? OW} height={o.h ?? OH} rx={o.rx ?? ORX}
        fill={resolve(o.fill ?? OP_FILL)}
        stroke={resolve(o.stroke ?? OP_STROKE)}
        stroke-width="2.5"
      />
      <text
        x={o.x} y={o.y + 5} text-anchor="middle"
        font-family="'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" font-size="13"
        fill={resolve(o.textColor ?? TEXT)}
      >
        {o.label}
      </text>
    </g>
  {/each}
  <!-- labels（纯文字，无背景和边框） -->
  {#each labels as l}
    <text
      x={l.x} y={l.y} text-anchor="middle"
      font-family={l.fontFamily ?? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"}
      font-size={l.fontSize ?? 13}
      fill={resolve(l.color ?? TEXT)}
    >
      {l.text}
    </text>
  {/each}
</svg>