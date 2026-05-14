const { app, BrowserWindow, ipcMain, dialog, nativeImage, clipboard, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "ui-smoke-output");
const MOCK_IMAGE_SPECS = [
  { fileName: "mock-generated-square.png", width: 160, height: 160, color: [92, 166, 255, 255] },
  { fileName: "mock-generated-wide.png", width: 260, height: 96, color: [97, 223, 178, 255] },
  { fileName: "mock-generated-tall.png", width: 96, height: 260, color: [255, 124, 146, 255] },
];

function toFileUrl(filePath) {
  return `file:///${String(filePath).replace(/\\/g, "/")}`;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createSolidPng(width, height, rgba) {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      raw[offset] = rgba[0];
      raw[offset + 1] = rgba[1];
      raw[offset + 2] = rgba[2];
      raw[offset + 3] = rgba[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND"),
  ]);
}

function mockImagePath(index = 0) {
  const spec = MOCK_IMAGE_SPECS[index % MOCK_IMAGE_SPECS.length];
  return path.join(OUTPUT_DIR, spec.fileName);
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function registerMockIpc() {
  const config = {
    baseUrl: "https://www.packyapi.com",
    apiKey: "sk-test-layout-only",
    model: "gpt-image-2",
    quality: "high",
    outputFormat: "png",
    outputDir: OUTPUT_DIR,
    referencePromptModel: "",
    referencePromptApiKey: "",
    referencePromptBaseUrl: "",
  };

  const generatedPath = mockImagePath(0);
  const generatedPreviewUrl = toFileUrl(generatedPath);
  let generationSeq = 0;
  let history = [
    {
      id: "mock-history-initial",
      createdAt: new Date().toISOString(),
      prompt: "layout prompt",
      mode: "text",
      size: "auto",
      outputFormat: "png",
      quality: "high",
      referenceImagePaths: [],
      image: {
        fileName: "mock-generated-with-a-very-long-file-name-initial.png",
        filePath: generatedPath,
        previewUrl: generatedPreviewUrl,
        mimeType: "image/png",
      },
    },
  ];

  ipcMain.handle("config:load", async () => config);
  ipcMain.handle("config:save", async (_, nextConfig) => ({ ...config, ...nextConfig }));
  ipcMain.handle("config:defaultOutputDir", async () => OUTPUT_DIR);
  ipcMain.handle("history:load", async () => history);
  ipcMain.handle("history:clear", async () => {
    history = [];
    return history;
  });
  ipcMain.handle("history:delete", async () => history);
  ipcMain.handle("updater:getState", async () => ({ configured: false, message: "layout smoke" }));
  ipcMain.handle("updater:check", async () => ({ configured: false, message: "layout smoke" }));
  ipcMain.handle("updater:download", async () => ({ configured: false, message: "layout smoke" }));
  ipcMain.handle("updater:install", async () => false);
  ipcMain.handle("models:list", async () => [
    "gpt-image-2",
    "nano-banana",
    "banana-pro",
    "gpt-5.4",
    "gemini-3.1-pro",
  ]);
  ipcMain.handle("dialog:pickOutputDir", async () => OUTPUT_DIR);
  ipcMain.handle("dialog:pickReferenceImages", async () => []);
  ipcMain.handle("reference:saveEditedImage", async () => ({
    fileName: "mock-edited.png",
    filePath: generatedPath,
    previewUrl: generatedPreviewUrl,
    mimeType: "image/png",
  }));
  ipcMain.handle("reference:generatePrompt", async () => ({
    success: true,
    prompt: "根据参考图生成的一段测试提示词，包含主体、构图、光影和材质。",
  }));
  ipcMain.handle("reference:saveClipboardImage", async () => generatedPath);
  ipcMain.handle("image:generate", async (_, input = {}) => {
    const count = Math.min(16, Math.max(1, Number.parseInt(String(input.count || "1"), 10) || 1));
    const startIndex = generationSeq;
    generationSeq += count;
    const images = Array.from({ length: count }, (_, index) => {
      const imageIndex = startIndex + index;
      const spec = MOCK_IMAGE_SPECS[imageIndex % MOCK_IMAGE_SPECS.length];
      const filePath = mockImagePath(imageIndex);
      return {
        index,
        fileName: `mock-generated-with-a-very-long-file-name-${String(index + 1).padStart(2, "0")}-${spec.width}x${spec.height}.png`,
        filePath,
        previewUrl: toFileUrl(filePath),
        mimeType: "image/png",
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 450));
    history = images.map((image, index) => ({
      id: `mock-history-${index + 1}`,
      createdAt: new Date().toISOString(),
      prompt: input.prompt || "layout prompt",
      mode: Array.isArray(input.referenceImagePaths) && input.referenceImagePaths.length ? "image" : "text",
      size: input.size || "auto",
      outputFormat: input.outputFormat || "png",
      quality: input.quality || "high",
      referenceImagePaths: input.referenceImagePaths || [],
      image,
    }));
    return {
      success: true,
      payload: {
        prompt: input.prompt || "layout prompt",
        size: input.size || "auto",
        quality: input.quality || "high",
        output_format: input.outputFormat || "png",
        referenceImagePaths: input.referenceImagePaths || [],
      },
      images,
      upstream: { data: images.map(() => ({ b64_json: "mock" })) },
      history,
    };
  });
  ipcMain.handle("image:copyToClipboard", async () => {
    clipboard.writeImage(nativeImage.createEmpty());
    return true;
  });
  ipcMain.handle("image:saveAs", async () => generatedPath);
  ipcMain.handle("shell:openPath", async () => "");
  ipcMain.handle("shell:showItemInFolder", async () => true);
}

async function writeMockImage() {
  for (const spec of MOCK_IMAGE_SPECS) {
    await fs.writeFile(
      path.join(OUTPUT_DIR, spec.fileName),
      createSolidPng(spec.width, spec.height, spec.color)
    );
  }
}

async function runPageChecks(win) {
  return await win.webContents.executeJavaScript(`(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const runtimeErrors = [];
    const confirmations = [];
    window.addEventListener("error", (event) => {
      runtimeErrors.push(String(event.error?.stack || event.message || event.error || "window error"));
    });
    window.addEventListener("unhandledrejection", (event) => {
      runtimeErrors.push(String(event.reason?.stack || event.reason?.message || event.reason || "unhandled rejection"));
    });
    window.alert = () => {};
    window.confirm = (message) => {
      confirmations.push(String(message || ""));
      return false;
    };
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const visibleInViewport = (element) => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
    };
    const isScrollable = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflowX);
    };
    const hasScrollableAncestor = (element) => {
      let current = element?.parentElement;
      while (current && current !== document.body) {
        if (isScrollable(current)) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };
    const isExpectedDecorativeOverlay = (a, b) => {
      return (
        (a.tagName === "IMG" && b.classList?.contains("reference-preview-index")) ||
        (b.tagName === "IMG" && a.classList?.contains("reference-preview-index"))
      );
    };
    const isClippedByScrollableAncestor = (element, rect) => {
      let current = element?.parentElement;
      while (current && current !== document.body) {
        if (isScrollable(current)) {
          const clip = current.getBoundingClientRect();
          if (rect.bottom > clip.bottom + 2 || rect.top < clip.top - 2 || rect.right > clip.right + 2 || rect.left < clip.left - 2) {
            return true;
          }
        }
        current = current.parentElement;
      }
      return false;
    };
    const isControl = (element) => /^(BUTTON|INPUT|TEXTAREA|SELECT|CANVAS|IMG)$/.test(element.tagName) || element.closest("button");
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const statusText = () => document.querySelector("#status-text")?.textContent?.trim() || "";
    const results = { clicks: [], layoutIssues: [], pages: [], confirmations, runtimeErrors };

    const clickElement = async (element, selector, options = {}) => {
      const result = {
        selector,
        label: options.label || "",
        ok: true,
        skipped: false,
        statusBefore: statusText(),
      };
      if (!element) {
        result.ok = options.optional === true;
        result.skipped = options.optional === true;
        result.reason = "missing";
        return result;
      }
      if (!options.allowHidden && !visible(element)) {
        result.ok = options.optional === true;
        result.skipped = true;
        result.reason = "hidden";
        return result;
      }
      if (!options.allowDisabled && element.disabled) {
        result.skipped = true;
        result.reason = "disabled";
        return result;
      }

      const beforeErrorCount = runtimeErrors.length;
      try {
        element.scrollIntoView?.({ block: "center", inline: "center" });
        element.click();
      } catch (error) {
        result.ok = false;
        result.reason = String(error?.stack || error?.message || error);
      }
      await delay(options.waitMs || 220);
      const newErrors = runtimeErrors.slice(beforeErrorCount);
      if (newErrors.length) {
        result.ok = false;
        result.errors = newErrors;
      }
      result.statusAfter = statusText();
      if (Array.isArray(options.failOnStatusTerms)) {
        const matchedTerm = options.failOnStatusTerms.find((term) => result.statusAfter.includes(term));
        if (matchedTerm) {
          result.ok = false;
          result.reason = "status matched " + matchedTerm;
        }
      }
      return result;
    };

    const click = async (selector, options = {}) => clickElement(document.querySelector(selector), selector, options);
    const record = async (selector, options = {}) => {
      const result = await click(selector, options);
      results.clicks.push(result);
      return result;
    };
    const recordAll = async (selector, options = {}) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      if (!nodes.length) {
        results.clicks.push({ selector, label: options.label || "", ok: options.optional === true, skipped: true, reason: "missing" });
        return;
      }
      for (let index = 0; index < nodes.length; index += 1) {
        results.clicks.push(await clickElement(nodes[index], selector + "[" + index + "]", options));
        if (options.closeLightboxAfter) {
          await click("#lightbox-close", { optional: true });
        }
        if (options.closePromptLibraryAfter) {
          await click("#prompt-library-close", { optional: true });
        }
      }
    };
    const closeTransientSurfaces = async () => {
      await click("#lightbox-close", { optional: true });
      await click("#prompt-library-close", { optional: true });
      await click("#reference-editor-close", { optional: true });
      await click("#canvas-info-close", { optional: true });
    };
    const openCanvasContextMenu = async () => {
      const canvas = document.querySelector("#canvas-workbench-canvas");
      if (!canvas || !visible(canvas)) {
        return false;
      }
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
      await delay(180);
      return !document.querySelector("#canvas-context-menu")?.hidden;
    };
    const recordCanvasContextAction = async (action, options = {}) => {
      const opened = await openCanvasContextMenu();
      if (!opened) {
        results.clicks.push({
          selector: '[data-canvas-action="' + action + '"]',
          label: "canvas context " + action,
          ok: options.optional === true,
          skipped: true,
          reason: "context menu hidden",
        });
        return;
      }
      const result = await click('[data-canvas-action="' + action + '"]', {
        label: "canvas context " + action,
        waitMs: options.waitMs || 260,
        optional: options.optional,
        failOnStatusTerms: options.failOnStatusTerms,
      });
      results.clicks.push(result);
      if (action === "info") {
        await record("#canvas-info-close", { optional: true });
      }
      if (action === "send-generate") {
        await record('[data-workspace-tab="canvas"]', { waitMs: 260 });
      }
    };

    for (const tab of ["assets", "gallery", "generate", "ideas", "canvas"]) {
      results.clicks.push(await click('[data-workspace-tab="' + tab + '"]'));
      results.pages.push({ tab, title: document.title, active: document.querySelector(".workspace-tab.is-active")?.textContent?.trim() || "" });
      await delay(260);
    }
    results.workspaceTabOrder = Array.from(document.querySelectorAll("[data-workspace-tab]")).map((tab) => tab.textContent.trim());

    await record('[data-workspace-tab="assets"]');
    await record("#refresh-models-button", { waitMs: 320 });
    await record("#refresh-reference-models-button", { waitMs: 320 });
    results.modelOptions = Array.from(document.querySelectorAll("#model-options option")).map((option) => option.value);
    results.referencePromptModelOptions = Array.from(document.querySelectorAll("#reference-prompt-model-options option")).map((option) => option.value);
    for (const expected of ["nano-banana", "banana-pro"]) {
      if (!results.modelOptions.includes(expected)) {
        results.layoutIssues.push({ type: "image-model-option-missing", expected, options: results.modelOptions });
      }
    }
    for (const expected of ["gpt-5.4", "gemini-3.1-pro"]) {
      if (!results.referencePromptModelOptions.includes(expected)) {
        results.layoutIssues.push({ type: "reference-model-option-missing", expected, options: results.referencePromptModelOptions });
      }
    }
    await record("#pick-output-dir");
    await record("#save-settings", { waitMs: 280 });
    await record("#open-output-dir");

    await record('[data-workspace-tab="generate"]');
    for (const selector of [
      "#toggle-prompt-visibility",
      "#toggle-size-panel",
      "#toggle-param-panel"
    ]) {
      results.clicks.push(await click(selector));
    }
    results.promptCollapsed = {
      editorHidden: document.querySelector("#prompt-editor")?.hidden === true,
      previewVisible: visible(document.querySelector("#prompt-collapsed")),
      toggleText: document.querySelector("#toggle-prompt-visibility")?.textContent?.trim() || "",
    };
    await record("#toggle-prompt-visibility");

    for (const size of ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"]) {
      await record('.size-chip[data-size="' + size + '"]');
    }
    document.querySelector("#custom-width").value = "1280";
    document.querySelector("#custom-height").value = "720";
    await record('.size-chip[data-size="custom"]');
    await record("#apply-custom-size");
    const countInput = document.querySelector("#count");
    countInput.value = "16";
    countInput.dispatchEvent(new Event("change", { bubbles: true }));
    results.generationCountValue = countInput.value;
    results.responseToggleRemoved = !document.querySelector("#toggle-response-visibility");
    results.actionStatusBarVisible = visible(document.querySelector(".action-status-bar"));
    results.actionCardSticky = (() => {
      const scroll = document.querySelector(".control-panel-scroll");
      const card = document.querySelector(".action-card");
      if (!scroll || !card) {
        return { ok: false, reason: "missing" };
      }
      scroll.scrollTop = 0;
      const topRect = rectOf(card);
      scroll.scrollTop = scroll.scrollHeight;
      const bottomRect = rectOf(card);
      const shellRect = rectOf(document.querySelector(".control-panel-inner"));
      return {
        ok:
          visible(card) &&
          topRect.top >= shellRect.top &&
          bottomRect.bottom <= shellRect.bottom + 3 &&
          Math.abs(topRect.top - bottomRect.top) <= 1 &&
          Math.abs(topRect.bottom - bottomRect.bottom) <= 1,
        topYDelta: Math.round(Math.abs(topRect.top - bottomRect.top)),
        bottomYDelta: Math.round(Math.abs(topRect.bottom - bottomRect.bottom)),
        bottomInset: Math.round(shellRect.bottom - bottomRect.bottom),
      };
    })();
    if (!results.responseToggleRemoved || !results.actionStatusBarVisible || !results.actionCardSticky.ok) {
      results.layoutIssues.push({
        type: "generate-bottom-action-invalid",
        responseToggleRemoved: results.responseToggleRemoved,
        actionStatusBarVisible: results.actionStatusBarVisible,
        actionCardSticky: results.actionCardSticky,
      });
    }
    document.querySelector(".control-panel-scroll").scrollTop = 0;
    await record("#generate-reference-prompt");
    await record("#pick-reference-images");
    await record("#clear-reference-images");

    await record("#open-prompt-library");
    await record("#prompt-library-tab-builder");
    await record("#builder-randomize");
    await record("#builder-append");
    await record("#open-prompt-library");
    await record("#prompt-library-tab-builder");
    await record("#builder-use");
    await record("#open-prompt-library");
    await record("#prompt-library-tab-library");
    await record(".prompt-card .prompt-card-actions .secondary-button", { label: "prompt card use", optional: true, waitMs: 260 });
    await closeTransientSurfaces();

    await record('[data-workspace-tab="ideas"]');
    results.ideasShowsPreview = !document.querySelector('[data-main-workspace="generate"]')?.hidden;
    results.ideasPosterCount = document.querySelectorAll('[data-main-workspace="ideas"] [data-inspiration-cover]').length;
    if (results.ideasShowsPreview || results.ideasPosterCount < 12) {
      results.layoutIssues.push({ type: "ideas-main-panel-invalid", showsPreview: results.ideasShowsPreview, posterCount: results.ideasPosterCount });
    }
    await recordAll('[data-main-workspace="ideas"] [data-inspiration-cover]', { closeLightboxAfter: true });
    await record("#open-prompt-library-main");
    await record("#prompt-library-close");

    await record('[data-workspace-tab="generate"]');
    await record("#generate-button", { waitMs: 40, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
    await record("#generate-button", { waitMs: 40, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
    await record("#generate-button", { waitMs: 40, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
    results.pendingAfterRapidGenerate = document.querySelector("#generation-pending-count")?.textContent?.trim() || "";
    await record("#pause-generation-button", { waitMs: 80 });
    results.generateDisabledWhilePaused = document.querySelector("#generate-button")?.disabled === true;
    await record("#pause-generation-button", { waitMs: 760 });
    const inspectorPromptRect = rectOf(document.querySelector("#image-inspector-prompt"));
    const inspectorFileRect = rectOf(document.querySelector("#image-inspector-file"));
    results.imageInspectorSizing = {
      promptHeight: Math.round(inspectorPromptRect.height),
      fileHeight: Math.round(inspectorFileRect.height),
      fileText: document.querySelector("#image-inspector-file")?.textContent?.trim() || "",
    };
    if (results.imageInspectorSizing.promptHeight < 120 || results.imageInspectorSizing.fileHeight < 20) {
      results.layoutIssues.push({ type: "image-inspector-compressed", ...results.imageInspectorSizing });
    }
    const previewRect = rectOf(document.querySelector("#preview-stage"));
    const prevRect = rectOf(document.querySelector("#preview-prev-button"));
    const nextRect = rectOf(document.querySelector("#preview-next-button"));
    const previewCenterY = previewRect.top + previewRect.height / 2;
    results.previewPagerAlignment = {
      prevDeltaY: Math.round(Math.abs(prevRect.top + prevRect.height / 2 - previewCenterY)),
      nextDeltaY: Math.round(Math.abs(nextRect.top + nextRect.height / 2 - previewCenterY)),
    };
    if (results.previewPagerAlignment.prevDeltaY > 2 || results.previewPagerAlignment.nextDeltaY > 2) {
      results.layoutIssues.push({ type: "preview-pager-off-center", ...results.previewPagerAlignment });
    }
    const pagerBeforeSwitch = {
      prevY: Math.round(prevRect.top + prevRect.height / 2),
      nextY: Math.round(nextRect.top + nextRect.height / 2),
      stageHeight: Math.round(previewRect.height),
      imageSrc: document.querySelector("#preview-image")?.getAttribute("src") || "",
    };
    document.querySelector("#preview-next-button")?.click();
    await delay(220);
    const switchedPreviewRect = rectOf(document.querySelector("#preview-stage"));
    const switchedPrevRect = rectOf(document.querySelector("#preview-prev-button"));
    const switchedNextRect = rectOf(document.querySelector("#preview-next-button"));
    const pagerAfterSwitch = {
      prevY: Math.round(switchedPrevRect.top + switchedPrevRect.height / 2),
      nextY: Math.round(switchedNextRect.top + switchedNextRect.height / 2),
      stageHeight: Math.round(switchedPreviewRect.height),
      imageSrc: document.querySelector("#preview-image")?.getAttribute("src") || "",
    };
    document.querySelector("#preview-prev-button")?.click();
    await delay(120);
    results.previewPagerStability = {
      before: pagerBeforeSwitch,
      after: pagerAfterSwitch,
      prevDeltaY: Math.abs(pagerAfterSwitch.prevY - pagerBeforeSwitch.prevY),
      nextDeltaY: Math.abs(pagerAfterSwitch.nextY - pagerBeforeSwitch.nextY),
      stageDeltaHeight: Math.abs(pagerAfterSwitch.stageHeight - pagerBeforeSwitch.stageHeight),
      switchedImage: pagerAfterSwitch.imageSrc !== pagerBeforeSwitch.imageSrc,
    };
    if (
      results.previewPagerStability.prevDeltaY > 1 ||
      results.previewPagerStability.nextDeltaY > 1 ||
      results.previewPagerStability.stageDeltaHeight > 1 ||
      !results.previewPagerStability.switchedImage
    ) {
      results.layoutIssues.push({ type: "preview-pager-jumps-between-image-sizes", ...results.previewPagerStability });
    }
    await record("#preview-stage", { label: "preview lightbox", waitMs: 260 });
    await record("#lightbox-zoom-in", { optional: true });
    await record("#lightbox-zoom-out", { optional: true });
    await record("#lightbox-reset", { optional: true });
    await record("#lightbox-close", { optional: true });
    for (const selector of [
      "#zoom-in-button",
      "#zoom-out-button",
      "#reset-zoom-button",
      "#open-image-button",
      "#show-image-folder-button",
      "#use-preview-as-reference-button",
      "#send-preview-to-canvas-button",
      "#image-inspector-copy",
      "#image-inspector-fill",
      "#image-inspector-regenerate",
      "#image-inspector-reference",
      "#image-inspector-canvas",
    ]) {
      await record(selector, { waitMs: selector.includes("regenerate") ? 900 : 260, optional: true, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
    }

    await record('[data-workspace-tab="generate"]');
    await record(".reference-card-actions .secondary-button", { label: "reference edit", optional: true, waitMs: 420 });
    await recordAll("[data-reference-tool]", { optional: true });
    await recordAll("[data-reference-color]", { optional: true });
    await record("#reference-editor-undo", { optional: true });
    await record("#reference-editor-clear", { optional: true });
    await record("#reference-editor-save", { optional: true, waitMs: 420 });
    await record(".reference-card-actions .ghost-button", { label: "reference remove", optional: true });

    await record('[data-workspace-tab="gallery"]');
    {
      const galleryPanel = document.querySelector('[data-main-workspace="gallery"]');
      const generatePanel = document.querySelector('[data-main-workspace="generate"]');
      const cards = Array.from(document.querySelectorAll(".history-item"));
      const thumbs = Array.from(document.querySelectorAll(".history-thumb"));
      const images = Array.from(document.querySelectorAll(".history-thumb img"));
      const visibleThumbs = thumbs.filter(visible);
      const loadedImages = images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      const collapsedCards = cards
        .map((card, index) => ({ index, rect: rectOf(card), previewRect: rectOf(card.querySelector(".history-preview-button")) }))
        .filter((entry) => entry.previewRect.height < 80 || entry.rect.height < 140);
      const metaActionOverlaps = cards
        .map((card, index) => {
          const meta = card.querySelector(".history-meta");
          const action = card.querySelector(".history-actions");
          const metaRect = rectOf(meta);
          const actionRect = rectOf(action);
          return { index, gap: actionRect.top - metaRect.bottom, metaRect, actionRect };
        })
        .filter((entry) => entry.gap < 6);
      results.galleryPreview = {
        title: galleryPanel?.querySelector("h2")?.textContent?.trim() || "",
        activeTab: document.querySelector(".workspace-tab.is-active")?.dataset?.workspaceTab || "",
        galleryVisible: visible(galleryPanel),
        generateVisible: visible(generatePanel),
        cardCount: cards.length,
        visibleThumbCount: visibleThumbs.length,
        loadedImageCount: loadedImages.length,
        collapsedCardCount: collapsedCards.length,
        metaActionOverlapCount: metaActionOverlaps.length,
      };
      if (
        results.galleryPreview.title !== "图库" ||
        results.galleryPreview.activeTab !== "gallery" ||
        !results.galleryPreview.galleryVisible ||
        results.galleryPreview.generateVisible ||
        (cards.length > 0 && (visibleThumbs.length === 0 || loadedImages.length === 0 || collapsedCards.length > 0 || metaActionOverlaps.length > 0))
      ) {
        results.layoutIssues.push({ type: "gallery-preview-invalid", ...results.galleryPreview, collapsedCards: collapsedCards.slice(0, 4), metaActionOverlaps: metaActionOverlaps.slice(0, 4) });
      }
    }
    await record(".history-actions .secondary-button", { label: "history edit", optional: true, waitMs: 280 });
    await record('[data-workspace-tab="gallery"]');
    await record(".history-actions .ghost-button", { label: "history regenerate", optional: true, waitMs: 900, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
    await record('[data-workspace-tab="gallery"]');
    await record(".history-actions .secondary-button:last-child", { label: "history canvas", optional: true, waitMs: 320 });
    await record('[data-workspace-tab="gallery"]');
    await record("#clear-history-button");

    await record('[data-workspace-tab="canvas"]');
    for (const selector of [
      "#canvas-zoom-in",
      "#canvas-zoom-out",
      "#canvas-zoom-fit",
      "#canvas-add-reference",
      "#canvas-generate",
      "#canvas-selection-reference",
      "#canvas-selection-generate",
      "#canvas-selection-edit",
      "#canvas-pick-image",
      "#canvas-delete-selected",
      "#canvas-undo",
      "#canvas-clear",
      "#canvas-board-new",
      "#canvas-board-delete",
    ]) {
      await record(selector, { waitMs: selector.includes("generate") ? 900 : 260, optional: true, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
      if (selector === "#canvas-selection-edit") {
        await record("#reference-editor-close", { optional: true });
      }
    }
    for (const action of ["duplicate", "flip-x", "flip-y", "info", "copy-image", "save-as", "send-generate", "delete"]) {
      await recordCanvasContextAction(action, { optional: true, failOnStatusTerms: ["ReferenceError", "is not defined", "未定义"] });
    }
    await closeTransientSurfaces();

    const elements = Array.from(document.querySelectorAll("body *")).filter(visibleInViewport);
    for (const element of elements) {
      const rect = rectOf(element);
      if (rect.right > window.innerWidth + 2 || rect.bottom > window.innerHeight + 2 || rect.left < -2 || rect.top < -2) {
        if (!element.closest(".lightbox, .editor-modal, .prompt-library-modal") && !hasScrollableAncestor(element)) {
          results.layoutIssues.push({ type: "viewport-overflow", tag: element.tagName, id: element.id, className: element.className, text: element.textContent.trim().slice(0, 80), rect });
        }
      }
      if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) {
        const text = element.textContent.trim();
        const style = window.getComputedStyle(element);
        const lineClamp = style.webkitLineClamp || style.getPropertyValue("-webkit-line-clamp");
        const intentionalClip = style.textOverflow === "ellipsis" || (lineClamp && lineClamp !== "none");
        if (text && !intentionalClip && !["TEXTAREA", "PRE"].includes(element.tagName) && !isScrollable(element)) {
          results.layoutIssues.push({ type: "content-clipped", tag: element.tagName, id: element.id, className: element.className, text: text.slice(0, 80), rect, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight });
        }
      }
    }

    const important = elements.filter((element) => isControl(element) || element.matches(".workspace-tab, .compact-card, .composer-card, .preview-panel, .canvas-workbench-card, .image-inspector-card"));
    for (let i = 0; i < important.length; i += 1) {
      const a = important[i];
      const ar = rectOf(a);
      for (let j = i + 1; j < important.length; j += 1) {
        const b = important[j];
        if (a.contains(b) || b.contains(a)) continue;
        const br = rectOf(b);
        if (isClippedByScrollableAncestor(a, ar) || isClippedByScrollableAncestor(b, br)) continue;
        if (intersects(ar, br) && !isExpectedDecorativeOverlay(a, b)) {
          const overlapWidth = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
          const overlapHeight = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
          if (overlapWidth > 8 && overlapHeight > 8) {
            results.layoutIssues.push({ type: "possible-overlap", a: { tag: a.tagName, id: a.id, className: a.className, text: a.textContent.trim().slice(0, 40), rect: ar }, b: { tag: b.tagName, id: b.id, className: b.className, text: b.textContent.trim().slice(0, 40), rect: br }, overlapWidth, overlapHeight });
          }
        }
      }
    }

    results.buttonSummary = {
      totalButtons: document.querySelectorAll("button").length,
      clicked: results.clicks.filter((entry) => !entry.skipped).length,
      skipped: results.clicks.filter((entry) => entry.skipped).length,
      failed: results.clicks.filter((entry) => !entry.ok).length,
    };

    return results;
  })()`);
}

async function screenshot(win, name) {
  const image = await win.capturePage();
  await fs.writeFile(path.join(OUTPUT_DIR, `${name}.png`), image.toPNG());
}

async function main() {
  await ensureOutputDir();
  await writeMockImage();
  registerMockIpc();

  await app.whenReady();
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(ROOT, "renderer", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 900));

  for (const tab of ["assets", "gallery", "generate", "ideas", "canvas"]) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-workspace-tab="${tab}"]')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await screenshot(win, `workspace-${tab}`);
  }

  const results = await runPageChecks(win);
  await fs.writeFile(path.join(OUTPUT_DIR, "ui-layout-report.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(JSON.stringify({
    outputDir: OUTPUT_DIR,
    layoutIssueCount: results.layoutIssues.length,
    clickCount: results.clicks.length,
    clickIssueCount: results.clicks.filter((entry) => !entry.ok).length,
    runtimeErrorCount: results.runtimeErrors.length,
    skippedClickCount: results.clicks.filter((entry) => entry.skipped).length,
  }, null, 2));
  await win.close();
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
