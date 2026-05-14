# Mac 测试和打包

当前项目已经准备了 GitHub Actions 的 macOS 真机测试流程：

- `.github/workflows/mac-build-test.yml`
- `npm run test:mac`
- `npm run dist:mac:unsigned`
- `build-mac-package.sh`

## 推荐方式：GitHub Actions

把 `desktop-client` 这个文件夹单独作为一个 GitHub 仓库根目录上传，不要把上层 `D:\work` 整个仓库上传。

在 Mac 测试通过后，Actions 会上传两个 artifact：

- `xiaolan-mac-arm64`
- `xiaolan-mac-x64`

里面包含未签名的 `.dmg` 和 `.zip`。

## 本地 Mac 机器方式

在 Mac 上解压源码后运行：

```bash
bash build-mac-package.sh
```

脚本会先执行：

```bash
npm run test:mac
```

通过后再执行：

```bash
npm run dist:mac:unsigned
```

产物在 `dist/` 目录。

## 未签名 App 第一次打开

如果 macOS 提示无法打开，可以在终端执行：

```bash
xattr -cr dist/*.app
```

或者右键 App 后选择打开。
