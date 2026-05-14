const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const {
  buildGenerationPayload,
  normalizeOutputFormat,
  normalizeQuality,
  normalizeSize,
} = require("./core/generation");
const {
  buildJsonReferenceImagePayload,
  buildMultipartImageRequestBody,
  buildReferenceImageDataUrls,
  buildReferenceImageParts,
} = require("./core/reference-images");
const {
  buildVisionEndpointUrls,
  normalizeBaseUrl,
} = require("./core/endpoints");
const {
  fetchWithTimeout,
  getErrorDetail,
  isRetryableNetworkError,
  isTimeoutLikeError,
  postBufferWithTimeout,
  wait,
} = require("./core/http-client");
const {
  getUpstreamErrorDetail,
  requestImageGeneration,
  requestImageGenerationBatch,
  requestImageGenerationSafe,
  requestJsonReferenceImageGeneration,
  requestFormDataReferenceImageEdit,
  requestMultipartReferenceImageGeneration,
  postJsonImageGeneration,
} = require("./core/image-api");
const { generatePromptFromReferenceImages } = require("./core/reference-prompt-api");
const {
  ensureDirectory,
  createAppStorage,
} = require("./core/app-storage");
const { createAutoUpdaterController } = require("./core/auto-updater");
const { createImageResultStorage } = require("./core/image-results");
const { createGenerationService } = require("./core/generation-service");
const { listModels } = require("./core/models-service");

const APP_NAME = "小蓝工具箱";
const {
  getDefaultOutputDir,
  normalizeConfig,
  loadConfig,
  saveConfig,
  loadHistory,
  appendHistoryEntries,
  clearHistory,
  deleteHistoryItems,
} = createAppStorage({ app, appName: APP_NAME });

let mainWindow;
const { saveImageResults, saveEditedReferenceImage } = createImageResultStorage({
  getDefaultOutputDir,
  ensureDirectory,
});
const updater = createAutoUpdaterController({
  app,
  loadConfig,
  sendState: (state) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("updater:state", state);
  },
});
const {
  generateImages,
  generateImagesWithGuard,
  setActiveGenerationRequestForTest,
} = createGenerationService({
  normalizeConfig,
  appendHistoryEntries,
  saveImageResults,
});

function getAppIconPath() {
  return path.join(__dirname, "build", "app-icon.ico");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: "#09090b",
    title: APP_NAME,
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    titleBarStyle: "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    updater.notify();
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

if (process.env.XIAOLAN_DESKTOP_TEST === "1") {
  module.exports = {
    __test__: {
      fetchWithTimeout,
      buildGenerationPayload,
      normalizeBaseUrl,
      buildVisionEndpointUrls,
      normalizeSize,
      normalizeOutputFormat,
      normalizeQuality,
      buildMultipartImageRequestBody,
      buildReferenceImageParts,
      buildReferenceImageDataUrls,
      buildJsonReferenceImagePayload,
      requestJsonReferenceImageGeneration,
      requestFormDataReferenceImageEdit,
      requestMultipartReferenceImageGeneration,
      postBufferWithTimeout,
      requestImageGeneration,
      requestImageGenerationSafe,
      requestImageGenerationBatch,
      listModels,
      generatePromptFromReferenceImages,
      generateImages,
      saveImageResults,
      generateImagesWithGuard,
      __setActiveGenerationRequestForTest: setActiveGenerationRequestForTest,
    },
  };
} else {
app.whenReady().then(async () => {
  app.setName(APP_NAME);
  Menu.setApplicationMenu(null);
  await ensureDirectory(getDefaultOutputDir());

  ipcMain.handle("config:load", async () => loadConfig());
  ipcMain.handle("config:save", async (_, config) => {
    const saved = await saveConfig(config);
    return saved;
  });
  ipcMain.handle("config:defaultOutputDir", async () => getDefaultOutputDir());
  ipcMain.handle("models:list", async (_, input = {}) => listModels(input));
  ipcMain.handle("history:load", async () => loadHistory());
  ipcMain.handle("history:clear", async () => clearHistory());
  ipcMain.handle("history:delete", async (_, input = {}) =>
    deleteHistoryItems(input.ids, { deleteLocalFiles: input.deleteLocalFiles === true })
  );
  ipcMain.handle("updater:getState", async () => updater.getState());
  ipcMain.handle("updater:check", async () => updater.check(true));
  ipcMain.handle("updater:download", async () => updater.download());
  ipcMain.handle("updater:install", async () => updater.install());
  ipcMain.handle("dialog:pickOutputDir", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择输出目录",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("dialog:pickReferenceImages", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择参考图",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "图片文件",
          extensions: ["png", "jpg", "jpeg", "webp"],
        },
      ],
    });

    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("image:copyToClipboard", async (_, filePath) => {
    const imagePath = String(filePath || "").trim();
    if (!imagePath) {
      throw new Error("没有可复制的图片路径。");
    }
    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) {
      throw new Error("图片读取失败，无法复制为图片。");
    }
    clipboard.writeImage(image);
    return true;
  });
  ipcMain.handle("image:saveAs", async (_, input = {}) => {
    const sourcePath = String(input.sourcePath || "").trim();
    if (!sourcePath) {
      throw new Error("没有可另存的图片路径。");
    }
    const defaultPath = String(input.defaultPath || sourcePath).trim() || sourcePath;
    const result = await dialog.showSaveDialog({
      title: "另存为图片",
      defaultPath,
      filters: [
        {
          name: "图片文件",
          extensions: ["png", "jpg", "jpeg", "webp"],
        },
        {
          name: "所有文件",
          extensions: ["*"],
        },
      ],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    await fs.copyFile(sourcePath, result.filePath);
    return result.filePath;
  });
  ipcMain.handle("reference:saveEditedImage", async (_, input) => saveEditedReferenceImage(input));
  ipcMain.handle("reference:generatePrompt", generatePromptFromReferenceImages);
  ipcMain.handle("reference:saveClipboardImage", async (_, input = {}) => {
    const image = clipboard.readImage();
    if (!image || image.isEmpty()) {
      return null;
    }
    const outputDir = String(input.outputDir || getDefaultOutputDir()).trim() || getDefaultOutputDir();
    const referenceDir = path.join(outputDir, "references");
    await ensureDirectory(referenceDir);
    const filePath = path.join(referenceDir, `clipboard-reference-${Date.now()}.png`);
    await fs.writeFile(filePath, image.toPNG());
    return filePath;
  });
  ipcMain.handle("image:generate", async (_, input) => generateImages(input));
  ipcMain.handle("shell:openPath", async (_, targetPath) => {
    if (!targetPath) {
      return;
    }
    await shell.openPath(targetPath);
  });
  ipcMain.handle("shell:showItemInFolder", async (_, targetPath) => {
    if (!targetPath) {
      return;
    }
    shell.showItemInFolder(targetPath);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
}
