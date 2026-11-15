# Weasel Studio

在编辑器中修改 `weasel.custom.yaml`，浏览器自动预览候选窗口。agent 使用同一套渲染器生成截图、HTML 和结构化检查结果。

## 启动

需要 Node.js 22.12+ 和 pnpm。

```bash
pnpm install
pnpm dev
```

打开 **http://10.126.179.2:5173**。默认读取 [examples/fluent.custom.yaml](examples/fluent.custom.yaml)，包含浅色与深色示例。

预览自己的文件：

```bash
pnpm dev --config /path/to/weasel.custom.yaml
```

服务和热更新均使用 `10.126.179.2`。`--port 5174` 可指定其他端口。工具只读取文件，不写回配置，也不执行小狼毫部署。

页面支持切换场景、配色方案、配置中的明暗配色、画布背景和缩放。保存文件后保留当前选择。画布背景只影响观察环境，配色方案切换只影响当前预览，不改动 YAML。

## agent 检查

首次使用截图功能需要安装 Chromium：

```bash
pnpm browser:install
pnpm capture --config examples/fluent.custom.yaml
```

这条命令自行启动临时服务、渲染、截图并退出，不需要提前运行 `pnpm dev`。服务仍监听 `10.126.179.2`，默认使用空闲端口。每次结果保存在 `artifacts/` 下独立的运行目录，不会混用旧截图；该目录已加入 Git 忽略规则。

输出内容：

| 文件 | 内容 |
| --- | --- |
| `manifest.json` | 运行状态、输入摘要、默认配置版本、视口、浏览器版本、诊断和场景产物索引 |
| `input.yaml` | 此次渲染使用的原始配置快照 |
| `effective.json` | 生效样式、配色、补丁合并结果与参数来源 |
| `scenes.json` | 此次渲染使用的场景 |
| `01-everyday.png` 等 | 每个场景的页面截图，浅色、深色使用不同编号 |
| 同名 `.json` | 当前配色与场景、输入摘要、字体可用性、窗口尺寸、诊断和 DOM |
| 同名 `.html` | 内含渲染 CSS 的独立预览 HTML，可离线打开；字体仍依赖打开它的系统 |

默认截图覆盖配置引用的浅色、深色方案与全部场景，固定视口 1600 × 1000、设备缩放 1、预览缩放 100%。也可以指定一个配色：

```bash
pnpm capture --config examples/fluent.custom.yaml --scheme fluent_dark --out artifacts
```

语法错误、关键参数无效、引用不存在的配色、浏览器渲染失败时返回非零退出码。配置错误时会输出失败清单和诊断，不生成图片。`status: complete` 表示本次检查执行完成，仍需阅读诊断并查看图片；不能据此认定与 Windows 原生渲染完全一致。

开发模式还提供只读的 `/api/config`，浏览器中的 `window.__WEASEL_PREVIEW__` 包含 `state`、`report` 和异步 `select({ scheme, scene })`，便于自动检查。

## 配置解释

输入文件应包含 `patch:` 字典。支持路径赋值、字典节点赋值、`/+` 字典合并、常见布局别名，以及 ABGR / ARGB / RGBA 颜色（含透明通道与简写）。

```yaml
patch:
  "style/color_scheme": my_theme
  "style/+":
    horizontal: true
    font_point: 15
  "style/layout/corner_radius": 10
  "preset_color_schemes/my_theme":
    color_format: argb
    back_color: 0xFFF9F9F9
    text_color: 0xFF202020
```

节点赋值会替换该节点，`/+` 用于保留其他条目的合并。缺省设置首先来自固定的官方配置；被替换节点中缺失的参数使用运行时缺省值。配色缺失项按前端的回退关系补齐。原始颜色标量保留位数，因此 `0x00000000`（透明）与 `0x000000`（不透明黑色）不会混淆。

生效参数区分「用户配置」「官方默认」「运行时默认」「运行时派生」。高亮内边距导致间距扩展等属于小狼毫自身的运行时规则，并非工具自动美化。工具不做颜色对比度修正，也不为了让窗口看起来更协调而改动数值。

内置默认配置的版本和来源见 [data/README.md](data/README.md)。无需自行提供 `weasel.yaml`。

## 自定义场景

日常输入、长词与混排、特殊字符三个场景可以覆盖常见情况。使用 JSON 数组替换场景：

```bash
pnpm dev --config examples/fluent.custom.yaml --scenes examples/scenes.json
pnpm capture --config examples/fluent.custom.yaml --scenes examples/scenes.json
```

格式见 [examples/scenes.json](examples/scenes.json)。`highlighted` 是从 0 开始的选中候选索引，`highlightedPreedit` 指定编码中的高亮片段；候选项可额外设置 `label`。预览遵循 YAML 中的布局，不会为了场景覆盖横竖排。场景文件的保存同样触发热更新。

## 已知边界

- 这是浏览器仿真，没有运行 Rime 输入引擎。字体度量、抗锯齿、阴影和原生绘制可能不同；发布皮肤前仍需 Windows 小狼毫实机确认。
- 字体使用预览所在系统的实际字体。缺少字体时会列出提示，字体探测是启发式检查，不能保证每个字符都有字形。系统安装了新字体后需重启浏览器。码位范围暂不模拟，字体家族、常用字重和字形会映射到 CSS。
- 支持横排候选、竖排候选、文字竖排，序号、注释、预编辑内容、边框、圆角、阴影和高亮标记。尺寸限制使用浏览器换行，不能保证与小狼毫的原生折叠算法相同。
- 全屏、竖排自动反向、行距与基线百分比、平台抗锯齿等尚未模拟；设置相关选项时会提示。与外观无关的应用和输入行为配置不参与渲染。
- 不解析跨文件 `__include` / `__patch`、输入方案外观覆盖、Lua 或 Rime 编译器的完整语法；复杂列表补丁不在当前兼容范围。无法解析的依赖会被列出。
- YAML 错误时，页面保留并明确标记上一次有效画面为过期；该画面不会被截图命令采用。截图始终使用一次读取的固定快照，清单记录其 SHA-256。
- `pnpm build` 检查并构建前端资源；`dist/` 需要本地文件服务提供 `/api/config`，不能单独作为静态站点使用。日常使用入口为 `pnpm dev`。

## 开发与验证

```bash
pnpm check
pnpm test
pnpm test:browser
pnpm build
```

`test` 验证补丁语义、颜色、参数来源、错误处理和场景校验；`test:browser` 需要 Chromium，验证真实截图命令的输出、快照一致性与失败隔离。

```text
src/core/     配置解析、补丁、生效值、颜色与场景（不依赖 DOM）
src/render/   候选窗口 DOM/CSS、字体探测与渲染报告
src/server/   本地文件读取、监听与预览服务
src/main.ts   浏览器界面
scripts/      开发入口与独立截图命令
```

项目独立实现，参考了 [小狼毫官方文档](https://github.com/rime/weasel/wiki/Weasel-定制化) 和 [JGCindy/rime-weasel-skin-studio](https://github.com/JGCindy/rime-weasel-skin-studio) 的功能思路，没有引入该编辑器源码。官方文档本地快照见 [docs/weasel-official](docs/weasel-official/README.md)。
