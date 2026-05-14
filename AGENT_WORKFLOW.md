# Agent 工作流证明

本项目使用 Agent 辅助完成桌面端 AI 生图工具的前端修复、自动化测试和跨平台打包验证。

## Agent 参与内容

- 检查 Electron 前端代码，包括 `renderer/index.html`、`renderer/styles.css`、`renderer/renderer.js`。
- 修复生成页、图库、设置页、参考图、预览区和模型选择相关问题。
- 增加图片转生成词模型自由输入和模型读取能力。
- 增加 Gemini 原生 `generateContent` 兼容，同时保留 OpenAI 兼容接口的 `chat/completions` 和 `responses` 路径。
- 修复读取模型后下拉选项不可见的问题，保留输入框并增加真实 `select` 下拉。
- 生成 Windows 便携版 exe 和 macOS 测试源码包。

## 自动化测试命令

```bash
npm run test:desktop
```

该命令包含：

- `node --check` 语法检查。
- `tools/verify-generation-rules.js` 生成规则检查。
- `tools/verify-reference-prompt.js` 参考图生成词兼容检查。
- `tools/verify-project-structure.js` 项目结构检查。
- `tools/ui-layout-smoke.js` Electron UI 布局和按钮点击烟测。
- `tools/gallery-history-smoke.js` 图库显示烟测。

最近一次本地测试结果：

```json
{
  "layoutIssueCount": 0,
  "clickIssueCount": 0,
  "runtimeErrorCount": 0,
  "metaActionOverlaps": [],
  "collapsedCards": []
}
```

## macOS 工作流

GitHub Actions 工作流文件：

```text
.github/workflows/mac-build-test.yml
```

工作流会执行：

```bash
npm ci
npm run test:mac
npx electron-builder --mac dmg zip --publish never
```

本地 Mac 真机也可运行：

```bash
npm install
npm run test:mac
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:unsigned
```

## 可用于额度申请的说明

本项目是一个真实桌面端 AI 生图客户端，Agent 工作流覆盖需求拆解、前端问题定位、代码修复、自动化测试、Windows 打包、Mac 真机打包和 GitHub Actions macOS 构建验证。

