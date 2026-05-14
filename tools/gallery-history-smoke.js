const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "ui-smoke-output");
const USER_DATA_DIR = path.join(app.getPath("appData"), "packy-image-desktop");

function normalizeHistoryItem(item) {
  if (!item?.image?.filePath || !item?.image?.fileName) {
    return null;
  }
  return {
    ...item,
    image: {
      ...item.image,
      previewUrl: pathToFileURL(item.image.filePath).toString(),
      mimeType: item.image.mimeType || "image/png",
    },
  };
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

async function registerIpc() {
  const config = await loadJson(path.join(USER_DATA_DIR, "config.json"), {});
  const history = (await loadJson(path.join(USER_DATA_DIR, "history.json"), []))
    .map(normalizeHistoryItem)
    .filter(Boolean);

  ipcMain.handle("config:load", async () => config);
  ipcMain.handle("config:save", async (_, nextConfig) => ({ ...config, ...nextConfig }));
  ipcMain.handle("config:defaultOutputDir", async () => config.outputDir || OUTPUT_DIR);
  ipcMain.handle("history:load", async () => history);
  ipcMain.handle("history:clear", async () => history);
  ipcMain.handle("history:delete", async () => history);
  ipcMain.handle("updater:getState", async () => ({ configured: false, message: "gallery smoke" }));
  ipcMain.handle("updater:check", async () => ({ configured: false, message: "gallery smoke" }));
  ipcMain.handle("updater:download", async () => ({ configured: false, message: "gallery smoke" }));
  ipcMain.handle("updater:install", async () => false);
  ipcMain.handle("models:list", async () => [
    "gpt-image-2",
    "nano-banana",
    "gpt-5.4",
    "gemini-3.1-pro",
  ]);
  ipcMain.handle("dialog:pickOutputDir", async () => config.outputDir || OUTPUT_DIR);
  ipcMain.handle("dialog:pickReferenceImages", async () => []);
  ipcMain.handle("reference:saveEditedImage", async () => null);
  ipcMain.handle("reference:generatePrompt", async () => ({ success: true, prompt: "" }));
  ipcMain.handle("reference:saveClipboardImage", async () => "");
  ipcMain.handle("image:generate", async () => ({ success: true, images: [], history }));
  ipcMain.handle("image:copyToClipboard", async () => true);
  ipcMain.handle("image:saveAs", async () => "");
  ipcMain.handle("shell:openPath", async () => "");
  ipcMain.handle("shell:showItemInFolder", async () => true);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await registerIpc();
  await app.whenReady();

  const win = new BrowserWindow({
    width: 1543,
    height: 997,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(ROOT, "renderer", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 900));
  await win.webContents.executeJavaScript("document.querySelector('[data-workspace-tab=\"gallery\"]')?.click()");
  await new Promise((resolve) => setTimeout(resolve, 900));

  const report = await win.webContents.executeJavaScript(`(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
    };
    const cards = Array.from(document.querySelectorAll(".history-item"));
    const galleryPanel = document.querySelector('[data-main-workspace="gallery"]');
    const generatePanel = document.querySelector('[data-main-workspace="generate"]');
    const thumbs = Array.from(document.querySelectorAll(".history-thumb"));
    const images = Array.from(document.querySelectorAll(".history-thumb img"));
    const metas = Array.from(document.querySelectorAll(".history-meta"));
    const actions = Array.from(document.querySelectorAll(".history-actions"));
    const loadedImages = images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    const visibleThumbs = thumbs.filter(visible);
    const collapsedCards = cards
      .map((card, index) => ({ index, rect: rectOf(card), previewRect: rectOf(card.querySelector(".history-preview-button")) }))
      .filter((entry) => entry.previewRect.height < 80 || entry.rect.height < 140);
    const metaActionOverlaps = cards
      .map((card, index) => {
        const meta = card.querySelector(".history-meta");
        const action = card.querySelector(".history-actions");
        const metaRect = rectOf(meta);
        const actionRect = rectOf(action);
        return { index, metaRect, actionRect, gap: actionRect.top - metaRect.bottom };
      })
      .filter((entry) => entry.gap < 6);
    return {
      title: document.querySelector('[data-main-workspace="gallery"] h2')?.textContent?.trim() || "",
      historyTag: document.querySelector("#history-tag")?.textContent?.trim() || "",
      cardCount: cards.length,
      thumbCount: thumbs.length,
      visibleThumbCount: visibleThumbs.length,
      imageCount: images.length,
      loadedImageCount: loadedImages.length,
      firstImageSrc: images[0]?.getAttribute("src") || "",
      galleryVisible: visible(galleryPanel),
      generateVisible: visible(generatePanel),
      galleryHiddenAttr: galleryPanel?.hidden === true,
      generateHiddenAttr: generatePanel?.hidden === true,
      activeTab: document.querySelector(".workspace-tab.is-active")?.dataset?.workspaceTab || "",
      firstCardRect: cards[0] ? rectOf(cards[0]) : null,
      firstThumbRect: thumbs[0] ? rectOf(thumbs[0]) : null,
      firstMetaRect: metas[0] ? rectOf(metas[0]) : null,
      firstActionsRect: actions[0] ? rectOf(actions[0]) : null,
      metaActionOverlaps: metaActionOverlaps.slice(0, 8),
      collapsedCards: collapsedCards.slice(0, 8),
      runtimeErrorText: document.body.innerText.includes("ReferenceError") || document.body.innerText.includes("is not defined"),
    };
  })()`);

  const screenshot = await win.capturePage();
  await fs.writeFile(path.join(OUTPUT_DIR, "gallery-real-history.png"), screenshot.toPNG());

  await fs.writeFile(path.join(OUTPUT_DIR, "gallery-real-history-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));

  const hasRecords = report.cardCount > 0;
  const hasVisibleImages = report.visibleThumbCount > 0 && report.loadedImageCount > 0;
  const hasCollapsedCards = report.collapsedCards.length > 0;
  const hasMetaActionOverlap = report.metaActionOverlaps.length > 0;
  const hasExpectedTitle = report.title === "图库";
  const failed =
    hasRecords &&
    (!hasVisibleImages ||
      hasCollapsedCards ||
      hasMetaActionOverlap ||
      !hasExpectedTitle ||
      !report.galleryVisible ||
      report.generateVisible ||
      report.activeTab !== "gallery" ||
      report.runtimeErrorText);
  await win.close();
  app.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
