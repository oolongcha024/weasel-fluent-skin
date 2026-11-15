# 开发与发布

## 修改与预览

仓库的正式皮肤只有 [skins/fluent-2/weasel.custom.yaml](../skins/fluent-2/weasel.custom.yaml) 这一份。修改前可参考[设计说明](design.md)和[官方定制文档](weasel-official/README.md)。

在仓库根目录运行：

```bash
pnpm install
pnpm dev
```

打开终端显示的访问地址。默认皮肤与 [previews/scenes.json](../previews/scenes.json) 都支持保存后自动更新。工具只读取配置，Windows 部署仍需在小狼毫中执行。

根目录命令转发到 `tools/preview`，该目录拥有工具的依赖与测试。也可以在工具目录运行相同命令；默认皮肤、场景与产物位置始终指向仓库。显式传入的相对路径按调用 pnpm 时所在目录解析：

```bash
pnpm dev --config skins/fluent-2/weasel.custom.yaml --scenes previews/scenes.json
```

## 监听地址与端口

网络参数只通过命令行设置，无需环境变量或本地配置文件。

| 参数 | 行为 |
| --- | --- |
| 不传网络参数 | 仅本机访问，系统自动分配空闲端口 |
| `--host` | 指定监听 IP 或主机名，用于远程开发；只填写地址，不包含协议或端口 |
| `--port` | 指定端口；`0` 表示自动分配，非零端口被占用时直接报错 |

远程开发时，在 `pnpm dev` 后附上 `--host` 和当前开发环境的监听地址，然后打开启动日志中的相应访问地址。需要稳定端口时再附上 `--port`。热更新跟随浏览器当前访问地址，无需另设 HMR 地址。

截图与测试默认使用本机连接和临时端口，从实际监听结果取得连接地址。即使指定监听所有网卡，截图程序也会使用可连接的本机地址。

## 检查与捕获

```bash
pnpm check
pnpm test
pnpm browser:install
pnpm test:browser
pnpm build
pnpm capture --dpr 1.5
```

捕获默认覆盖正式配置中的浅色、深色方案和仓库的全部预览场景。每次运行在根目录 `artifacts/` 中生成独立目录，包含配置快照、PNG、独立 HTML、绘制计划和诊断报告；查看图片时同时阅读字体与兼容诊断。

修改工具的布局实现时，再运行原生对照：

```bash
pnpm verify:native
```

该命令需要网络及 C++17 编译器；也支持通过 `--upstream /path/to/weasel/WeaselUI` 使用本地固定版本源码。原生验证比较固定字体尺寸下的布局矩形，不是 Windows 像素验收。更多参数与模块说明见[工具文档](../tools/preview/README.md)。

`pnpm build` 只构建预览工具，输出 `tools/preview/dist/`；皮肤本身不需要编译。

## 发布皮肤

发布内容直接使用正式 YAML，无需从工具构建目录中提取。先在 Windows 小狼毫中重新部署，检查两个配色和典型输入场景，再将版本、字体、缩放及结果写入[兼容记录](compatibility.md)。

需要更新 README 效果图时，将确认过的精选图片放入 `docs/images/` 并更新来源说明。其余截图和检查报告保留在忽略的 `artifacts/` 中；浏览器仿真图与 Windows 实机图应分别标注。

如果发布独立下载文件，应从 `skins/fluent-2/weasel.custom.yaml` 原样取得，避免另维护一份发布副本。
