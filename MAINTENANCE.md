# 小蓝工具箱维护说明

## 目录分工

- `main.js`: Electron 入口，只负责窗口、IPC 路由和把各模块接起来。一般业务 bug 不优先改这里。
- `core/generation-service.js`: 一次生成任务的编排层，负责校验配置、组装请求、调用上游、保存结果、写历史、并发保护。
- `core/generation.js`: 生成参数规则，包含模型、尺寸、质量、输出格式、提示词补强和发给客户端可见的 payload。
- `core/image-api.js`: 图片生成上游适配，包含文生图、图生图、JSON/form-data/multipart 参考图请求和重试兜底。
- `core/image-results.js`: 生成图片下载、base64 解码、文件命名、结果保存、编辑后参考图保存。
- `core/reference-images.js`: 参考图读取、压缩到 1MB 内、多图参考板、multipart body、data URL。
- `core/reference-prompt-api.js`: 参考图转生成词的主流程适配。
- `core/http-client.js`: 超时 fetch、低层 buffer POST、JSON 响应解析、网络错误识别。
- `core/endpoints.js`: API 地址补全和 chat/responses 端点推导。
- `core/app-storage.js`: 用户配置、默认输出目录、历史记录读写。
- `core/auto-updater.js`: 在线升级状态机、检查更新、下载更新、安装更新。
- `core/canvas-export.js`: 画布导出图片保存。
- `renderer/app-config.js`: 前端常量，包含默认提示词、超时、参考图数量、尺寸文案。
- `renderer/renderer.js`: 前端交互逻辑。后续可继续拆，但改 UI 行为先从这里看。
- `renderer/image-inspector.js` / `renderer/image-inspector.css`: 选中生成图后的生成词、参数和再次生成/设为参考图/放入画布操作。
- `renderer/canvas-workbench.js` / `renderer/canvas-workbench.css`: 轻量画布工作台，负责图片摆放、缩放、层级、导出、加入参考图、用画布生成。
- `renderer/styles.css`: 全局基础视觉样式。
- `renderer/prompt-library-layout.css`: 灵感区/提示词大纲卡片布局补丁，按钮被吃、文字重叠、封面比例问题优先改这里。
- `renderer/prompt-library.js`: 内置灵感提示词、分类、自选拼词选项和 32 张参考封面映射。
- `tools/reference-prompt.js`: 参考图转生成词接口适配。
- `tools/verify-generation-rules.js`: 生成参数回归检查。
- `tools/verify-project-structure.js`: 工程结构护栏，检查旧文件残留、透明底残留、前端脚本/CSS 接线和打包文件范围。

## 当前硬规则

- 透明底功能已经整体删除。UI、配置、请求 payload、本地后处理里都不应再出现透明底选项或 `background: "transparent"`。
- 图生图必须保留参考图语义；如果上游没有真正接收参考图，宁可报错停止，也不要退化成无参考图文生图。
- 前端不再展示“文字生图/图片生图”模式切换。统一入口规则是：没有参考图就直接生成；参考图区有图就自动参考生成。
- 参考图上传前可以压缩，但目标是控制体积，不改变用户选择的是“用参考图生成”这一事实。
- 灵感区卡片必须稳定显示：封面完整可见、文字可读、标签不挤压按钮、追加/填入按钮固定在底部区域。
- 根目录不再保留旧版源码入口，旧版 `generation.js`、`index.html`、`renderer.js`、`styles.css`、`reference-prompt.js` 都应删除。

## 常用验证命令

一键检查：

```powershell
npm run verify
```

拆开检查：

```powershell
node --check main.js
node --check core\app-storage.js
node --check core\auto-updater.js
node --check core\canvas-export.js
node --check core\generation-service.js
node --check core\generation.js
node --check core\http-client.js
node --check core\image-api.js
node --check core\image-results.js
node --check core\reference-images.js
node --check core\reference-prompt-api.js
node --check renderer\app-config.js
node --check renderer\canvas-workbench.js
node --check renderer\image-inspector.js
node --check renderer\prompt-library.js
node --check renderer\renderer.js
node tools\verify-generation-rules.js
node tools\verify-project-structure.js
```

Electron 启动冒烟：

```powershell
$exe = Join-Path (Get-Location) 'node_modules\.bin\electron.cmd'
$p = Start-Process -FilePath $exe -ArgumentList '.' -WorkingDirectory (Get-Location) -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 8
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
```

Windows 打包：

```powershell
npm run dist:win
```

打包后确认 `app.asar` 中包含新模块：

```powershell
& .\node_modules\.bin\asar.cmd list .\dist\win-unpacked\resources\app.asar | Select-String -Pattern '\\core\\app-storage.js|\\core\\generation-service.js|\\core\\image-results.js|\\core\\auto-updater.js|\\renderer\\app-config.js|\\renderer\\prompt-library-layout.css'
```

## 修改入口建议

改模型、尺寸、质量、输出格式、提示词补强时，优先看 `core/generation.js` 和 `renderer/app-config.js`。

改接口兼容、超时、multipart、Packy/OpenAI 图片接口时，优先看 `core/image-api.js`、`core/reference-images.js` 和 `core/http-client.js`。

改结果保存、文件名、下载远程 URL、编辑后的参考图保存时，优先看 `core/image-results.js`。

改“点击生成以后发生什么”、历史记录写入、并发阻止时，优先看 `core/generation-service.js`。

改灵感区显示、按钮被遮挡、封面比例、卡片高度时，优先看 `renderer/prompt-library-layout.css`。

改画布交互、画布导出为参考图、用画布生成时，优先看 `renderer/canvas-workbench.js`、`renderer/canvas-workbench.css` 和 `core/canvas-export.js`。

改点击图片后显示生成词、复制/填入/再次生成/放入画布时，优先看 `renderer/image-inspector.js` 和 `renderer/image-inspector.css`。

改内置灵感提示词、自选提示词种类、参考封面对应关系时，优先看 `renderer/prompt-library.js`。

改配置保存、默认输出目录、历史读取清空时，优先看 `core/app-storage.js`。
