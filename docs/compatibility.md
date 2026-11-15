# 兼容情况

## 当前依据

| 项目 | 状态 |
| --- | --- |
| 目标平台 | Windows 小狼毫输入法 |
| 正式配置 | [skins/fluent-2/weasel.custom.yaml](../skins/fluent-2/weasel.custom.yaml) |
| 预览布局依据 | Weasel 0.17.4；不是支持版本范围或 Windows 实测结论 |
| 配置补丁语义依据 | librime 1.13.1 |
| 预览默认配置 | 工具固定的官方快照，版本与提交见[来源记录](../tools/preview/data/README.md) |
| Windows 验收 | 尚未形成可复核的验收记录，发布前补充 |

用户曾报告在 4K、150% 系统缩放下，浏览器预览与小狼毫的标记间距存在差异。工具已据原生实现修正相关计算，并提供布局对照；这不能替代该环境下的再次实测。

## 字体与缩放

皮肤优先使用 Microsoft YaHei UI / Microsoft YaHei 和 Segoe UI。Linux 浏览器预览可回退到 Noto 字体，缺少字体时工具会给出诊断。字形、字宽、换行与抗锯齿可能因此变化。

浏览器日常预览使用自身 DPR。`pnpm capture --dpr 1.5` 可检查对应 150% 缩放的设备像素布局，仍不能模拟 Windows 的 DirectWrite 字体度量与全部原生绘制。

## 展示图片

README 中的浅色、深色图片来自 Linux Chromium，使用正式 YAML、日常输入场景、DPR 1.5 和 100% 预览缩放。它们展示浏览器仿真结果；完整运行产物保存在本地 `artifacts/` 中，不随仓库提交。

## Windows 验收记录

后续实测时记录 Windows 版本、小狼毫确切版本、显示分辨率与缩放、所用字体、皮肤提交及浅深色方案；检查日常候选、长词、混排、符号、边缘裁切和明暗切换。确认后在本节附上结果及实机截图。

工具的全部限制及原生对照范围见[预览工具文档](../tools/preview/README.md#已知边界)。
