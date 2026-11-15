# Fluent 2 小狼毫皮肤

为 Windows 小狼毫输入法制作的 Fluent 2 风格皮肤，提供浅色与深色配色。采用中性浮层、蓝色选中态、圆角和阴影；具体设计取舍见[设计说明](docs/design.md)。

| 浅色 | 深色 |
| --- | --- |
| ![Fluent 2 浅色浏览器预览](docs/images/fluent-2-light.png) | ![Fluent 2 深色浏览器预览](docs/images/fluent-2-dark.png) |

以上为 Linux Chromium 浏览器仿真效果，使用字体回退；Windows 实际字体和绘制效果可能不同。实测记录见[兼容情况](docs/compatibility.md)。

## 安装

正式配置：[skins/fluent-2/weasel.custom.yaml](skins/fluent-2/weasel.custom.yaml)。安装皮肤无需 Node.js 或 pnpm。

1. 从小狼毫托盘菜单打开「用户文件夹」。
2. 如果尚无 `weasel.custom.yaml`，将本仓库的正式配置复制进去。如果已有该文件，先备份，再将皮肤的 `patch` 条目合并到现有的 `patch` 字典中；同名配色或样式设置需自行取舍。
3. 从托盘菜单执行「重新部署」。

配置通过 `style/color_scheme: fluent_light` 和 `style/color_scheme_dark: fluent_dark` 指定浅色与深色方案。若要固定一种外观，可将这两个值都设为对应的方案名。

中文字体优先使用 Microsoft YaHei UI / Microsoft YaHei，序号优先使用 Segoe UI；其他系统的字体回退与预览限制见[兼容情况](docs/compatibility.md)。官方定制说明的本地快照见 [docs/weasel-official](docs/weasel-official/README.md)。

## 开发皮肤

需要 Node.js 22.12+ 和 pnpm。在仓库根目录运行：

```bash
pnpm install
pnpm dev
```

打开 **http://10.126.179.2:5173**。编辑 `skins/fluent-2/weasel.custom.yaml` 后自动更新预览，默认场景来自 `previews/scenes.json`。

首次生成截图时安装 Chromium，然后捕获浅色、深色与全部场景：

```bash
pnpm browser:install
pnpm capture --dpr 1.5
```

截图、独立 HTML 和结构化报告保存在 `artifacts/`。开发与发布检查见[开发说明](docs/development.md)，工具参数和实现见[预览工具文档](tools/preview/README.md)。

## 仓库结构

```text
skins/fluent-2/    正式皮肤配置，预览与发布使用同一份文件
previews/          皮肤预览场景
docs/              设计依据、兼容记录、展示图片与官方文档快照
tools/preview/     配套预览工具的源码、测试、脚本与上游默认数据
artifacts/         临时截图与检查报告，不提交
```

本项目自有皮肤与代码使用 [MIT 许可](LICENSE)。预览工具内的[官方默认配置快照](tools/preview/data/README.md)保留其上游许可与作者信息。
