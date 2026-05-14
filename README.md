# 小蓝工具箱

小蓝工具箱是一个 Electron 桌面端 AI 生图客户端，用于连接 OpenAI 兼容图片生成接口和可识图模型接口，支持 Windows 与 macOS 测试打包。

## 主要功能

- 文本生图与参考图生图。
- 最多 16 个并发生成任务。
- 最多 16 张参考图，支持拖拽、选择和粘贴添加。
- 自定义分辨率、质量、输出格式和输出目录。
- 图片转生成词模型可自由输入，也可从接口读取模型列表。
- 生成图库、图片预览、画布工作区和参考图编辑。
- Windows 便携版打包与 macOS unsigned dmg/zip 打包。

## 本地运行

```bash
npm install
npm start
```

## 测试

```bash
npm run test:desktop
```

macOS 上也可以运行：

```bash
npm run test:mac
```

测试会执行代码语法检查、生成规则检查、参考图生成词兼容检查、桌面 UI 布局烟测、按钮点击烟测和图库烟测。

## 打包

Windows 便携版：

```bash
npm run dist:win:portable
```

macOS unsigned 包：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:unsigned
```

## GitHub Actions

仓库包含 `.github/workflows/mac-build-test.yml`，可在 GitHub Actions 上执行 macOS x64/arm64 测试与 unsigned dmg/zip 打包。

