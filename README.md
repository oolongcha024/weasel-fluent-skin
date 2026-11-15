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
| 同名 `.json` | 当前配色与场景、输入摘要、字体可用性、窗口尺寸、诊断、DOM 和设备像素布局矩形 `geometry` |
| 同名 `.html` | 内含渲染 CSS 的独立预览 HTML，可离线打开；字体仍依赖打开它的系统 |

默认截图覆盖配置引用的浅色、深色方案与全部场景，固定 CSS 视口 1600 × 1000、设备缩放 1、预览缩放 100%。也可以指定一个配色：

```bash
pnpm capture --config examples/fluent.custom.yaml --scheme fluent_dark --out artifacts
```

检查 Windows 150% 系统缩放对应的设备像素布局：

```bash
pnpm capture --config examples/fluent.custom.yaml --dpr 1.5
```

`--dpr` 支持 0.5–4。它影响布局取整和截图像素密度，不改变 YAML，也不改变页面的预览缩放。浏览器日常预览自动使用自己的 DPR。

语法错误、关键参数无效、引用不存在的配色、浏览器渲染失败时返回非零退出码。配置错误时会输出失败清单和诊断，不生成图片。`status: complete` 表示本次检查执行完成，仍需阅读诊断并查看图片；不能据此认定与 Windows 原生渲染完全一致。

开发模式还提供只读的 `/api/config`，浏览器中的 `window.__WEASEL_PREVIEW__` 包含 `state`、`report` 和异步 `select({ scheme, scene })`，便于自动检查。

## 配置解释

输入文件应包含 `patch:` 字典。支持路径赋值、字典节点赋值、`/+` 字典合并与字符串/列表追加、`/=` 强制替换、常见布局别名，以及 ABGR / ARGB / RGBA 颜色（含透明通道与简写）。

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

节点赋值会替换该节点，`/+` 用于保留其他条目的合并。补丁按原生有序字典的键顺序应用，与 YAML 书写顺序无关；有重叠路径时，较具体的后续键可以覆盖前面的合并。合并字典内部的普通键按字面节点名处理，嵌套结构请使用字典；字符串追加会保留原字符串，类型不兼容会报错。

缺省设置首先来自固定的官方配置；被替换节点中缺失的参数使用运行时缺省值。配色缺失项按前端的回退关系补齐。颜色支持 3、4、6、7、8 位十六进制表示，原始颜色标量保留位数，因此 `0x00000000`（透明）与 `0x000000`（不透明黑色）不会混淆。十进制整数按原生有符号 32 位规则读取，转换颜色通道前补不透明通道；需要透明度时使用十六进制。

生效参数区分「用户配置」「官方默认」「运行时默认」「运行时派生」。高亮内边距导致间距扩展等属于小狼毫自身的运行时规则，并非工具自动美化。工具不做颜色对比度修正，也不为了让窗口看起来更协调而改动数值。

内置默认配置的版本和来源见 [data/README.md](data/README.md)。无需自行提供 `weasel.yaml`。

## 自定义场景

日常输入、长词与混排、特殊字符三个场景可以覆盖常见情况。使用 JSON 数组替换场景：

```bash
pnpm dev --config examples/fluent.custom.yaml --scenes examples/scenes.json
pnpm capture --config examples/fluent.custom.yaml --scenes examples/scenes.json
```

格式见 [examples/scenes.json](examples/scenes.json)。`highlighted` 是从 0 开始的选中候选索引，`highlightedPreedit` 指定编码中的高亮片段；候选项可额外设置 `label`。`currentPage`（默认 0）和 `isLastPage`（默认 false）用于模拟翻页箭头的禁用颜色；箭头仅在两个翻页颜色都不透明且预编辑区未内嵌时显示。预览遵循 YAML 中的布局，不会为了场景覆盖横竖排。场景文件的保存同样触发热更新。

## 原生实现对照

配置编辑语义对照 [librime 1.13.1 的配置编译器](https://github.com/rime/librime/blob/1.13.1/src/rime/config/config_compiler.cc)，字体、颜色和布局行为对照 [Weasel 0.17.4](https://github.com/rime/weasel/tree/0.17.4/WeaselUI)。默认配置数据的上游提交独立记录在 `data/upstream.json`。

[src/core/layout.ts](src/core/layout.ts) 先计算完整矩形，再由 DOM 绘制，支持以下原生规则：

- 所有布局数值乘 DPR 后截断到设备像素，测得的文字矩形向上取整；边框作为描边绘制，不重复占用内容宽高。
- 最小宽高约束窗口整体；每行末尾候选的背景延伸到统一的右侧留白，文字本身不拉伸。
- 横排、竖排、文字竖排采用各自的排列和注释对齐规则；仅实际显示的注释参与测量，透明注释不占位。
- 预编辑编码按普通/高亮分段排列，分段留出 `hilite_spacing`，高亮背景按 `hilite_padding_x/y` 外扩。
- 标记先占位再绘制，默认条形标记至少 6 个设备像素；窗口圆角缺省时回退到 `round_corner`。

截图报告的 `geometry` 包含 `basis`、`density`、换算后的 `layout`，以及窗口、候选、文字、高亮、标记和翻页矩形。这里的尺寸与坐标均为设备像素，除以 `density` 得到 CSS 像素；原始生效配置仍保留逻辑值。

## 已知边界

- 这是浏览器仿真，没有运行 Rime 输入引擎。字体度量、抗锯齿、阴影和原生绘制可能不同；发布皮肤前仍需 Windows 小狼毫实机确认。
- 字体使用预览所在系统的实际字体。缺少字体时会列出提示，字体探测是启发式检查，不能保证每个字符都有字形。系统安装了新字体后需重启浏览器。码位范围暂不模拟，字体家族、常用字重和字形会映射到 CSS。
- 候选行按原生矩形规则排列；单条文字的折行仍由浏览器测量，可能与 DirectWrite 的断行位置不同。
- 高亮标记会预留布局空间；默认竖线从高亮背景边缘开始绘制，竖线与序号之间保留高亮内边距。粗细参考原生至少 6 个设备像素的规则，并按浏览器 DPR 换算；字体度量仍是近似值。Windows 系统缩放会自然反映到浏览器 DPR，无需再把页面缩放到相同比例。
- 全屏、文字竖排自动折列、竖排自动反向、行距与基线百分比、平台抗锯齿等尚未模拟；设置相关选项时会提示。场景描述组合输入状态，不模拟状态图标和辅助通知。与外观无关的应用和输入行为配置不参与渲染。
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

`test` 验证补丁语义、颜色、参数来源、错误处理、场景校验和注入固定字体尺寸的原生矩形契约；`test:browser` 需要 Chromium，验证真实截图输出、快照一致性、失败隔离以及 100%/150% 下的尺寸、标记、注释和预编辑背景。

```text
src/core/     配置解析、补丁、生效值、颜色与场景（不依赖 DOM）
src/render/   候选窗口 DOM/CSS、字体探测与渲染报告
src/server/   本地文件读取、监听与预览服务
src/main.ts   浏览器界面
scripts/      开发入口与独立截图命令
```

项目独立实现，参考了 [小狼毫官方文档](https://github.com/rime/weasel/wiki/Weasel-定制化) 和 [JGCindy/rime-weasel-skin-studio](https://github.com/JGCindy/rime-weasel-skin-studio) 的功能思路，没有引入该编辑器源码。官方文档本地快照见 [docs/weasel-official](docs/weasel-official/README.md)。
