const APP_CONFIG = window.XIAOLAN_APP_CONFIG || {};
const APP_NAME = APP_CONFIG.appName || "小蓝工具箱";
const DEFAULT_PROMPT = APP_CONFIG.defaultPrompt || "";
const RENDERER_GENERATION_TIMEOUT_MS = APP_CONFIG.rendererGenerationTimeoutMs || 315000;
const RENDERER_MULTI_GENERATION_EXTRA_TIMEOUT_MS =
  APP_CONFIG.rendererMultiGenerationExtraTimeoutMs || 180000;
const RENDERER_REFERENCE_EXTRA_TIMEOUT_MS = APP_CONFIG.rendererReferenceExtraTimeoutMs || 30000;
const MAX_REFERENCE_IMAGES = APP_CONFIG.maxReferenceImages || 16;
const MAX_GENERATION_COUNT = APP_CONFIG.maxGenerationCount || 16;
const MAX_EDITOR_HISTORY = APP_CONFIG.maxEditorHistory || 24;
const SIZE_LABELS = APP_CONFIG.sizeLabels || {};
const SIZE_CHIP_DETAILS = APP_CONFIG.sizeChipDetails || {};
const MIN_IMAGE_PIXELS = 655360;
const MAX_IMAGE_PIXELS = 8294400;
const MAX_IMAGE_EDGE = 3840;
const MAX_IMAGE_RATIO = 3;
const BUILTIN_IMAGE_MODELS = [
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
  "nano-banana",
  "nano-banana-pro",
  "banana",
  "banana-pro",
  "banana-image",
  "dall-e-3",
  "dall-e-2",
  "gemini-2.5-flash-image",
];
const BUILTIN_REFERENCE_PROMPT_MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3",
  "gpt-4o",
  "gemini-3.1-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "qwen-vl-plus",
  "qwen-vl-max",
];

const state = {
  activeWorkspace: "generate",
  size: "auto",
  referenceImagePaths: [],
  lastResponse: null,
  selectedImageIndex: -1,
  selectedResultIndex: -1,
  isResponseVisible: false,
  isSettingsVisible: true,
  isPromptVisible: false,
  isSizePanelVisible: false,
  isParamPanelVisible: false,
  isGenerating: false,
  isGeneratingReferencePrompt: false,
  selectedHistoryIds: new Set(),
  activeGenerationTasks: new Set(),
  generationTaskStartedAt: new Map(),
  contextHistoryId: "",
  previewScale: 1,
  lightboxScale: 1,
  lastCursorX: window.innerWidth / 2,
  lastCursorY: window.innerHeight / 2,
  isGenerationPaused: false,
  generationTaskSeq: 0,
  generationTimerId: null,
};

const referenceEditor = {
  index: -1,
  sourcePath: "",
  mode: "reference",
  onSave: null,
  tool: "brush",
  color: "#ff7c92",
  width: 6,
  isDrawing: false,
  startX: 0,
  startY: 0,
  history: [],
  baseSnapshot: null,
};

const promptLibrary = {
  activeTab: "library",
  activeCategory: "全部",
  search: "",
};

const elements = {
  workspaceTabs: Array.from(document.querySelectorAll("[data-workspace-tab]")),
  workspacePanels: Array.from(document.querySelectorAll("[data-workspace-panel]")),
  studioShell: document.querySelector(".studio-shell"),
  settingsForm: document.getElementById("settings-form"),
  baseUrl: document.getElementById("base-url"),
  apiKey: document.getElementById("api-key"),
  model: document.getElementById("model"),
  modelSelect: document.getElementById("model-select"),
  modelOptions: document.getElementById("model-options"),
  refreshModelsButton: document.getElementById("refresh-models-button"),
  referencePromptModel: document.getElementById("reference-prompt-model"),
  referencePromptModelSelect: document.getElementById("reference-prompt-model-select"),
  referencePromptModelOptions: document.getElementById("reference-prompt-model-options"),
  refreshReferenceModelsButton: document.getElementById("refresh-reference-models-button"),
  referencePromptApiKey: document.getElementById("reference-prompt-api-key"),
  referencePromptBaseUrl: document.getElementById("reference-prompt-base-url"),
  outputDir: document.getElementById("output-dir"),
  saveSettings: document.getElementById("save-settings"),
  openOutputDir: document.getElementById("open-output-dir"),
  pickOutputDir: document.getElementById("pick-output-dir"),
  prompt: document.getElementById("prompt"),
  promptEditor: document.getElementById("prompt-editor"),
  promptCollapsed: document.getElementById("prompt-collapsed"),
  promptPreviewText: document.getElementById("prompt-preview-text"),
  togglePromptVisibility: document.getElementById("toggle-prompt-visibility"),
  openPromptLibrary: document.getElementById("open-prompt-library"),
  openPromptLibrarySecondary: document.getElementById("open-prompt-library-secondary"),
  openPromptLibraryMain: document.getElementById("open-prompt-library-main"),
  promptLibraryModal: document.getElementById("prompt-library-modal"),
  promptLibraryClose: document.getElementById("prompt-library-close"),
  promptLibraryCount: document.getElementById("prompt-library-count"),
  promptLibraryTabLibrary: document.getElementById("prompt-library-tab-library"),
  promptLibraryTabBuilder: document.getElementById("prompt-library-tab-builder"),
  promptLibraryView: document.getElementById("prompt-library-view"),
  promptBuilderView: document.getElementById("prompt-builder-view"),
  promptLibrarySearch: document.getElementById("prompt-library-search"),
  promptCategoryList: document.getElementById("prompt-category-list"),
  promptCardGrid: document.getElementById("prompt-card-grid"),
  builderSubject: document.getElementById("builder-subject"),
  builderScene: document.getElementById("builder-scene"),
  builderStyle: document.getElementById("builder-style"),
  builderLighting: document.getElementById("builder-lighting"),
  builderComposition: document.getElementById("builder-composition"),
  builderDetail: document.getElementById("builder-detail"),
  builderOutput: document.getElementById("builder-output"),
  builderRandomize: document.getElementById("builder-randomize"),
  builderAppend: document.getElementById("builder-append"),
  builderUse: document.getElementById("builder-use"),
  quality: document.getElementById("quality"),
  outputFormat: document.getElementById("output-format"),
  count: document.getElementById("count"),
  sizeDisplay: document.getElementById("size-display"),
  sizeDisplayTag: document.getElementById("size-display-tag"),
  sizeButtons: Array.from(document.querySelectorAll(".size-chip")),
  customWidth: document.getElementById("custom-width"),
  customHeight: document.getElementById("custom-height"),
  applyCustomSize: document.getElementById("apply-custom-size"),
  customSizeHint: document.getElementById("custom-size-hint"),
  sizePanel: document.getElementById("size-panel"),
  toggleSizePanel: document.getElementById("toggle-size-panel"),
  sizeChevron: document.getElementById("size-chevron"),
  paramPanel: document.getElementById("param-panel"),
  toggleParamPanel: document.getElementById("toggle-param-panel"),
  paramChevron: document.getElementById("param-chevron"),
  pickReferenceImages: document.getElementById("pick-reference-images"),
  generateReferencePrompt: document.getElementById("generate-reference-prompt"),
  clearReferenceImages: document.getElementById("clear-reference-images"),
  referenceDropZone: document.getElementById("reference-drop-zone"),
  referenceFiles: document.getElementById("reference-files"),
  referenceCount: document.getElementById("reference-count"),
  referenceSection: document.getElementById("reference-section"),
  autoModeHint: document.getElementById("auto-mode-hint"),
  generateButton: document.getElementById("generate-button"),
  generateButtonText: document.getElementById("generate-button-text"),
  pauseGenerationButton: document.getElementById("pause-generation-button"),
  generationProgressStrip: document.getElementById("generation-progress-strip"),
  generationPendingCount: document.getElementById("generation-pending-count"),
  generationElapsedTime: document.getElementById("generation-elapsed-time"),
  buttonSpinner: document.getElementById("button-spinner"),
  statusText: document.getElementById("status-text"),
  statusDot: document.getElementById("status-dot"),
  responseJson: document.getElementById("response-json"),
  toggleResponseVisibility: document.getElementById("toggle-response-visibility"),
  resultGrid: document.getElementById("result-grid"),
  resultSummary: document.getElementById("result-summary"),
  clearHistoryButton: document.getElementById("clear-history-button"),
  deleteSelectedHistoryButton: document.getElementById("delete-selected-history-button"),
  deleteSelectedLocalButton: document.getElementById("delete-selected-local-button"),
  historyContextMenu: document.getElementById("history-context-menu"),
  previewStage: document.getElementById("preview-stage"),
  previewImage: document.getElementById("preview-image"),
  previewEmpty: document.getElementById("preview-empty"),
  previewLoader: document.getElementById("preview-loader"),
  previewPrevButton: document.getElementById("preview-prev-button"),
  previewNextButton: document.getElementById("preview-next-button"),
  modeIndicator: document.getElementById("mode-indicator"),
  historyTag: document.getElementById("history-tag"),
  openImageButton: document.getElementById("open-image-button"),
  showImageFolderButton: document.getElementById("show-image-folder-button"),
  usePreviewAsReferenceButton: document.getElementById("use-preview-as-reference-button"),
  sendPreviewToCanvasButton: document.getElementById("send-preview-to-canvas-button"),
  zoomInButton: document.getElementById("zoom-in-button"),
  zoomOutButton: document.getElementById("zoom-out-button"),
  resetZoomButton: document.getElementById("reset-zoom-button"),
  lightbox: document.getElementById("lightbox"),
  lightboxImage: document.getElementById("lightbox-image"),
  lightboxTitle: document.getElementById("lightbox-title"),
  lightboxScaleLabel: document.getElementById("lightbox-scale-label"),
  lightboxClose: document.getElementById("lightbox-close"),
  lightboxZoomIn: document.getElementById("lightbox-zoom-in"),
  lightboxZoomOut: document.getElementById("lightbox-zoom-out"),
  lightboxReset: document.getElementById("lightbox-reset"),
  referenceEditorModal: document.getElementById("reference-editor"),
  referenceEditorTitle: document.getElementById("reference-editor-title"),
  referenceEditorMeta: document.getElementById("reference-editor-meta"),
  referenceEditorStage: document.querySelector(".reference-editor-stage"),
  referenceEditorCanvas: document.getElementById("reference-editor-canvas"),
  referenceEditorWidth: document.getElementById("reference-editor-width"),
  referenceEditorWidthValue: document.getElementById("reference-editor-width-value"),
  referenceEditorUndo: document.getElementById("reference-editor-undo"),
  referenceEditorClear: document.getElementById("reference-editor-clear"),
  referenceEditorSave: document.getElementById("reference-editor-save"),
  referenceEditorClose: document.getElementById("reference-editor-close"),
  referenceToolButtons: Array.from(document.querySelectorAll("[data-reference-tool]")),
  referenceColorButtons: Array.from(document.querySelectorAll("[data-reference-color]")),
  previewPanel: document.querySelector(".preview-panel"),
  mainWorkspacePanels: Array.from(document.querySelectorAll("[data-main-workspace]")),
  imageInspectorPanel: document.getElementById("image-inspector"),
  imageInspectorPrompt: document.getElementById("image-inspector-prompt"),
  imageInspectorMeta: document.getElementById("image-inspector-meta"),
  imageInspectorFile: document.getElementById("image-inspector-file"),
  imageInspectorCopy: document.getElementById("image-inspector-copy"),
  imageInspectorFill: document.getElementById("image-inspector-fill"),
  imageInspectorRegenerate: document.getElementById("image-inspector-regenerate"),
  imageInspectorReference: document.getElementById("image-inspector-reference"),
  imageInspectorCanvas: document.getElementById("image-inspector-canvas"),
  canvasPrompt: document.getElementById("canvas-prompt"),
  canvasWorkbenchCanvas: document.getElementById("canvas-workbench-canvas"),
  canvasDropZone: document.getElementById("canvas-drop-zone"),
  canvasEmpty: document.getElementById("canvas-empty"),
  canvasLoading: document.getElementById("canvas-loading"),
  canvasLoadingText: document.getElementById("canvas-loading-text"),
  canvasBoardSelect: document.getElementById("canvas-board-select"),
  canvasBoardNew: document.getElementById("canvas-board-new"),
  canvasBoardDelete: document.getElementById("canvas-board-delete"),
  canvasPickImage: document.getElementById("canvas-pick-image"),
  canvasDeleteSelected: document.getElementById("canvas-delete-selected"),
  canvasUndo: document.getElementById("canvas-undo"),
  canvasClear: document.getElementById("canvas-clear"),
  canvasZoomOut: document.getElementById("canvas-zoom-out"),
  canvasZoomFit: document.getElementById("canvas-zoom-fit"),
  canvasZoomIn: document.getElementById("canvas-zoom-in"),
  canvasAddReference: document.getElementById("canvas-add-reference"),
  canvasGenerate: document.getElementById("canvas-generate"),
  canvasSelectedName: document.getElementById("canvas-selected-name"),
};

const referenceCanvasContext = elements.referenceEditorCanvas.getContext("2d", {
  willReadFrequently: true,
});

const PROMPT_LIBRARY = Array.isArray(window.XIAOLAN_PROMPT_LIBRARY) ? window.XIAOLAN_PROMPT_LIBRARY : [];
const PROMPT_BUILDER = window.XIAOLAN_PROMPT_BUILDER || {};
const PROMPT_RENDER_LIMIT = 160;
const PROMPT_COVER_BASE_PATH = "prompt-covers";
const SUPPORTED_REFERENCE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const PREVIEWABLE_RESULT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

let historyItems = [];
let imageInspector = null;
let canvasWorkbench = null;

function clampScale(value) {
  return Math.min(3, Math.max(0.4, Math.round(value * 100) / 100));
}

function getPromptValue() {
  const value = elements.prompt.value.trim();
  return value || DEFAULT_PROMPT;
}

function getFriendlyErrorMessage(error, fallback = "操作失败") {
  const rawMessage = String(error?.message || error || "").trim();
  if (!rawMessage) {
    return fallback;
  }

  const cleaned = rawMessage
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (/^(TypeError:\s*)?fetch failed$/i.test(cleaned)) {
    return "接口连接失败，请检查 API 地址、网络或 Sora 分组令牌。";
  }

  return cleaned || fallback;
}

function updatePromptPreview() {
  const preview = String(elements.prompt.value || DEFAULT_PROMPT || "")
    .replace(/\s+/g, " ")
    .trim();
  elements.promptPreviewText.textContent = preview ? preview.slice(0, 96) : "已收起";
}

function setPromptValue(prompt, mode = "replace") {
  const incoming = String(prompt || "").trim();
  if (!incoming) {
    return;
  }

  if (mode === "append" && elements.prompt.value.trim()) {
    elements.prompt.value = `${elements.prompt.value.trim()}，${incoming}`;
  } else {
    elements.prompt.value = incoming;
  }

  updatePromptPreview();
  setPromptVisibility(true);
  elements.prompt.focus();
}

function formatSizeValue(size) {
  const normalized = String(size || "auto").trim().replace(/×/g, "x").toLowerCase();
  const match = normalized.match(/^(\d+)x(\d+)$/);
  if (SIZE_LABELS[normalized]) {
    return SIZE_LABELS[normalized];
  }
  if (match) {
    return `${match[1]}×${match[2]}`;
  }
  return SIZE_LABELS[size] || size;
}

function isPresetSizeValue(size) {
  const normalized = String(size || "").trim().replace(/×/g, "x").toLowerCase();
  return normalized === "auto" || Boolean(SIZE_LABELS[normalized]);
}

function normalizeCustomSizeValue(widthValue, heightValue) {
  const width = Number(String(widthValue || "").trim());
  const height = Number(String(heightValue || "").trim());
  const pixels = width * height;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const ratio = longEdge / Math.max(1, shortEdge);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    longEdge > MAX_IMAGE_EDGE ||
    ratio > MAX_IMAGE_RATIO ||
    pixels < MIN_IMAGE_PIXELS ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new Error("自定义尺寸不符合规则：宽高必须为 16 的倍数，最长边不超过 3840，比例不超过 3:1，总像素需在 655360 到 8294400 之间。");
  }

  return `${width}x${height}`;
}

function syncCustomSizeInputsFromState() {
  const normalized = String(state.size || "").trim().replace(/×/g, "x").toLowerCase();
  const match = normalized.match(/^(\d+)x(\d+)$/);
  if (!match || isPresetSizeValue(normalized)) {
    return;
  }
  if (elements.customWidth) {
    elements.customWidth.value = match[1];
  }
  if (elements.customHeight) {
    elements.customHeight.value = match[2];
  }
}

function applyCustomSizeFromInputs() {
  try {
    const customSize = normalizeCustomSizeValue(elements.customWidth?.value, elements.customHeight?.value);
    state.size = customSize;
    syncSizeButtons();
    setStatus(`已使用自定义尺寸 ${formatSizeValue(customSize)}`, "success");
  } catch (error) {
    setStatus(error.message || "自定义尺寸不符合规则", "error");
  }
}

function getFileName(filePath) {
  return String(filePath || "").split(/[\\/]/).pop() || "未命名图片";
}

function getImageName(image) {
  return image?.fileName || image?.file_name || "未命名文件";
}

function getImageUrl(image) {
  return image?.previewUrl || image?.file_url_absolute || image?.file_url || image?.remoteUrl || image?.remote_url || (image?.filePath ? toFileUrl(image.filePath) : "");
}

function getImageMimeType(image) {
  return String(image?.mimeType || image?.mime_type || "").toLowerCase();
}

function getImageExtension(image) {
  const mimeType = getImageMimeType(image);
  if (mimeType.includes("png")) {
    return "png";
  }
  if (mimeType.includes("jpeg")) {
    return "jpeg";
  }
  if (mimeType.includes("webp")) {
    return "webp";
  }

  const nameOrUrl = String(getImageName(image) || getImageUrl(image) || "").split(/[?#]/)[0].toLowerCase();
  return nameOrUrl.includes(".") ? nameOrUrl.split(".").pop() : "";
}

function isPreviewableImage(image) {
  return Boolean(getImageUrl(image)) && PREVIEWABLE_RESULT_EXTENSIONS.has(getImageExtension(image));
}

function renderPreviewMessage(title, description, fileType = "") {
  elements.previewEmpty.classList.toggle("is-file-card", Boolean(fileType));
  elements.previewEmpty.replaceChildren();

  if (fileType) {
    const badge = document.createElement("div");
    badge.className = "file-preview-badge";
    badge.textContent = fileType;
    elements.previewEmpty.appendChild(badge);
  }

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  const descriptionElement = document.createElement("span");
  descriptionElement.textContent = description;
  elements.previewEmpty.append(titleElement, descriptionElement);
}

function toFileUrl(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  const encoded = parts
    .map((part, index) => {
      if (index === 0 && /^[A-Za-z]:$/.test(part)) {
        return part;
      }
      return encodeURIComponent(part);
    })
    .join("/");
  return `file:///${encoded}`;
}

function splitDroppedPathText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function normalizeDroppedPath(value) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }
  text = text.replace(/^["']|["']$/g, "").trim();

  if (/^file:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text = decodeURIComponent(url.pathname || "");
      if (/^\/[A-Za-z]:\//.test(text)) {
        text = text.slice(1);
      }
      text = text.replace(/\//g, "\\");
    } catch (error) {
      text = text.replace(/^file:\/\/\/?/i, "");
      text = decodeURIComponent(text).replace(/\//g, "\\");
    }
  }

  return text.trim();
}

function loadImageFromPath(filePath) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法读取图片：${getFileName(filePath)}`));
    image.src = `${toFileUrl(filePath)}?t=${Date.now()}`;
  });
}

function setPromptVisibility(isVisible) {
  state.isPromptVisible = isVisible;
  elements.promptEditor.hidden = !isVisible;
  elements.promptCollapsed.hidden = isVisible;
  elements.togglePromptVisibility.textContent = isVisible ? "收起提示词" : "展开提示词";
  if (!isVisible) {
    updatePromptPreview();
  }
}

function setSizePanelVisibility(isVisible) {
  state.isSizePanelVisible = isVisible;
  elements.sizePanel.hidden = !isVisible;
  elements.sizeChevron.textContent = "▾";
  elements.toggleSizePanel.classList.toggle("is-open", isVisible);
}

function setParamPanelVisibility(isVisible) {
  state.isParamPanelVisible = isVisible;
  elements.paramPanel.hidden = !isVisible;
  elements.paramChevron.textContent = "▾";
  elements.toggleParamPanel.classList.toggle("is-open", isVisible);
}

function setResponseVisibility(isVisible) {
  state.isResponseVisible = isVisible;
  if (elements.responseJson) {
    elements.responseJson.hidden = !isVisible;
  }
  if (elements.toggleResponseVisibility) {
    elements.toggleResponseVisibility.textContent = isVisible ? "收起响应" : "接口响应";
  }
}

function getPromptCategories() {
  return ["全部", ...Array.from(new Set(PROMPT_LIBRARY.map((item) => item.category))).filter(Boolean)];
}

function getFilteredPromptItems() {
  const query = promptLibrary.search.trim().toLowerCase();
  return PROMPT_LIBRARY.filter((item) => {
    const matchesCategory = promptLibrary.activeCategory === "全部" || item.category === promptLibrary.activeCategory;
    if (!matchesCategory) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [item.category, item.title, item.prompt, ...(item.tags || [])].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function renderPromptCategories() {
  elements.promptCategoryList.innerHTML = "";
  for (const category of getPromptCategories()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prompt-category-chip";
    button.classList.toggle("is-active", category === promptLibrary.activeCategory);
    button.textContent = category;
    button.addEventListener("click", () => {
      promptLibrary.activeCategory = category;
      renderPromptLibrary();
    });
    elements.promptCategoryList.appendChild(button);
  }
}

function renderPromptCards() {
  const items = getFilteredPromptItems();
  const visibleItems = items.slice(0, PROMPT_RENDER_LIMIT);
  elements.promptLibraryCount.textContent =
    items.length > visibleItems.length
      ? `${items.length} 条提示词 · 显示前 ${visibleItems.length} 条`
      : `${items.length} 条提示词`;
  elements.promptCardGrid.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "prompt-library-empty";
    empty.textContent = "没有匹配的提示词";
    elements.promptCardGrid.appendChild(empty);
    return;
  }

  for (const item of visibleItems) {
    const card = document.createElement("article");
    card.className = "prompt-card";

    const visual = document.createElement("div");
    visual.className = `prompt-card-visual ${getPromptVisualClass(item)}`;
    visual.setAttribute("aria-label", `${item.title} 示例图`);

    const coverUrl = getPromptCoverUrl(item);
    if (coverUrl) {
      const openPromptCoverPreview = () => {
        openLightboxFromSource({
          previewUrl: coverUrl,
          fileName: item.title || item.category || APP_NAME,
          scale: 1,
        });
      };

      visual.classList.add("has-cover");
      visual.setAttribute("role", "button");
      visual.tabIndex = 0;
      visual.title = item.title || "";
      visual.addEventListener("click", openPromptCoverPreview);
      visual.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPromptCoverPreview();
        }
      });

      const coverImage = document.createElement("img");
      coverImage.className = "prompt-card-cover";
      coverImage.src = coverUrl;
      coverImage.alt = "";
      coverImage.loading = "lazy";
      coverImage.addEventListener("error", () => {
        coverImage.remove();
        visual.classList.remove("has-cover");
        visual.removeAttribute("role");
        visual.removeAttribute("tabindex");
        visual.removeAttribute("title");
      });
      visual.appendChild(coverImage);
    }

    const visualLabel = document.createElement("span");
    visualLabel.textContent = item.category;
    visual.appendChild(visualLabel);

    const meta = document.createElement("div");
    meta.className = "prompt-card-meta";

    const category = document.createElement("span");
    category.className = "prompt-card-category";
    category.textContent = item.category;

    const title = document.createElement("strong");
    title.textContent = item.title;

    const prompt = document.createElement("p");
    prompt.textContent = item.prompt;

    const tags = document.createElement("div");
    tags.className = "prompt-tags";
    for (const tag of item.tags || []) {
      const chip = document.createElement("span");
      chip.textContent = tag;
      tags.appendChild(chip);
    }

    meta.append(category, title, prompt, tags);

    const actions = document.createElement("div");
    actions.className = "prompt-card-actions";

    const appendButton = document.createElement("button");
    appendButton.type = "button";
    appendButton.className = "ghost-button compact-button";
    appendButton.textContent = "追加";
    appendButton.addEventListener("click", () => {
      setPromptValue(item.prompt, "append");
      closePromptLibrary();
      setWorkspace("generate");
      setStatus(`已追加：${item.title}`, "success");
    });

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "secondary-button compact-button";
    useButton.textContent = "填入";
    useButton.addEventListener("click", () => {
      setPromptValue(item.prompt, "replace");
      closePromptLibrary();
      setWorkspace("generate");
      setStatus(`已填入：${item.title}`, "success");
    });

    actions.append(appendButton, useButton);
    card.append(visual, meta, actions);
    elements.promptCardGrid.appendChild(card);
  }
}

function getPromptCoverUrl(item) {
  const id = String(item?.id || "").trim();
  if (!/^prompt-\d{3}$/.test(id)) {
    return "";
  }
  return `${PROMPT_COVER_BASE_PATH}/${id}.jpg`;
}
function getPromptVisualClass(item) {
  const category = item?.category || "";
  const title = item?.title || "";
  const haystack = `${category} ${title}`;
  if (haystack.includes("资产") || haystack.includes("产品") || haystack.includes("主图")) {
    return "prompt-visual-product";
  }
  if (haystack.includes("海报") || haystack.includes("活动") || haystack.includes("排版")) {
    return "prompt-visual-poster";
  }
  if (haystack.includes("品牌") || haystack.includes("发布会") || haystack.includes("KV")) {
    return "prompt-visual-brand";
  }
  if (haystack.includes("封面") || haystack.includes("直播") || haystack.includes("课程")) {
    return "prompt-visual-cover";
  }
  if (haystack.includes("信息") || haystack.includes("流程") || haystack.includes("路线图") || haystack.includes("数据")) {
    return "prompt-visual-info";
  }
  if (haystack.includes("角色") || haystack.includes("设定") || haystack.includes("异兽")) {
    return "prompt-visual-character";
  }
  if (haystack.includes("摄影") || haystack.includes("街拍") || haystack.includes("肖像") || haystack.includes("酒店")) {
    return "prompt-visual-photo";
  }
  if (haystack.includes("参考")) {
    return "prompt-visual-reference";
  }
  return "prompt-visual-default";
}

function renderPromptLibrary() {
  renderPromptCategories();
  renderPromptCards();
}

function setPromptLibraryTab(tab) {
  promptLibrary.activeTab = tab;
  const isBuilder = tab === "builder";
  elements.promptLibraryTabLibrary.classList.toggle("is-active", !isBuilder);
  elements.promptLibraryTabBuilder.classList.toggle("is-active", isBuilder);
  elements.promptLibraryView.hidden = isBuilder;
  elements.promptBuilderView.hidden = !isBuilder;
  elements.promptLibraryCount.textContent = isBuilder ? "自己选词" : `${getFilteredPromptItems().length} 条提示词`;
  if (isBuilder) {
    updateBuilderOutput();
  }
}

function closePromptLibrary() {
  elements.promptLibraryModal.hidden = true;
}

function openPromptLibrary() {
  renderPromptLibrary();
  setPromptLibraryTab(promptLibrary.activeTab);
  elements.promptLibraryModal.hidden = false;
  if (promptLibrary.activeTab === "library") {
    elements.promptLibrarySearch.focus();
  } else {
    elements.builderSubject.focus();
  }
}

function openPromptLibraryCategory(category) {
  const categories = getPromptCategories();
  promptLibrary.activeTab = "library";
  promptLibrary.activeCategory = categories.includes(category) ? category : "全部";
  promptLibrary.search = "";
  if (elements.promptLibrarySearch) {
    elements.promptLibrarySearch.value = "";
  }
  openPromptLibrary();
}

function openPromptCoverFromId(id) {
  const normalizedId = String(id || "").trim();
  if (!/^prompt-\d{3}$/.test(normalizedId)) {
    return;
  }
  openLightboxFromSource({
    previewUrl: `${PROMPT_COVER_BASE_PATH}/${normalizedId}.jpg`,
    fileName: `${normalizedId}.jpg`,
    scale: 1,
  });
}

function fillSelect(select, values) {
  select.innerHTML = "";
  for (const value of values || []) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function buildPromptFromBuilder() {
  const subject = elements.builderSubject.value.trim() || (PROMPT_BUILDER.subjects || [])[0] || "高质量视觉作品";
  const prefix = subject.startsWith("生成") ? "" : "生成一张";
  return [
    `${prefix}${subject}`,
    elements.builderScene.value,
    elements.builderStyle.value,
    elements.builderLighting.value,
    elements.builderComposition.value,
    elements.builderDetail.value,
  ]
    .filter(Boolean)
    .join("，");
}

function updateBuilderOutput() {
  elements.builderOutput.value = buildPromptFromBuilder();
}

function randomizeBuilder() {
  const selects = [
    elements.builderScene,
    elements.builderStyle,
    elements.builderLighting,
    elements.builderComposition,
    elements.builderDetail,
  ];
  for (const select of selects) {
    if (select.options.length > 0) {
      select.selectedIndex = Math.floor(Math.random() * select.options.length);
    }
  }
  const subjects = PROMPT_BUILDER.subjects || [];
  if (subjects.length > 0) {
    elements.builderSubject.value = subjects[Math.floor(Math.random() * subjects.length)];
  }
  updateBuilderOutput();
}

function initializePromptBuilder() {
  fillSelect(elements.builderScene, PROMPT_BUILDER.scenes);
  fillSelect(elements.builderStyle, PROMPT_BUILDER.styles);
  fillSelect(elements.builderLighting, PROMPT_BUILDER.lighting);
  fillSelect(elements.builderComposition, PROMPT_BUILDER.composition);
  fillSelect(elements.builderDetail, PROMPT_BUILDER.details);
  elements.builderSubject.value = (PROMPT_BUILDER.subjects || [])[0] || "";
  updateBuilderOutput();
}

function initializeCanvasAndInspector() {
  imageInspector = window.XiaolanImageInspector?.createImageInspector({
    elements: {
      panel: elements.imageInspectorPanel,
      promptText: elements.imageInspectorPrompt,
      metaText: elements.imageInspectorMeta,
      fileText: elements.imageInspectorFile,
      copyPromptButton: elements.imageInspectorCopy,
      fillPromptButton: elements.imageInspectorFill,
      regenerateButton: elements.imageInspectorRegenerate,
      addReferenceButton: elements.imageInspectorReference,
      sendCanvasButton: elements.imageInspectorCanvas,
    },
    getPromptValue,
    setPromptValue,
    setStatus,
    addReferenceImages,
    onEdit: sendHistoryItemToWorkspace,
    onRegenerate: regenerateFromHistoryItem,
    onSendToCanvas: sendHistoryItemToCanvas,
  });

  canvasWorkbench = window.XiaolanCanvasWorkbench?.createCanvasWorkbench({
    elements: {
      canvas: elements.canvasWorkbenchCanvas,
      dropZone: elements.canvasDropZone,
      empty: elements.canvasEmpty,
      loading: elements.canvasLoading,
      loadingText: elements.canvasLoadingText,
      selectionToolbar: document.getElementById("canvas-selection-toolbar"),
      selectionReferenceButton: document.getElementById("canvas-selection-reference"),
      selectionGenerateButton: document.getElementById("canvas-selection-generate"),
      selectionEditButton: document.getElementById("canvas-selection-edit"),
      contextMenu: document.getElementById("canvas-context-menu"),
      infoModal: document.getElementById("canvas-info-modal"),
      infoList: document.getElementById("canvas-info-list"),
      infoCloseButton: document.getElementById("canvas-info-close"),
      boardSelect: elements.canvasBoardSelect,
      boardNewButton: elements.canvasBoardNew,
      boardDeleteButton: elements.canvasBoardDelete,
      pickButton: elements.canvasPickImage,
      deleteButton: elements.canvasDeleteSelected,
      undoButton: elements.canvasUndo,
      clearButton: elements.canvasClear,
      zoomOutButton: elements.canvasZoomOut,
      zoomFitButton: elements.canvasZoomFit,
      zoomInButton: elements.canvasZoomIn,
      referenceButton: elements.canvasAddReference,
      generateButton: elements.canvasGenerate,
      selectedName: elements.canvasSelectedName,
      prompt: elements.canvasPrompt,
    },
    setStatus,
    addReferenceImages,
    onReferenceAdded: focusReferenceUploader,
    sendToGenerate: (item) => {
      if (!item?.filePath) {
        setStatus("这张图片没有本地路径，不能发送到生图区", "error");
        return;
      }
      state.referenceImagePaths = mergeReferenceImages([], [item.filePath]);
      renderReferenceFiles();
      if (elements.canvasPrompt?.value.trim()) {
        setPromptValue(elements.canvasPrompt.value.trim(), "replace");
      }
      setModeIndicator();
      setWorkspace("generate");
      setStatus(`已发送到生图区：${item.name || getFileName(item.filePath)}`, "success");
    },
    requestGenerate: (overrides) => runGeneration(overrides),
    openImageEditor: (filePath, title) =>
      new Promise((resolve, reject) => {
        openImageAnnotationEditor({
          sourcePath: filePath,
          title: `编辑图片：${title || getFileName(filePath)}`,
          mode: "canvas",
          onSave: resolve,
        }).catch(reject);
      }),
    toFileUrl,
    getPathForFile: (file) => window.desktopApi.getPathForFile(file),
  });

  if (elements.canvasPrompt && !elements.canvasPrompt.value.trim()) {
    elements.canvasPrompt.value = getPromptValue();
  }
}

function setStatus(text, tone = "idle") {
  const rawText = String(text || "").trim() || "准备开始创作";
  let displayText = rawText;

  if (rawText.includes("生成请求超时")) {
    displayText = "生成超时，请减少数量后重试";
  } else if (rawText.startsWith("上游接口返回错误：")) {
    displayText = `接口错误：${rawText.replace("上游接口返回错误：", "")}`;
  } else if (rawText.length > 34) {
    displayText = `${rawText.slice(0, 33)}…`;
  }

  elements.statusText.textContent = displayText;
  elements.statusText.title = rawText;
  elements.statusDot.dataset.state = tone;
}

function showResponseDetail(detail) {
  const text =
    typeof detail === "string"
      ? detail
      : JSON.stringify(detail || {}, null, 2);
  elements.responseJson.textContent = text || "";
  setResponseVisibility(true);
}

function setModeIndicator() {
  const hasReferenceImages = state.referenceImagePaths.length > 0;
  if (elements.modeIndicator) {
    elements.modeIndicator.textContent = hasReferenceImages ? "参考图生成" : "直接生成";
  }
  if (elements.autoModeHint) {
    elements.autoModeHint.textContent = hasReferenceImages ? `${state.referenceImagePaths.length} 张参考图` : "直接生成";
  }
  setReferencePromptGenerating(state.isGeneratingReferencePrompt);
}

function focusReferenceUploader() {
  setWorkspace("generate");
  elements.referenceDropZone?.classList.add("is-attention");
  window.setTimeout(() => {
    elements.referenceDropZone?.classList.remove("is-attention");
  }, 900);
}

function setWorkspace(workspace) {
  const nextWorkspace = ["assets", "gallery", "generate", "ideas", "canvas"].includes(workspace) ? workspace : "generate";
  state.activeWorkspace = nextWorkspace;

  for (const button of elements.workspaceTabs) {
    const isActive = button.dataset.workspaceTab === nextWorkspace;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  for (const panel of elements.workspacePanels) {
    const shouldHide = panel.dataset.workspacePanel !== nextWorkspace || panel.classList.contains("is-removed-panel");
    panel.classList.toggle("is-workspace-hidden", shouldHide);
  }

  const mainWorkspace = ["assets", "gallery", "ideas", "canvas"].includes(nextWorkspace) ? nextWorkspace : "generate";
  for (const panel of elements.mainWorkspacePanels) {
    panel.hidden = panel.dataset.mainWorkspace !== mainWorkspace;
  }
  elements.studioShell?.classList.toggle("is-assets-workspace", nextWorkspace === "assets");
  elements.studioShell?.classList.toggle("is-gallery-workspace", nextWorkspace === "gallery");
  elements.studioShell?.classList.toggle("is-generate-workspace", nextWorkspace === "generate");
  elements.studioShell?.classList.toggle("is-ideas-workspace", nextWorkspace === "ideas");
  elements.studioShell?.classList.toggle("is-canvas-workspace", nextWorkspace === "canvas");
  elements.previewPanel?.classList.toggle("is-canvas-workspace", nextWorkspace === "canvas");
  if (elements.canvasPrompt && nextWorkspace === "canvas" && !elements.canvasPrompt.value.trim()) {
    elements.canvasPrompt.value = getPromptValue();
  }
  if (nextWorkspace === "canvas") {
    window.setTimeout(() => canvasWorkbench?.fitViewToStage?.(), 0);
  }
}

function hydrateSizeButtons() {
  for (const button of elements.sizeButtons) {
    const detail = SIZE_CHIP_DETAILS[button.dataset.size];
    if (!detail) {
      continue;
    }

    button.innerHTML = "";

    const label = document.createElement("strong");
    label.className = "size-chip-label";

    if (detail.shape) {
      const shape = document.createElement("span");
      shape.className = `ratio-shape ${detail.shape}`;
      label.appendChild(shape);
    }

    const title = document.createElement("span");
    title.className = "size-chip-ratio";
    title.textContent = detail.ratio || detail.title || detail.badge;
    label.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "size-chip-meta";

    const resolution = document.createElement("span");
    resolution.className = "size-chip-resolution";
    resolution.textContent = detail.resolution;

    if (detail.badge) {
      const badge = document.createElement("span");
      badge.className = "size-chip-badge";
      badge.textContent = detail.badge;
      meta.appendChild(badge);
    }

    meta.appendChild(resolution);
    button.append(label, meta);
  }
}

function syncSizeButtons() {
  const customSizeActive = !isPresetSizeValue(state.size);
  for (const button of elements.sizeButtons) {
    const isCustomButton = button.dataset.size === "custom";
    const isActive = isCustomButton ? customSizeActive : button.dataset.size === state.size;
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-dimmed", !isActive);
  }

  const sizeLabel = formatSizeValue(state.size);
  elements.sizeDisplay.value = sizeLabel;
  elements.sizeDisplayTag.textContent = state.size === "auto" ? "自动" : sizeLabel;
  syncCustomSizeInputsFromState();
}

function getActivePreviewImage() {
  return getSelectedResultImage() || getSelectedHistoryItem()?.image || null;
}

function getActivePreviewItem() {
  if (
    state.lastResponse &&
    state.selectedResultIndex >= 0 &&
    state.selectedResultIndex < (state.lastResponse.images?.length || 0)
  ) {
    return {
      createdAt: new Date().toISOString(),
      prompt: state.lastResponse.payload?.visiblePrompt || state.lastResponse.payload?.prompt || getPromptValue(),
      mode: Array.isArray(state.lastResponse.payload?.referenceImagePaths) && state.lastResponse.payload.referenceImagePaths.length > 0 ? "image" : "text",
      size: state.lastResponse.payload?.size || state.size,
      outputFormat: state.lastResponse.payload?.output_format || elements.outputFormat.value,
      quality: state.lastResponse.payload?.quality || elements.quality.value,
      referenceImagePaths: Array.isArray(state.lastResponse.payload?.referenceImagePaths)
        ? [...state.lastResponse.payload.referenceImagePaths]
        : [...state.referenceImagePaths],
      image: getSelectedResultImage(),
    };
  }
  return getSelectedHistoryItem();
}

function renderReferenceFiles() {
  elements.referenceCount.textContent = `${state.referenceImagePaths.length}/${MAX_REFERENCE_IMAGES}`;
  elements.referenceFiles.innerHTML = "";
  elements.referenceDropZone?.classList.toggle("has-reference-files", state.referenceImagePaths.length > 0);
  setReferencePromptGenerating(state.isGeneratingReferencePrompt);

  if (state.referenceImagePaths.length === 0) {
    elements.referenceFiles.classList.add("empty");
    const empty = document.createElement("div");
    empty.className = "reference-empty";
    empty.textContent = "当前还没有参考图。";
    elements.referenceFiles.appendChild(empty);
    return;
  }

  elements.referenceFiles.classList.remove("empty");

  state.referenceImagePaths.forEach((filePath, index) => {
    const card = document.createElement("article");
    card.className = "reference-card";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "reference-preview-button";
    previewButton.setAttribute("aria-label", `预览参考图 ${index + 1}`);

    const previewImage = document.createElement("img");
    previewImage.src = toFileUrl(filePath);
    previewImage.alt = getFileName(filePath);
    previewButton.appendChild(previewImage);

    const badge = document.createElement("span");
    badge.className = "reference-preview-index";
    badge.textContent = `${index + 1}`;
    previewButton.appendChild(badge);

    previewButton.addEventListener("click", () => {
      openLightboxFromSource({
        previewUrl: toFileUrl(filePath),
        fileName: getFileName(filePath),
        scale: 1,
      });
    });

    const meta = document.createElement("div");
    meta.className = "reference-card-meta";

    const name = document.createElement("strong");
    name.className = "reference-card-name";
    name.textContent = getFileName(filePath);
    meta.appendChild(name);

    const pathText = document.createElement("span");
    pathText.className = "reference-card-path";
    pathText.textContent = filePath;
    meta.appendChild(pathText);

    const actions = document.createElement("div");
    actions.className = "reference-card-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary-button compact-button";
    editButton.textContent = "编辑";
    editButton.addEventListener("click", async () => {
      try {
        await openReferenceEditor(index);
      } catch (error) {
        setStatus(getFriendlyErrorMessage(error, "参考图打开失败"), "error");
      }
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button compact-button";
    removeButton.textContent = "移除";
    removeButton.addEventListener("click", () => {
      removeReferenceImage(index);
    });

    actions.append(editButton, removeButton);
    card.append(previewButton, meta, actions);
    elements.referenceFiles.appendChild(card);
  });
}

function mergeReferenceImages(existing, incoming) {
  const seen = new Set();
  const merged = [];

  for (const filePath of [...existing, ...incoming]) {
    const normalized = String(filePath || "").trim();
    if (!normalized) {
      continue;
    }
    const lookupKey = normalized.toLowerCase();
    if (seen.has(lookupKey)) {
      continue;
    }
    seen.add(lookupKey);
    merged.push(normalized);
    if (merged.length >= MAX_REFERENCE_IMAGES) {
      break;
    }
  }

  return merged;
}

function getReferenceExtension(filePath) {
  const cleanPath = normalizeDroppedPath(filePath);
  const extension = String(cleanPath || "").split(/[?#]/)[0].split(".").pop().toLowerCase();
  return extension;
}

function filterReferenceImagePaths(filePaths) {
  const seen = new Set();
  return (filePaths || [])
    .map((filePath) => normalizeDroppedPath(filePath))
    .filter((filePath) => {
      if (!filePath || !SUPPORTED_REFERENCE_EXTENSIONS.has(getReferenceExtension(filePath))) {
        return false;
      }
      const key = filePath.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function addReferenceImages(filePaths, source = "选择") {
  const imagePaths = filterReferenceImagePaths(filePaths);
  if (imagePaths.length === 0) {
    setStatus("请添加 png、jpg、jpeg 或 webp 图片", "error");
    return;
  }

  const previousLength = state.referenceImagePaths.length;
  state.referenceImagePaths = mergeReferenceImages(state.referenceImagePaths, imagePaths);
  const addedCount = state.referenceImagePaths.length - previousLength;

  setModeIndicator();
  renderReferenceFiles();

  if (addedCount <= 0) {
    setStatus(`参考图没有新增，最多保留 ${MAX_REFERENCE_IMAGES} 张`, "idle");
    return;
  }

  const limited = imagePaths.length > addedCount;
  setStatus(
    limited
      ? `已通过${source}添加 ${addedCount} 张参考图，最多保留 ${MAX_REFERENCE_IMAGES} 张`
      : `已通过${source}添加 ${addedCount} 张参考图`,
    "success"
  );
}

function isClipboardImageFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name);
}

async function handleReferencePaste(event) {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return;
  }

  const files = Array.from(clipboardData.files || []).filter(isClipboardImageFile);
  const imageItems = Array.from(clipboardData.items || []).filter((item) =>
    String(item?.type || "").toLowerCase().startsWith("image/")
  );
  if (files.length === 0 && imageItems.length === 0) {
    return;
  }

  event.preventDefault();
  setWorkspace("generate");

  const filePaths = files
    .map((file) => window.desktopApi.getPathForFile?.(file) || file.path || "")
    .filter(Boolean);
  if (filePaths.length > 0) {
    addReferenceImages(filePaths, "粘贴");
    return;
  }

  if (!window.desktopApi.saveClipboardImageAsReference) {
    setStatus("当前版本不支持直接保存剪贴板图片", "error");
    return;
  }

  const savedPath = await window.desktopApi.saveClipboardImageAsReference({
    outputDir: elements.outputDir?.value?.trim() || "",
  });
  if (savedPath) {
    addReferenceImages([savedPath], "粘贴");
  } else {
    setStatus("剪贴板里没有可用图片", "error");
  }
}

function addImageToReference(image, source = "预览图") {
  if (!image?.filePath) {
    setStatus("当前没有可加入参考图的图片", "error");
    return;
  }
  addReferenceImages([image.filePath], source);
}

function addImageToCanvas(image) {
  if (!image?.filePath) {
    setStatus("当前没有可放入画布的图片", "error");
    return;
  }
  setWorkspace("canvas");
  canvasWorkbench?.addImage({
    filePath: image.filePath,
    fileName: image.fileName || getImageName(image),
    meta: {
      mode: image.mode || getActivePreviewItem()?.mode || "",
      prompt: getActivePreviewItem()?.prompt || getPromptValue(),
      size: getActivePreviewItem()?.size || state.size,
      quality: getActivePreviewItem()?.quality || elements.quality?.value || "",
      outputFormat: getActivePreviewItem()?.outputFormat || elements.outputFormat?.value || "",
      referenceImagePaths: getActivePreviewItem()?.referenceImagePaths || [],
      createdAt: getActivePreviewItem()?.createdAt || "",
    },
  });
}

function applyItemGenerationSettings(item) {
  if (!item || typeof item !== "object") {
    return;
  }
  if (item.size) {
    state.size = item.size;
    syncSizeButtons();
  }
  if (item.quality && elements.quality) {
    elements.quality.value = item.quality;
  }
  if (item.outputFormat && elements.outputFormat) {
    elements.outputFormat.value = item.outputFormat;
  }
}

function getItemReferencePathsForReuse(item) {
  const storedPaths = Array.isArray(item?.referenceImagePaths)
    ? item.referenceImagePaths.map((filePath) => String(filePath || "").trim()).filter(Boolean)
    : [];
  if (storedPaths.length > 0) {
    return storedPaths;
  }
  if (item?.mode === "image" && item?.image?.filePath) {
    return [item.image.filePath];
  }
  return [];
}

function sendHistoryItemToWorkspace(item) {
  if (!item?.image?.filePath) {
    setStatus("当前记录没有可编辑的图片", "error");
    return;
  }
  if (item.prompt) {
    setPromptValue(item.prompt, "replace");
  }
  applyItemGenerationSettings(item);
  state.referenceImagePaths = mergeReferenceImages([], [item.image.filePath]);
  renderReferenceFiles();
  setModeIndicator();
  setWorkspace("generate");
  setStatus("已发送到工作区，并填入生成词", "success");
}

function sendHistoryItemToCanvas(item) {
  if (item?.prompt && elements.canvasPrompt) {
    elements.canvasPrompt.value = item.prompt;
  }
  addImageToCanvas(item?.image || item);
}

function regenerateFromHistoryItem(item) {
  if (!item?.prompt) {
    setStatus("当前记录没有生成词，无法做同款", "error");
    return;
  }
  setPromptValue(item.prompt, "replace");
  applyItemGenerationSettings(item);
  state.referenceImagePaths = item.mode === "image" ? mergeReferenceImages([], getItemReferencePathsForReuse(item)) : [];
  renderReferenceFiles();
  setModeIndicator();
  setWorkspace("generate");

  if (item.mode === "image" && state.referenceImagePaths.length === 0) {
    setStatus("这条历史缺少参考图，已停止做同款", "error");
    return;
  }

  window.setTimeout(() => elements.generateButton.click(), 0);
}

function refreshImageInspector() {
  imageInspector?.render(getActivePreviewItem(), getActivePreviewImage());
}

function getDroppedReferencePaths(dataTransfer) {
  const paths = [];
  const pushPath = (value) => {
    for (const item of splitDroppedPathText(value)) {
      const normalized = normalizeDroppedPath(item);
      if (normalized) {
        paths.push(normalized);
      }
    }
  };

  pushPath(dataTransfer?.getData("application/x-xiaolan-reference-path"));
  pushPath(dataTransfer?.getData("text/uri-list"));
  pushPath(dataTransfer?.getData("text/plain"));

  for (const file of Array.from(dataTransfer?.files || [])) {
    pushPath(window.desktopApi.getPathForFile(file));
  }

  return paths;
}

function preventReferenceDragDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

function setReferenceDragActive(isActive) {
  elements.referenceDropZone.classList.toggle("is-dragging", isActive);
}

function removeReferenceImage(index) {
  const removed = state.referenceImagePaths[index];
  state.referenceImagePaths = state.referenceImagePaths.filter((_, itemIndex) => itemIndex !== index);
  renderReferenceFiles();
  setModeIndicator();
  setStatus(`已移除参考图：${getFileName(removed)}`, "idle");
}

function mergeModelOptions(...groups) {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((model) => String(model || "").trim())
        .filter(Boolean)
    )
  );
}

function setModelOptions(datalist, select, models, placeholder = "选择模型") {
  if (datalist) {
    datalist.replaceChildren();
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model;
      datalist.appendChild(option);
    }
  }

  if (!select) {
    return;
  }

  const previousValue = select.value;
  select.replaceChildren();
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    option.title = model;
    select.appendChild(option);
  }

  select.value = models.includes(previousValue) ? previousValue : "";
}

function syncModelSelectValues() {
  if (elements.modelSelect) {
    const value = String(elements.model?.value || "").trim();
    elements.modelSelect.value = Array.from(elements.modelSelect.options).some((option) => option.value === value)
      ? value
      : "";
  }
  if (elements.referencePromptModelSelect) {
    const value = String(elements.referencePromptModel?.value || "").trim();
    elements.referencePromptModelSelect.value = Array.from(elements.referencePromptModelSelect.options).some(
      (option) => option.value === value
    )
      ? value
      : "";
  }
}

function isImageGenerationModel(model) {
  return /image|banana|dall|gpt-image|flux|stable|sd/i.test(model);
}

function isReferencePromptModel(model) {
  return (
    !isImageGenerationModel(model) &&
    /gpt|gemini|vision|vl|qwen|claude|glm|llava|pixtral/i.test(model)
  );
}

function hydrateModelOptions(remoteModels = [], target = "all") {
  const currentImageModel = elements.model?.value || "";
  const currentReferenceModel = elements.referencePromptModel?.value || "";
  const remoteImageModels = remoteModels.filter(isImageGenerationModel);
  const remoteReferenceModels = remoteModels.filter(isReferencePromptModel);
  const imageModels = mergeModelOptions(
    BUILTIN_IMAGE_MODELS,
    remoteImageModels,
    target === "image" ? remoteModels : [],
    [currentImageModel]
  );
  const referenceModels = mergeModelOptions(
    BUILTIN_REFERENCE_PROMPT_MODELS,
    remoteReferenceModels,
    target === "reference" ? remoteModels : [],
    [currentReferenceModel]
  );
  setModelOptions(elements.modelOptions, elements.modelSelect, imageModels, "选择生图模型");
  setModelOptions(
    elements.referencePromptModelOptions,
    elements.referencePromptModelSelect,
    referenceModels,
    "选择识图模型"
  );
  syncModelSelectValues();
}

async function refreshModelOptions(target = "all") {
  if (!window.desktopApi.listModels) {
    throw new Error("当前版本还不支持读取模型列表。");
  }
  const isReferenceTarget = target === "reference";
  const button = isReferenceTarget ? elements.refreshReferenceModelsButton : elements.refreshModelsButton;
  const previousText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "读取中...";
  }
  try {
    const baseUrl = isReferenceTarget && elements.referencePromptBaseUrl?.value.trim()
      ? elements.referencePromptBaseUrl.value.trim()
      : elements.baseUrl.value.trim();
    const apiKey = isReferenceTarget && elements.referencePromptApiKey?.value.trim()
      ? elements.referencePromptApiKey.value.trim()
      : elements.apiKey.value.trim();
    const models = await window.desktopApi.listModels({ baseUrl, apiKey });
    hydrateModelOptions(models, target);
    const count = Array.isArray(models) ? models.length : 0;
    setStatus(count > 0 ? `已读取 ${count} 个模型，可继续手动输入` : "接口没有返回模型列表，可继续手动输入", "success");
  } catch (error) {
    hydrateModelOptions();
    setStatus(getFriendlyErrorMessage(error, "读取模型列表失败，可继续手动输入"), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function getConfigFromForm() {
  return {
    baseUrl: elements.baseUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    model: elements.model.value.trim(),
    referencePromptModel: elements.referencePromptModel ? elements.referencePromptModel.value.trim() : "",
    referencePromptApiKey: elements.referencePromptApiKey
      ? elements.referencePromptApiKey.value.trim()
      : "",
    referencePromptBaseUrl: elements.referencePromptBaseUrl
      ? elements.referencePromptBaseUrl.value.trim()
      : "",
    quality: elements.quality.value,
    outputFormat: elements.outputFormat.value,
    outputDir: elements.outputDir.value.trim(),
  };
}

function fillConfig(config) {
  elements.baseUrl.value = config.baseUrl || "";
  elements.apiKey.value = config.apiKey || "";
  elements.model.value = config.model || "gpt-image-2";
  if (elements.referencePromptModel) {
    elements.referencePromptModel.value = config.referencePromptModel || "";
  }
  if (elements.referencePromptApiKey) {
    elements.referencePromptApiKey.value = config.referencePromptApiKey || "";
  }
  if (elements.referencePromptBaseUrl) {
    elements.referencePromptBaseUrl.value = config.referencePromptBaseUrl || "";
  }
  elements.quality.value = config.quality || "high";
  elements.outputFormat.value = config.outputFormat || "png";
  elements.outputDir.value = config.outputDir || "";
  syncModelSelectValues();
}

async function saveSettings() {
  const saved = await window.desktopApi.saveConfig(getConfigFromForm());
  fillConfig(saved);
  setStatus("设置已保存", "success");
}

function setReferencePromptGenerating(isGenerating) {
  state.isGeneratingReferencePrompt = isGenerating;
  if (!elements.generateReferencePrompt) {
    return;
  }

  elements.generateReferencePrompt.disabled =
    isGenerating || state.referenceImagePaths.length === 0;
  elements.generateReferencePrompt.textContent = isGenerating ? "识图生成中..." : "参考图生成词";
  updateGenerationControls();
}

async function handleGenerateReferencePrompt() {
  if (!window.desktopApi.generatePromptFromReferenceImages) {
    throw new Error("当前版本还不支持参考图生成词。");
  }

  if (!Array.isArray(state.referenceImagePaths) || state.referenceImagePaths.length === 0) {
    throw new Error("请先添加至少一张参考图。");
  }

  setReferencePromptGenerating(true);
  setStatus("正在分析参考图并生成提示词", "loading");

  try {
    const result = await window.desktopApi.generatePromptFromReferenceImages({
      config: getConfigFromForm(),
      prompt: getPromptValue(),
      referencePromptModel: elements.referencePromptModel ? elements.referencePromptModel.value.trim() : "",
      referenceImagePaths: state.referenceImagePaths,
    });

    const prompt = String(result?.prompt || "").trim();
    if (!prompt) {
      throw new Error("没有生成可用的提示词。");
    }

    setPromptValue(prompt, "replace");
    setStatus("已根据参考图生成提示词", "success");
  } finally {
    setReferencePromptGenerating(false);
  }
}

function buildGenerationInput(overrides = {}) {
  const canvasPrompt = state.activeWorkspace === "canvas" ? String(elements.canvasPrompt?.value || "").trim() : "";
  return {
    config: getConfigFromForm(),
    model: elements.model.value.trim(),
    prompt: canvasPrompt || getPromptValue(),
    size: overrides.size || state.size,
    quality: elements.quality.value,
    outputFormat: elements.outputFormat.value,
    count: Number(elements.count.value || 1),
    referenceImagePaths: Array.isArray(overrides.referenceImagePaths)
      ? overrides.referenceImagePaths
      : state.referenceImagePaths,
  };
}

function normalizeGenerationCount(value) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  const count = Number.isInteger(parsed) ? parsed : 1;
  return Math.min(MAX_GENERATION_COUNT, Math.max(1, count));
}

function getGenerationCount() {
  return normalizeGenerationCount(elements.count.value);
}

function getActiveGenerationCount() {
  return state.activeGenerationTasks instanceof Set ? state.activeGenerationTasks.size : 0;
}

function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getOldestGenerationStartedAt() {
  if (!(state.generationTaskStartedAt instanceof Map) || state.generationTaskStartedAt.size === 0) {
    return 0;
  }
  return Math.min(...Array.from(state.generationTaskStartedAt.values()));
}

function updateGenerationProgressStrip() {
  const activeCount = getActiveGenerationCount();
  if (elements.generationPendingCount) {
    elements.generationPendingCount.textContent = String(activeCount);
  }
  if (elements.generationElapsedTime) {
    const startedAt = getOldestGenerationStartedAt();
    elements.generationElapsedTime.textContent = startedAt ? formatElapsedTime(Date.now() - startedAt) : "00:00";
  }
  if (elements.generationProgressStrip) {
    elements.generationProgressStrip.hidden = activeCount <= 0;
    elements.generationProgressStrip.classList.toggle("is-paused", state.isGenerationPaused);
  }
}

function syncGenerationTimer() {
  const activeCount = getActiveGenerationCount();
  if (activeCount > 0 && !state.generationTimerId) {
    state.generationTimerId = window.setInterval(updateGenerationProgressStrip, 1000);
  }
  if (activeCount <= 0 && state.generationTimerId) {
    window.clearInterval(state.generationTimerId);
    state.generationTimerId = null;
  }
  updateGenerationProgressStrip();
}

async function requestGenerationWithTimeout(input) {
  let timeoutId = null;
  let progressTimeoutId = null;
  const requestedCount = normalizeGenerationCount(input?.count);
  const hasReferenceImages = Array.isArray(input?.referenceImagePaths) && input.referenceImagePaths.length > 0;
  const timeoutMs =
    RENDERER_GENERATION_TIMEOUT_MS +
    (requestedCount > 1 ? RENDERER_MULTI_GENERATION_EXTRA_TIMEOUT_MS : 0) +
    (hasReferenceImages ? RENDERER_REFERENCE_EXTRA_TIMEOUT_MS : 0);

  try {
    progressTimeoutId = setTimeout(() => {
      const elapsedSeconds = hasReferenceImages ? 35 : 25;
      elements.responseJson.textContent = `上游接口仍在处理，已等待约 ${elapsedSeconds} 秒...\n如果长时间没有结果，请检查 API 地址、Key、模型额度或网络。`;
      setStatus("接口处理中，请稍等", "loading");
    }, hasReferenceImages ? 35000 : 25000);

    return await Promise.race([
      window.desktopApi.generateImages(input),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`生成请求超时，已等待 ${Math.floor(timeoutMs / 1000)} 秒。`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (progressTimeoutId) {
      clearTimeout(progressTimeoutId);
    }
  }
}

function getSelectedImage() {
  const images = state.lastResponse?.images;
  if (!Array.isArray(images)) {
    return null;
  }
  if (state.selectedImageIndex < 0 || state.selectedImageIndex >= images.length) {
    return null;
  }
  return images[state.selectedImageIndex];
}

function getSelectedResultImage() {
  const images = state.lastResponse?.images;
  if (!Array.isArray(images)) {
    return null;
  }
  const index =
    state.selectedResultIndex >= 0 && state.selectedResultIndex < images.length
      ? state.selectedResultIndex
      : state.selectedImageIndex;
  if (index < 0 || index >= images.length) {
    return null;
  }
  return images[index];
}

function getSelectedHistoryItem() {
  if (state.selectedImageIndex < 0 || state.selectedImageIndex >= historyItems.length) {
    return null;
  }
  return historyItems[state.selectedImageIndex];
}

function getSelectedHistoryIds() {
  const selectedIds = state.selectedHistoryIds instanceof Set ? Array.from(state.selectedHistoryIds) : [];
  if (selectedIds.length > 0) {
    return selectedIds;
  }
  const selectedItem = getSelectedHistoryItem();
  return selectedItem?.id ? [selectedItem.id] : [];
}

function updateHistorySelectionControls() {
  const selectedCount = getSelectedHistoryIds().length;
  if (elements.deleteSelectedHistoryButton) {
    elements.deleteSelectedHistoryButton.disabled = selectedCount === 0;
  }
  if (elements.deleteSelectedLocalButton) {
    elements.deleteSelectedLocalButton.disabled = selectedCount === 0;
  }
  if (elements.historyTag) {
    const total = Array.isArray(historyItems) ? historyItems.length : 0;
    elements.historyTag.textContent =
      selectedCount > 0 ? `${total} 条记录 · 已选 ${selectedCount}` : `${total} 条记录`;
  }
}

function hideHistoryContextMenu() {
  if (!elements.historyContextMenu) {
    return;
  }
  elements.historyContextMenu.hidden = true;
  state.contextHistoryId = "";
}

function showHistoryContextMenu(event, item) {
  if (!elements.historyContextMenu || !item?.id) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  state.contextHistoryId = item.id;
  if (!state.selectedHistoryIds.has(item.id)) {
    state.selectedHistoryIds = new Set([item.id]);
    syncHistoryCardSelection();
  }

  elements.historyContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 136)}px`;
  elements.historyContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 94)}px`;
  elements.historyContextMenu.hidden = false;
}

function syncHistoryCardSelection() {
  for (const item of elements.resultGrid.querySelectorAll(".history-item")) {
    const itemId = item.dataset.id || "";
    const isSelected = state.selectedHistoryIds.has(itemId);
    const isActive = Number(item.dataset.index) === state.selectedImageIndex;
    item.classList.toggle("is-active", isActive);
    item.classList.toggle("is-selected", isSelected);
    item.classList.toggle("is-muted", !isActive && !isSelected);
  }
  updateHistorySelectionControls();
}

function updateHistorySelection(item, index, event = {}) {
  if (!item?.id) {
    return;
  }
  const nextSet = new Set(state.selectedHistoryIds);
  if (event.shiftKey && state.selectedImageIndex >= 0) {
    const start = Math.min(state.selectedImageIndex, index);
    const end = Math.max(state.selectedImageIndex, index);
    for (let itemIndex = start; itemIndex <= end; itemIndex += 1) {
      const rangeItem = historyItems[itemIndex];
      if (rangeItem?.id) {
        nextSet.add(rangeItem.id);
      }
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (nextSet.has(item.id)) {
      nextSet.delete(item.id);
    } else {
      nextSet.add(item.id);
    }
  } else {
    nextSet.clear();
    nextSet.add(item.id);
  }
  state.selectedHistoryIds = nextSet;
  selectImage(index, { preserveSelection: true });
}

async function deleteHistorySelection({ deleteLocalFiles = false, ids = null } = {}) {
  const targetIds = Array.isArray(ids) && ids.length > 0 ? ids : getSelectedHistoryIds();
  if (targetIds.length === 0) {
    return;
  }

  const actionText = deleteLocalFiles ? "删除本地文件和显示记录" : "从我的作品里删除显示记录";
  const confirmed = window.confirm(`确定要${actionText}？共 ${targetIds.length} 条。`);
  if (!confirmed) {
    return;
  }

  hideHistoryContextMenu();
  historyItems = await window.desktopApi.deleteHistoryItems({
    ids: targetIds,
    deleteLocalFiles,
  });
  state.selectedHistoryIds = new Set(
    Array.from(state.selectedHistoryIds).filter((id) =>
      historyItems.some((item) => item.id === id)
    )
  );
  state.lastResponse = null;
  state.selectedImageIndex = historyItems.length > 0 ? 0 : -1;
  renderResults();
  setStatus(deleteLocalFiles ? "已删除本地文件和显示记录" : "已删除显示记录", "success");
}

function applyPreviewScale() {
  elements.previewImage.style.transform = `scale(${state.previewScale})`;
}

function applyLightboxScale() {
  elements.lightboxImage.style.transform = `scale(${state.lightboxScale})`;
  elements.lightboxScaleLabel.textContent = `${Math.round(state.lightboxScale * 100)}%`;
}

function updateZoomControls() {
  const canPreview = isPreviewableImage(getActivePreviewImage());
  const currentResultCount = Array.isArray(state.lastResponse?.images) ? state.lastResponse.images.length : 0;
  const pageCount = Math.max(currentResultCount, Array.isArray(historyItems) ? historyItems.length : 0);
  const hasPreviewTarget = Boolean(getActivePreviewImage());
  const canPage = hasPreviewTarget && pageCount > 1 && (state.selectedImageIndex >= 0 || state.selectedResultIndex >= 0);
  if (elements.previewPrevButton) {
    elements.previewPrevButton.disabled = !canPage;
    elements.previewPrevButton.hidden = !canPage;
  }
  if (elements.previewNextButton) {
    elements.previewNextButton.disabled = !canPage;
    elements.previewNextButton.hidden = !canPage;
  }
  elements.zoomInButton.disabled = !canPreview;
  elements.zoomOutButton.disabled = !canPreview;
  elements.resetZoomButton.disabled = !canPreview;
  if (elements.usePreviewAsReferenceButton) {
    elements.usePreviewAsReferenceButton.disabled = !canPreview;
  }
  if (elements.sendPreviewToCanvasButton) {
    elements.sendPreviewToCanvasButton.disabled = !canPreview;
  }
}

function resetPreviewScale() {
  state.previewScale = 1;
  applyPreviewScale();
}

function updateGenerationControls() {
  const activeCount = getActiveGenerationCount();
  const generationLimit = getGenerationCount();
  const isGenerating = activeCount > 0;
  const isPaused = state.isGenerationPaused;
  state.isGenerating = isGenerating;

  if (elements.generateButton) {
    elements.generateButton.disabled =
      state.isGeneratingReferencePrompt || isPaused || activeCount >= generationLimit;
  }
  if (elements.generateButtonText) {
    if (state.isGeneratingReferencePrompt) {
      elements.generateButtonText.textContent = "识图中...";
    } else if (isPaused) {
      elements.generateButtonText.textContent = "已暂停";
    } else if (activeCount >= generationLimit) {
      elements.generateButtonText.textContent = `已达上限 ${activeCount}/${generationLimit}`;
    } else if (isGenerating) {
      elements.generateButtonText.textContent = `继续生图 ${activeCount}/${generationLimit}`;
    } else {
      elements.generateButtonText.textContent = "开始创作";
    }
  }
  if (elements.pauseGenerationButton) {
    elements.pauseGenerationButton.disabled = !isGenerating && !isPaused;
    elements.pauseGenerationButton.textContent = isPaused ? "继续" : "暂停";
    elements.pauseGenerationButton.classList.toggle("is-paused", isPaused);
  }
  syncGenerationTimer();
  const hasActivePreviewImage = Boolean(getActivePreviewImage());
  elements.buttonSpinner.hidden = !isGenerating;
  elements.previewLoader.hidden = !isGenerating || hasActivePreviewImage;
  elements.generateButton?.classList.toggle("is-loading", isGenerating);
  elements.previewStage?.classList.toggle("is-loading", isGenerating);
  elements.previewStage?.classList.toggle("is-generating-mask", isGenerating && !hasActivePreviewImage);
  updateZoomControls();
}

function setGenerating(isGenerating) {
  if (!isGenerating) {
    state.activeGenerationTasks.clear();
    state.generationTaskStartedAt.clear();
    state.isGenerationPaused = false;
  } else if (state.activeGenerationTasks.size === 0) {
    state.activeGenerationTasks.add("manual");
    state.generationTaskStartedAt.set("manual", Date.now());
  }
  updateGenerationControls();
  if (!state.isGenerating) {
    updatePreview();
  }
}

function updatePreview() {
  const activeImage = getActivePreviewImage();
  updateHistorySelectionControls();

  if (!activeImage) {
    elements.previewStage.classList.add("is-empty");
    elements.previewImage.hidden = true;
    elements.previewImage.removeAttribute("src");
    elements.previewStage.classList.toggle("has-image", false);
    elements.previewStage.classList.toggle("has-file", false);
    elements.previewEmpty.hidden = state.isGenerating;
    renderPreviewMessage(
      "预览区",
      historyItems.length > 0
        ? "请从下方历史记录中点选一张图片查看大图。"
        : "生成完成后会直接在这里查看大图。"
    );
    elements.openImageButton.disabled = true;
    elements.showImageFolderButton.disabled = true;
    elements.resultSummary.textContent =
      historyItems.length > 0
        ? "请从下方历史记录中点选一张图片查看大图。"
        : "生成结果会优先显示在这里，点击缩略图可切换。";
    updateZoomControls();
    refreshImageInspector();
    return;
  }

  const canPreview = isPreviewableImage(activeImage);
  elements.previewStage.classList.remove("is-empty");
  elements.previewStage.classList.toggle("has-image", canPreview);
  elements.previewStage.classList.toggle("has-file", !canPreview);
  if (canPreview) {
    elements.previewEmpty.replaceChildren();
    elements.previewEmpty.classList.remove("is-file-card");
    elements.previewImage.src = getImageUrl(activeImage);
    elements.previewImage.alt = getImageName(activeImage);
    elements.previewImage.draggable = true;
    elements.previewImage.dataset.referencePath = activeImage.filePath || "";
    elements.previewImage.hidden = false;
    elements.previewEmpty.hidden = true;
  } else {
    const fileType = (getImageExtension(activeImage) || "file").toUpperCase();
    elements.previewImage.hidden = true;
    elements.previewImage.removeAttribute("src");
    elements.previewImage.removeAttribute("data-reference-path");
    elements.previewEmpty.hidden = false;
    renderPreviewMessage(
      `${fileType} 文件已生成`,
      "这个格式不能在内置预览里直接放大，但已经保存成功，可以点击打开原文件或打开所在文件夹。",
      fileType
    );
  }
  elements.openImageButton.disabled = false;
  elements.showImageFolderButton.disabled = false;

  if (
    state.lastResponse &&
    state.selectedResultIndex >= 0 &&
    state.selectedResultIndex < (state.lastResponse.images?.length || 0)
  ) {
    const total = state.lastResponse.images.length;
    elements.resultSummary.textContent = `当前结果 ${state.selectedResultIndex + 1} / ${total} · ${getImageName(activeImage)}`;
  } else if (historyItems.length > 0 && state.selectedImageIndex >= 0) {
    elements.resultSummary.textContent = `历史记录 ${state.selectedImageIndex + 1} / ${historyItems.length} · ${getImageName(activeImage)}`;
  } else {
    elements.resultSummary.textContent = getImageName(activeImage);
  }

  updateZoomControls();
  refreshImageInspector();
}

function selectImage(index, options = {}) {
  const currentResultCount = Array.isArray(state.lastResponse?.images) ? state.lastResponse.images.length : 0;
  const total = Math.max(currentResultCount, Array.isArray(historyItems) ? historyItems.length : 0);
  const nextIndex = total > 0 ? ((Number(index) % total) + total) % total : -1;
  state.selectedImageIndex = nextIndex;
  if (!options.preserveSelection) {
    const itemId = historyItems[nextIndex]?.id;
    state.selectedHistoryIds = itemId ? new Set([itemId]) : new Set();
  }
  state.selectedResultIndex = nextIndex >= 0 && nextIndex < currentResultCount ? nextIndex : -1;
  resetPreviewScale();

  syncHistoryCardSelection();
  updatePreview();
}

function pagePreview(direction) {
  const currentResultCount = Array.isArray(state.lastResponse?.images) ? state.lastResponse.images.length : 0;
  const total = Math.max(currentResultCount, Array.isArray(historyItems) ? historyItems.length : 0);
  if (total <= 1) {
    return;
  }
  const currentIndex =
    state.selectedImageIndex >= 0
      ? state.selectedImageIndex
      : state.selectedResultIndex >= 0
        ? state.selectedResultIndex
        : 0;
  selectImage(currentIndex + direction);
}

function renderResults() {
  elements.resultGrid.innerHTML = "";
  if (!Array.isArray(historyItems) || historyItems.length === 0) {
    state.selectedImageIndex = -1;
    state.selectedHistoryIds = new Set();
    updatePreview();
    return;
  }

  historyItems.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "history-item";
    card.dataset.index = String(index);
    card.dataset.id = item.id || "";
    if (isPreviewableImage(item.image) && item.image?.filePath) {
      card.draggable = true;
      card.dataset.referencePath = item.image.filePath;
    }

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "history-preview-button";
    previewButton.setAttribute("aria-label", `选择 ${getImageName(item.image)}`);

    const thumb = document.createElement("div");
    const canPreview = isPreviewableImage(item.image);
    thumb.className = canPreview ? "history-thumb" : "history-thumb is-file";

    if (canPreview) {
      const thumbImage = document.createElement("img");
      thumbImage.src = getImageUrl(item.image);
      thumbImage.alt = getImageName(item.image);
      thumbImage.draggable = false;
      thumbImage.loading = "lazy";
      thumbImage.decoding = "async";
      thumbImage.addEventListener("error", () => {
        const badge = document.createElement("div");
        badge.className = "file-thumb-badge";
        badge.textContent = "失败";
        thumb.classList.add("is-file", "is-broken");
        thumb.title = `图片加载失败：${getImageName(item.image)}`;
        thumb.replaceChildren(badge);
      });
      thumb.appendChild(thumbImage);
    } else {
      const badge = document.createElement("div");
      badge.className = "file-thumb-badge";
      badge.textContent = (getImageExtension(item.image) || "file").toUpperCase();
      thumb.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "history-meta";

    const name = document.createElement("strong");
    name.textContent = getImageName(item.image);

    const prompt = document.createElement("span");
    prompt.textContent = item.prompt;

    meta.append(name, prompt);
    previewButton.append(thumb, meta);

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary-button compact-button";
    editButton.textContent = "编辑";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectImage(index);
      sendHistoryItemToWorkspace(item);
    });

    const repeatButton = document.createElement("button");
    repeatButton.type = "button";
    repeatButton.className = "secondary-button compact-button";
    repeatButton.textContent = "做同款";
    repeatButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectImage(index);
      regenerateFromHistoryItem(item);
    });

    const canvasButton = document.createElement("button");
    canvasButton.type = "button";
    canvasButton.className = "ghost-button compact-button";
    canvasButton.textContent = "到画布";
    canvasButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectImage(index);
      sendHistoryItemToCanvas(item);
    });

    actions.append(editButton, repeatButton, canvasButton);
    card.append(previewButton, actions);

    previewButton.addEventListener("click", (event) => {
      updateHistorySelection(item, index, event);
    });

    previewButton.addEventListener("dblclick", () => {
      openLightbox();
    });

    card.addEventListener("dragstart", (event) => {
      if (!item.image?.filePath) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-xiaolan-reference-path", item.image.filePath);
      event.dataTransfer.setData("text/plain", item.image.filePath);
    });

    card.addEventListener("contextmenu", (event) => {
      showHistoryContextMenu(event, item);
    });

    elements.resultGrid.appendChild(card);
  });

  const targetIndex =
    state.selectedImageIndex >= 0 && state.selectedImageIndex < historyItems.length ? state.selectedImageIndex : 0;
  const targetId = historyItems[targetIndex]?.id;
  state.selectedHistoryIds = new Set(
    Array.from(state.selectedHistoryIds).filter((id) => historyItems.some((item) => item.id === id))
  );
  if (state.selectedHistoryIds.size === 0 && targetId) {
    state.selectedHistoryIds.add(targetId);
  }
  selectImage(targetIndex, { preserveSelection: true });
}

function clearCurrentResultPreview() {
  state.lastResponse = null;
  state.selectedResultIndex = -1;
  resetPreviewScale();
  updatePreview();
}

function openLightboxFromSource(source) {
  if (!source?.previewUrl || source.previewable === false) {
    return;
  }

  state.lightboxScale = clampScale(source.scale || 1);
  elements.lightboxImage.src = source.previewUrl;
  elements.lightboxImage.alt = source.fileName || APP_NAME;
  elements.lightboxTitle.textContent = source.fileName || "预览图片";
  applyLightboxScale();
  elements.lightbox.hidden = false;
}

function openLightbox() {
  const activeImage = getActivePreviewImage();
  if (!activeImage || !isPreviewableImage(activeImage)) {
    return;
  }

  openLightboxFromSource({
    previewUrl: getImageUrl(activeImage),
    fileName: getImageName(activeImage),
    scale: state.previewScale,
  });
}

function closeLightbox() {
  elements.lightbox.hidden = true;
  elements.lightboxImage.removeAttribute("src");
}

function setReferenceTool(tool) {
  referenceEditor.tool = tool;
  for (const button of elements.referenceToolButtons) {
    button.classList.toggle("is-active", button.dataset.referenceTool === tool);
  }
}

function setReferenceColor(color) {
  referenceEditor.color = color;
  for (const button of elements.referenceColorButtons) {
    button.classList.toggle("is-active", button.dataset.referenceColor === color);
  }
}

function updateReferenceEditorControls() {
  elements.referenceEditorWidthValue.textContent = `${referenceEditor.width}px`;
  elements.referenceEditorUndo.disabled = referenceEditor.history.length <= 1;
  elements.referenceEditorClear.disabled = referenceEditor.history.length <= 1;
}

function resizeReferenceEditorCanvasDisplay() {
  const canvas = elements.referenceEditorCanvas;
  if (!canvas.width || !canvas.height) {
    return;
  }

  const stage = elements.referenceEditorStage;
  const maxWidth = Math.max(stage.clientWidth - 48, 240);
  const maxHeight = Math.max(stage.clientHeight - 48, 240);
  const scale = Math.min(1, maxWidth / canvas.width, maxHeight / canvas.height);
  canvas.style.width = `${Math.round(canvas.width * scale)}px`;
  canvas.style.height = `${Math.round(canvas.height * scale)}px`;
}

function pushReferenceEditorSnapshot() {
  if (!elements.referenceEditorCanvas.width || !elements.referenceEditorCanvas.height) {
    return;
  }

  const snapshot = referenceCanvasContext.getImageData(
    0,
    0,
    elements.referenceEditorCanvas.width,
    elements.referenceEditorCanvas.height
  );

  referenceEditor.history.push(snapshot);
  if (referenceEditor.history.length > MAX_EDITOR_HISTORY) {
    referenceEditor.history.shift();
  }
  updateReferenceEditorControls();
}

function restoreReferenceEditorSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  referenceCanvasContext.putImageData(snapshot, 0, 0);
}

function applyReferenceStrokeStyle() {
  referenceCanvasContext.strokeStyle = referenceEditor.color;
  referenceCanvasContext.fillStyle = referenceEditor.color;
  referenceCanvasContext.lineWidth = referenceEditor.width;
  referenceCanvasContext.lineCap = "round";
  referenceCanvasContext.lineJoin = "round";
}

function drawReferenceRect(startX, startY, endX, endY) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  referenceCanvasContext.strokeRect(x, y, width, height);
}

function drawReferenceCircle(startX, startY, endX, endY) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  referenceCanvasContext.beginPath();
  referenceCanvasContext.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  referenceCanvasContext.stroke();
}

function drawReferenceArrow(startX, startY, endX, endY) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = Math.max(18, referenceEditor.width * 4.2);
  const headWidthAngle = Math.PI / 6;

  referenceCanvasContext.beginPath();
  referenceCanvasContext.moveTo(startX, startY);
  referenceCanvasContext.lineTo(endX, endY);
  referenceCanvasContext.stroke();

  const leftX = endX - headLength * Math.cos(angle - headWidthAngle);
  const leftY = endY - headLength * Math.sin(angle - headWidthAngle);
  const rightX = endX - headLength * Math.cos(angle + headWidthAngle);
  const rightY = endY - headLength * Math.sin(angle + headWidthAngle);

  referenceCanvasContext.beginPath();
  referenceCanvasContext.moveTo(endX, endY);
  referenceCanvasContext.lineTo(leftX, leftY);
  referenceCanvasContext.lineTo(rightX, rightY);
  referenceCanvasContext.closePath();
  referenceCanvasContext.fill();
}

function getReferencePointerPosition(event) {
  const rect = elements.referenceEditorCanvas.getBoundingClientRect();
  const scaleX = elements.referenceEditorCanvas.width / rect.width;
  const scaleY = elements.referenceEditorCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function clearReferenceEditorCanvas() {
  if (referenceEditor.history.length === 0) {
    return;
  }
  restoreReferenceEditorSnapshot(referenceEditor.history[0]);
  referenceEditor.history = [referenceEditor.history[0]];
  updateReferenceEditorControls();
}

function undoReferenceEditor() {
  if (referenceEditor.history.length <= 1) {
    return;
  }
  referenceEditor.history.pop();
  restoreReferenceEditorSnapshot(referenceEditor.history[referenceEditor.history.length - 1]);
  updateReferenceEditorControls();
}

async function openReferenceEditor(index) {
  const filePath = state.referenceImagePaths[index];
  if (!filePath) {
    return;
  }
  await openImageAnnotationEditor({
    sourcePath: filePath,
    title: `编辑参考图 ${index + 1}`,
    mode: "reference",
    index,
    onSave: (result) => {
      state.referenceImagePaths[index] = result.filePath;
      renderReferenceFiles();
      setStatus(`参考图已保存：${result.fileName}`, "success");
    },
  });
}

async function openImageAnnotationEditor({ sourcePath, title = "编辑图片", mode = "image", index = -1, onSave = null } = {}) {
  const filePath = sourcePath;
  if (!filePath) {
    return null;
  }
  const image = await loadImageFromPath(filePath);
  const canvas = elements.referenceEditorCanvas;
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;

  referenceCanvasContext.clearRect(0, 0, canvas.width, canvas.height);
  referenceCanvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);

  referenceEditor.index = index;
  referenceEditor.sourcePath = filePath;
  referenceEditor.mode = mode;
  referenceEditor.onSave = onSave;
  referenceEditor.isDrawing = false;
  referenceEditor.baseSnapshot = null;
  referenceEditor.history = [];
  pushReferenceEditorSnapshot();
  updateReferenceEditorControls();

  elements.referenceEditorTitle.textContent = title;
  elements.referenceEditorMeta.textContent = `${getFileName(filePath)} · ${canvas.width}×${canvas.height}`;
  elements.referenceEditorModal.hidden = false;
  requestAnimationFrame(resizeReferenceEditorCanvasDisplay);
  return true;
}

function closeReferenceEditor() {
  if (typeof referenceEditor.onSave === "function") {
    referenceEditor.onSave(null);
  }
  referenceEditor.index = -1;
  referenceEditor.sourcePath = "";
  referenceEditor.mode = "reference";
  referenceEditor.onSave = null;
  referenceEditor.isDrawing = false;
  referenceEditor.baseSnapshot = null;
  referenceEditor.history = [];
  elements.referenceEditorModal.hidden = true;
  referenceCanvasContext.clearRect(
    0,
    0,
    elements.referenceEditorCanvas.width,
    elements.referenceEditorCanvas.height
  );
  elements.referenceEditorCanvas.width = 0;
  elements.referenceEditorCanvas.height = 0;
}

async function saveReferenceEditor() {
  if (!referenceEditor.sourcePath && referenceEditor.index < 0) {
    return;
  }

  const dataUrl = elements.referenceEditorCanvas.toDataURL("image/png");
  elements.referenceEditorSave.disabled = true;

  try {
    const result = await window.desktopApi.saveEditedReferenceImage({
      sourcePath: referenceEditor.sourcePath || state.referenceImagePaths[referenceEditor.index],
      dataUrl,
      outputDir: elements.outputDir.value.trim(),
    });

    if (typeof referenceEditor.onSave === "function") {
      const onSave = referenceEditor.onSave;
      referenceEditor.onSave = null;
      onSave(result);
    } else if (referenceEditor.index >= 0) {
      state.referenceImagePaths[referenceEditor.index] = result.filePath;
      renderReferenceFiles();
      setStatus(`参考图已保存：${result.fileName}`, "success");
    }
    closeReferenceEditor();
    return result;
  } finally {
    elements.referenceEditorSave.disabled = false;
  }
}

function handleReferencePointerDown(event) {
  if (elements.referenceEditorModal.hidden || event.button !== 0) {
    return;
  }

  const { x, y } = getReferencePointerPosition(event);
  referenceEditor.isDrawing = true;
  referenceEditor.startX = x;
  referenceEditor.startY = y;
  referenceEditor.baseSnapshot = null;

  applyReferenceStrokeStyle();
  elements.referenceEditorCanvas.setPointerCapture(event.pointerId);

  if (referenceEditor.tool === "brush") {
    referenceCanvasContext.beginPath();
    referenceCanvasContext.moveTo(x, y);
    referenceCanvasContext.lineTo(x, y);
    referenceCanvasContext.stroke();
    return;
  }

  referenceEditor.baseSnapshot = referenceCanvasContext.getImageData(
    0,
    0,
    elements.referenceEditorCanvas.width,
    elements.referenceEditorCanvas.height
  );
}

function handleReferencePointerMove(event) {
  if (!referenceEditor.isDrawing) {
    return;
  }

  const { x, y } = getReferencePointerPosition(event);
  applyReferenceStrokeStyle();

  if (referenceEditor.tool === "brush") {
    referenceCanvasContext.lineTo(x, y);
    referenceCanvasContext.stroke();
    return;
  }

  restoreReferenceEditorSnapshot(referenceEditor.baseSnapshot);

  if (referenceEditor.tool === "rect") {
    drawReferenceRect(referenceEditor.startX, referenceEditor.startY, x, y);
    return;
  }

  if (referenceEditor.tool === "circle") {
    drawReferenceCircle(referenceEditor.startX, referenceEditor.startY, x, y);
    return;
  }

  if (referenceEditor.tool === "arrow") {
    drawReferenceArrow(referenceEditor.startX, referenceEditor.startY, x, y);
  }
}

function finishReferenceDrawing(event) {
  if (!referenceEditor.isDrawing) {
    return;
  }

  referenceEditor.isDrawing = false;
  if (elements.referenceEditorCanvas.hasPointerCapture(event.pointerId)) {
    elements.referenceEditorCanvas.releasePointerCapture(event.pointerId);
  }

  if (referenceEditor.tool !== "brush") {
    const { x, y } = getReferencePointerPosition(event);
    restoreReferenceEditorSnapshot(referenceEditor.baseSnapshot);
    applyReferenceStrokeStyle();

    if (referenceEditor.tool === "rect") {
      drawReferenceRect(referenceEditor.startX, referenceEditor.startY, x, y);
    }

    if (referenceEditor.tool === "circle") {
      drawReferenceCircle(referenceEditor.startX, referenceEditor.startY, x, y);
    }

    if (referenceEditor.tool === "arrow") {
      drawReferenceArrow(referenceEditor.startX, referenceEditor.startY, x, y);
    }
  }

  referenceEditor.baseSnapshot = null;
  pushReferenceEditorSnapshot();
}

async function initialize() {
  const config = await window.desktopApi.loadConfig();
  historyItems = await window.desktopApi.loadHistory();
  fillConfig(config);

  if (!elements.outputDir.value) {
    elements.outputDir.value = await window.desktopApi.getDefaultOutputDir();
  }

  elements.prompt.value = DEFAULT_PROMPT;
  updatePromptPreview();
  setPromptVisibility(false);
  setResponseVisibility(false);
  setSizePanelVisibility(false);
  setParamPanelVisibility(false);
  setReferenceTool(referenceEditor.tool);
  setReferenceColor(referenceEditor.color);
  initializePromptBuilder();
  initializeCanvasAndInspector();
  hydrateSizeButtons();
  if (elements.count) {
    elements.count.max = String(MAX_GENERATION_COUNT);
  }
  elements.referenceEditorWidth.value = String(referenceEditor.width);
  updateReferenceEditorControls();
  hydrateModelOptions();
  setWorkspace(state.activeWorkspace);
  setModeIndicator();
  syncSizeButtons();
  renderReferenceFiles();
  renderResults();
  updatePreview();
  setReferencePromptGenerating(false);
  setStatus("准备开始创作", "idle");
  setGenerating(false);
}

elements.prompt.addEventListener("input", updatePromptPreview);

document.addEventListener("paste", (event) => {
  handleReferencePaste(event).catch((error) => {
    setStatus(getFriendlyErrorMessage(error, "粘贴参考图失败"), "error");
  });
});

for (const button of elements.workspaceTabs) {
  button.addEventListener("click", () => {
    setWorkspace(button.dataset.workspaceTab);
  });
}

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.saveSettings.disabled = true;
  try {
    await saveSettings();
  } catch (error) {
    setStatus(getFriendlyErrorMessage(error, "保存设置失败"), "error");
  } finally {
    elements.saveSettings.disabled = false;
  }
});

elements.pickOutputDir.addEventListener("click", async () => {
  const selectedPath = await window.desktopApi.pickOutputDir();
  if (selectedPath) {
    elements.outputDir.value = selectedPath;
  }
});

elements.openOutputDir.addEventListener("click", async () => {
  const target = elements.outputDir.value.trim();
  if (target) {
    await window.desktopApi.openPath(target);
  }
});

if (elements.refreshModelsButton) {
  elements.refreshModelsButton.addEventListener("click", () => {
    refreshModelOptions("image");
  });
}

if (elements.modelSelect) {
  elements.modelSelect.addEventListener("change", () => {
    if (elements.modelSelect.value) {
      elements.model.value = elements.modelSelect.value;
    }
  });
}

if (elements.model) {
  elements.model.addEventListener("input", syncModelSelectValues);
}

if (elements.refreshReferenceModelsButton) {
  elements.refreshReferenceModelsButton.addEventListener("click", () => {
    refreshModelOptions("reference");
  });
}

if (elements.referencePromptModelSelect) {
  elements.referencePromptModelSelect.addEventListener("change", () => {
    if (elements.referencePromptModelSelect.value) {
      elements.referencePromptModel.value = elements.referencePromptModelSelect.value;
    }
  });
}

if (elements.referencePromptModel) {
  elements.referencePromptModel.addEventListener("input", syncModelSelectValues);
}

elements.togglePromptVisibility.addEventListener("click", () => {
  setPromptVisibility(!state.isPromptVisible);
});

elements.openPromptLibrary.addEventListener("click", openPromptLibrary);

if (elements.openPromptLibrarySecondary) {
  elements.openPromptLibrarySecondary.addEventListener("click", () => {
    setWorkspace("ideas");
    openPromptLibrary();
  });
}

if (elements.openPromptLibraryMain) {
  elements.openPromptLibraryMain.addEventListener("click", () => {
    setWorkspace("ideas");
    openPromptLibrary();
  });
}

for (const button of document.querySelectorAll("[data-inspiration-cover]")) {
  button.addEventListener("click", () => {
    openPromptCoverFromId(button.dataset.inspirationCover);
  });
}

for (const button of document.querySelectorAll("[data-inspiration-category]")) {
  button.addEventListener("click", () => {
    openPromptLibraryCategory(button.dataset.inspirationCategory);
  });
}

elements.promptLibraryClose.addEventListener("click", closePromptLibrary);

elements.promptLibraryModal.addEventListener("click", (event) => {
  if (event.target === elements.promptLibraryModal || event.target.classList.contains("lightbox-backdrop")) {
    closePromptLibrary();
  }
});

elements.promptLibraryTabLibrary.addEventListener("click", () => {
  setPromptLibraryTab("library");
});

elements.promptLibraryTabBuilder.addEventListener("click", () => {
  setPromptLibraryTab("builder");
});

elements.promptLibrarySearch.addEventListener("input", () => {
  promptLibrary.search = elements.promptLibrarySearch.value;
  renderPromptCards();
});

for (const element of [
  elements.builderSubject,
  elements.builderScene,
  elements.builderStyle,
  elements.builderLighting,
  elements.builderComposition,
  elements.builderDetail,
]) {
  element.addEventListener("input", updateBuilderOutput);
  element.addEventListener("change", updateBuilderOutput);
}

elements.builderRandomize.addEventListener("click", randomizeBuilder);

elements.builderAppend.addEventListener("click", () => {
  setPromptValue(elements.builderOutput.value, "append");
  closePromptLibrary();
  setWorkspace("generate");
  setStatus("已追加自己选的词", "success");
});

elements.builderUse.addEventListener("click", () => {
  setPromptValue(elements.builderOutput.value, "replace");
  closePromptLibrary();
  setWorkspace("generate");
  setStatus("已填入自己选的词", "success");
});

if (elements.toggleResponseVisibility) {
  elements.toggleResponseVisibility.addEventListener("click", () => {
    setWorkspace("generate");
    setResponseVisibility(!state.isResponseVisible);
  });
}

elements.toggleSizePanel.addEventListener("click", () => {
  setSizePanelVisibility(!state.isSizePanelVisible);
});

elements.toggleParamPanel.addEventListener("click", () => {
  setParamPanelVisibility(!state.isParamPanelVisible);
});

for (const button of elements.sizeButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.size === "custom") {
      applyCustomSizeFromInputs();
      return;
    }
    state.size = button.dataset.size;
    syncSizeButtons();
  });
}

if (elements.applyCustomSize) {
  elements.applyCustomSize.addEventListener("click", applyCustomSizeFromInputs);
}

if (elements.count) {
  elements.count.addEventListener("change", () => {
    elements.count.value = String(getGenerationCount());
    updateGenerationControls();
  });
  elements.count.addEventListener("blur", () => {
    elements.count.value = String(getGenerationCount());
    updateGenerationControls();
  });
}

elements.pickReferenceImages.addEventListener("click", async () => {
  const filePaths = await window.desktopApi.pickReferenceImages();
  addReferenceImages(filePaths, "选择");
});

if (elements.generateReferencePrompt) {
  elements.generateReferencePrompt.addEventListener("click", async () => {
    try {
      await handleGenerateReferencePrompt();
    } catch (error) {
      const errorMessage = getFriendlyErrorMessage(error, "参考图生成词失败");
      showResponseDetail({
        success: false,
        source: "reference:generatePrompt",
        error: errorMessage,
        raw: String(error?.stack || error?.message || error || ""),
      });
      setStatus("参考图生成词失败，详情见接口响应", "error");
      setReferencePromptGenerating(false);
    }
  });
}

for (const eventName of ["dragenter", "dragover"]) {
  elements.referenceDropZone.addEventListener(eventName, (event) => {
    preventReferenceDragDefaults(event);
    event.dataTransfer.dropEffect = "copy";
    setReferenceDragActive(true);
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.referenceDropZone.addEventListener(eventName, (event) => {
    preventReferenceDragDefaults(event);
    if (eventName === "dragleave" && elements.referenceDropZone.contains(event.relatedTarget)) {
      return;
    }
    setReferenceDragActive(false);
  });
}

elements.referenceDropZone.addEventListener("drop", (event) => {
  addReferenceImages(getDroppedReferencePaths(event.dataTransfer), "拖拽");
});

elements.clearReferenceImages.addEventListener("click", () => {
  state.referenceImagePaths = [];
  renderReferenceFiles();
  setModeIndicator();
  closeReferenceEditor();
  setStatus("参考图已清空", "idle");
});

async function runGeneration(overrides = {}) {
  if (state.isGeneratingReferencePrompt) {
    return;
  }
  if (state.isGenerationPaused) {
    setStatus("已暂停，点击右侧继续后再生图", "idle");
    updateGenerationControls();
    return;
  }

  const generationLimit = getGenerationCount();
  const activeCount = getActiveGenerationCount();
  if (activeCount >= generationLimit) {
    setStatus(`当前已有 ${activeCount}/${generationLimit} 个生图任务在进行`, "idle");
    updateGenerationControls();
    return;
  }

  const input = buildGenerationInput(overrides);
  const requestedCount = 1;
  input.count = requestedCount;
  const referenceCount = Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths.length : 0;
  const taskId = `generation-${Date.now()}-${++state.generationTaskSeq}`;
  const wasIdle = activeCount === 0;
  let generatedCount = 0;

  try {
    if (wasIdle) {
      clearCurrentResultPreview();
      state.selectedImageIndex = historyItems.length > 0 ? 0 : -1;
    }
    state.activeGenerationTasks.add(taskId);
    state.generationTaskStartedAt.set(taskId, Date.now());
    updateGenerationControls();
    elements.responseJson.textContent = `已并发发送 ${activeCount + 1}/${generationLimit} 个生图任务...`;

    setStatus(
      referenceCount > 0
        ? `参考图生图任务已启动 · 进行中 ${activeCount + 1}/${generationLimit}`
        : `直接生图任务已启动 · 进行中 ${activeCount + 1}/${generationLimit}`,
      "loading"
    );

    const response = await requestGenerationWithTimeout(input);
    if (response?.payload && Array.isArray(input.referenceImagePaths)) {
      response.payload.referenceImagePaths = [...input.referenceImagePaths];
    }
    const existingImages = Array.isArray(state.lastResponse?.images) ? state.lastResponse.images : [];
    const responseImages = Array.isArray(response.images) ? response.images : [];
    generatedCount = responseImages.length;
    state.lastResponse = {
      ...response,
      images: [...responseImages, ...existingImages].slice(0, MAX_GENERATION_COUNT),
    };
    state.selectedResultIndex = responseImages.length > 0 ? 0 : state.selectedResultIndex;
    historyItems = Array.isArray(response.history) ? response.history : historyItems;
    state.selectedImageIndex = historyItems.length > 0 ? 0 : state.selectedImageIndex;
    renderResults();
    updatePreview();
    elements.responseJson.textContent = JSON.stringify(
      {
        taskId,
        mode: referenceCount > 0 ? "reference" : "text",
        images: responseImages.length,
        upstream: response.upstream,
      },
      null,
      2
    );
    setStatus(
      `已返回 ${responseImages.length} 张图片，剩余 ${Math.max(0, getActiveGenerationCount() - 1)} 个任务`,
      "success"
    );
    return response;
  } catch (error) {
    const errorMessage = getFriendlyErrorMessage(error, "生成失败");
    elements.responseJson.textContent = JSON.stringify(
      { success: false, error: errorMessage },
      null,
      2
    );
    renderResults();
    setStatus(errorMessage, "error");
  } finally {
    state.activeGenerationTasks.delete(taskId);
    state.generationTaskStartedAt.delete(taskId);
    const remainingCount = getActiveGenerationCount();
    updateGenerationControls();
    if (remainingCount === 0) {
      updatePreview();
      if (!state.isGenerationPaused && generatedCount > 0) {
        setStatus(`本轮并发生图已完成，已返回 ${state.lastResponse?.images?.length || generatedCount} 张`, "success");
      }
    }
  }
}

elements.generateButton.addEventListener("click", () => {
  runGeneration();
});

if (elements.pauseGenerationButton) {
  elements.pauseGenerationButton.addEventListener("click", () => {
    state.isGenerationPaused = !state.isGenerationPaused;
    updateGenerationControls();
    if (state.isGenerationPaused) {
      setStatus("已暂停新增任务，正在生成的图片会继续返回", "idle");
    } else {
      const activeCount = getActiveGenerationCount();
      setStatus(activeCount > 0 ? `已继续，可继续生图 · 进行中 ${activeCount}/${getGenerationCount()}` : "已继续，可以开始生图", "idle");
    }
  });
}

elements.previewStage.addEventListener("click", () => {
  if (!elements.previewStage.classList.contains("is-empty")) {
    openLightbox();
  }
});

elements.previewImage.addEventListener("dragstart", (event) => {
  const activeImage = getActivePreviewImage();
  if (!activeImage?.filePath) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-xiaolan-reference-path", activeImage.filePath);
  event.dataTransfer.setData("text/plain", activeImage.filePath);
});

if (elements.usePreviewAsReferenceButton) {
  elements.usePreviewAsReferenceButton.addEventListener("click", () => {
    addImageToReference(getActivePreviewImage(), "预览图");
  });
}

if (elements.sendPreviewToCanvasButton) {
  elements.sendPreviewToCanvasButton.addEventListener("click", () => {
    addImageToCanvas(getActivePreviewImage());
  });
}

if (elements.previewPrevButton) {
  elements.previewPrevButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pagePreview(-1);
  });
}

if (elements.previewNextButton) {
  elements.previewNextButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pagePreview(1);
  });
}

elements.openImageButton.addEventListener("click", async () => {
  const activeImage = getActivePreviewImage();
  if (activeImage?.filePath) {
    await window.desktopApi.openPath(activeImage.filePath);
  }
});

elements.showImageFolderButton.addEventListener("click", async () => {
  const activeImage = getActivePreviewImage();
  if (activeImage?.filePath) {
    await window.desktopApi.showItemInFolder(activeImage.filePath);
  }
});

elements.clearHistoryButton.addEventListener("click", async () => {
  historyItems = await window.desktopApi.clearHistory();
  state.lastResponse = null;
  state.selectedImageIndex = -1;
  state.selectedHistoryIds = new Set();
  renderResults();
  setStatus("历史记录已清空", "idle");
});

if (elements.deleteSelectedHistoryButton) {
  elements.deleteSelectedHistoryButton.addEventListener("click", () => {
    deleteHistorySelection({ deleteLocalFiles: false });
  });
}

if (elements.deleteSelectedLocalButton) {
  elements.deleteSelectedLocalButton.addEventListener("click", () => {
    deleteHistorySelection({ deleteLocalFiles: true });
  });
}

if (elements.historyContextMenu) {
  elements.historyContextMenu.addEventListener("click", (event) => {
    const action = event.target?.dataset?.historyMenuAction;
    if (!action) {
      return;
    }
    const ids = state.contextHistoryId ? [state.contextHistoryId] : getSelectedHistoryIds();
    deleteHistorySelection({ deleteLocalFiles: action === "local", ids });
  });

  window.addEventListener("click", hideHistoryContextMenu);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideHistoryContextMenu();
    }
  });
}

elements.zoomInButton.addEventListener("click", () => {
  state.previewScale = clampScale(state.previewScale + 0.15);
  applyPreviewScale();
});

elements.zoomOutButton.addEventListener("click", () => {
  state.previewScale = clampScale(state.previewScale - 0.15);
  applyPreviewScale();
});

elements.resetZoomButton.addEventListener("click", resetPreviewScale);

elements.lightboxZoomIn.addEventListener("click", () => {
  state.lightboxScale = clampScale(state.lightboxScale + 0.15);
  applyLightboxScale();
});

elements.lightboxZoomOut.addEventListener("click", () => {
  state.lightboxScale = clampScale(state.lightboxScale - 0.15);
  applyLightboxScale();
});

elements.lightboxReset.addEventListener("click", () => {
  state.lightboxScale = 1;
  applyLightboxScale();
});

elements.lightboxClose.addEventListener("click", closeLightbox);

elements.lightbox.addEventListener("click", (event) => {
  if (event.target === elements.lightbox || event.target.classList.contains("lightbox-backdrop")) {
    closeLightbox();
  }
});

for (const button of elements.referenceToolButtons) {
  button.addEventListener("click", () => {
    setReferenceTool(button.dataset.referenceTool);
  });
}

for (const button of elements.referenceColorButtons) {
  button.addEventListener("click", () => {
    setReferenceColor(button.dataset.referenceColor);
  });
}

elements.referenceEditorWidth.addEventListener("input", () => {
  referenceEditor.width = Number(elements.referenceEditorWidth.value || 6);
  updateReferenceEditorControls();
});

elements.referenceEditorUndo.addEventListener("click", undoReferenceEditor);
elements.referenceEditorClear.addEventListener("click", clearReferenceEditorCanvas);

elements.referenceEditorSave.addEventListener("click", async () => {
  try {
    await saveReferenceEditor();
  } catch (error) {
    setStatus(getFriendlyErrorMessage(error, "参考图保存失败"), "error");
  }
});

elements.referenceEditorClose.addEventListener("click", closeReferenceEditor);

elements.referenceEditorModal.addEventListener("click", (event) => {
  if (
    event.target === elements.referenceEditorModal ||
    event.target.classList.contains("lightbox-backdrop")
  ) {
    closeReferenceEditor();
  }
});

elements.referenceEditorCanvas.addEventListener("pointerdown", handleReferencePointerDown);
elements.referenceEditorCanvas.addEventListener("pointermove", handleReferencePointerMove);
elements.referenceEditorCanvas.addEventListener("pointerup", finishReferenceDrawing);
elements.referenceEditorCanvas.addEventListener("pointercancel", finishReferenceDrawing);

window.addEventListener("resize", () => {
  resizeReferenceEditorCanvasDisplay();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.referenceEditorModal.hidden) {
    closeReferenceEditor();
    return;
  }

  if (!elements.promptLibraryModal.hidden) {
    closePromptLibrary();
    return;
  }

  if (!elements.lightbox.hidden) {
    closeLightbox();
  }
});

initialize().catch((error) => {
  setStatus(getFriendlyErrorMessage(error, "初始化失败"), "error");
});
