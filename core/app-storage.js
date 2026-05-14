const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_QUALITY,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_SIZE,
  normalizeOutputFormat,
  normalizeQuality,
} = require("./generation");
const { normalizeBaseUrl, normalizeOptionalBaseUrl } = require("./endpoints");
const {
  DEFAULT_VISION_PROMPT_MODEL,
  normalizeVisionPromptModel,
} = require("../tools/reference-prompt");

const DEFAULT_AUTO_UPDATE_ENABLED = false;
const DEFAULT_UPDATE_CHANNEL = "latest";
const HISTORY_LIMIT = 80;

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function createAppStorage({ app, appName }) {
  function getDefaultOutputDir() {
    const picturesPath = app?.getPath?.("pictures") || path.join(__dirname, "..", "dist");
    return path.join(picturesPath, appName);
  }

  function getUserDataPath() {
    return app?.getPath?.("userData") || path.join(__dirname, "..", "dist", "test-user-data");
  }

  function getConfigPath() {
    return path.join(getUserDataPath(), "config.json");
  }

  function getHistoryPath() {
    return path.join(getUserDataPath(), "history.json");
  }

  function defaultConfig() {
    return {
      baseUrl: DEFAULT_BASE_URL,
      apiKey: "",
      model: DEFAULT_MODEL,
      quality: DEFAULT_QUALITY,
      outputFormat: DEFAULT_OUTPUT_FORMAT,
      outputDir: getDefaultOutputDir(),
      autoUpdateEnabled: DEFAULT_AUTO_UPDATE_ENABLED,
      updateChannel: DEFAULT_UPDATE_CHANNEL,
      updateFeedUrl: "",
      referencePromptModel: DEFAULT_VISION_PROMPT_MODEL,
      referencePromptApiKey: "",
      referencePromptBaseUrl: "",
    };
  }

  function normalizeConfig(rawConfig = {}) {
    const config = {
      ...defaultConfig(),
      ...rawConfig,
    };

    return {
      baseUrl: normalizeBaseUrl(config.baseUrl),
      apiKey: String(config.apiKey || "").trim(),
      model: String(config.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      quality: normalizeQuality(config.quality),
      outputFormat: normalizeOutputFormat(config.outputFormat),
      outputDir: String(config.outputDir || getDefaultOutputDir()).trim() || getDefaultOutputDir(),
      autoUpdateEnabled: config.autoUpdateEnabled === true,
      updateChannel: String(config.updateChannel || DEFAULT_UPDATE_CHANNEL).trim() || DEFAULT_UPDATE_CHANNEL,
      updateFeedUrl: String(config.updateFeedUrl || "").trim(),
      referencePromptModel: normalizeVisionPromptModel(
        config.referencePromptModel || DEFAULT_VISION_PROMPT_MODEL
      ),
      referencePromptApiKey: String(config.referencePromptApiKey || "").trim(),
      referencePromptBaseUrl: normalizeOptionalBaseUrl(config.referencePromptBaseUrl),
    };
  }

  async function loadConfig() {
    try {
      const raw = await fs.readFile(getConfigPath(), "utf8");
      return normalizeConfig(JSON.parse(raw));
    } catch (error) {
      const config = defaultConfig();
      await saveConfig(config);
      return config;
    }
  }

  async function saveConfig(config) {
    const normalized = normalizeConfig(config);
    await ensureDirectory(path.dirname(getConfigPath()));
    await fs.writeFile(getConfigPath(), JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  function normalizeHistoryItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const createdAt = String(item.createdAt || "").trim();
    const prompt = String(item.prompt || "").trim();
    const mode = item.mode === "image" ? "image" : "text";
    const image = item.image && typeof item.image === "object" ? item.image : null;
    const referenceImagePaths = Array.isArray(item.referenceImagePaths)
      ? item.referenceImagePaths.map((filePath) => String(filePath || "").trim()).filter(Boolean)
      : [];

    if (!createdAt || !prompt || !image?.filePath || !image?.fileName) {
      return null;
    }

    return {
      id: String(item.id || `${createdAt}-${image.fileName}`),
      createdAt,
      prompt,
      mode,
      size: String(item.size || DEFAULT_SIZE),
      outputFormat: String(item.outputFormat || DEFAULT_OUTPUT_FORMAT),
      quality: String(item.quality || DEFAULT_QUALITY),
      referenceImagePaths,
      image: {
        fileName: String(image.fileName),
        filePath: String(image.filePath),
        previewUrl: pathToFileURL(String(image.filePath)).toString(),
        mimeType: String(image.mimeType || "application/octet-stream"),
      },
    };
  }

  async function loadHistory() {
    try {
      const raw = await fs.readFile(getHistoryPath(), "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map(normalizeHistoryItem).filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  async function saveHistory(history) {
    await ensureDirectory(path.dirname(getHistoryPath()));
    await fs.writeFile(getHistoryPath(), JSON.stringify(history, null, 2), "utf8");
  }

  let historyMutationQueue = Promise.resolve();

  function withHistoryMutation(operation) {
    const nextMutation = historyMutationQueue.then(operation, operation);
    historyMutationQueue = nextMutation.catch(() => {});
    return nextMutation;
  }

  async function appendHistoryEntries(entries) {
    return withHistoryMutation(async () => {
      if (!Array.isArray(entries) || entries.length === 0) {
        return loadHistory();
      }

      const existing = await loadHistory();
      const normalizedIncoming = entries.map(normalizeHistoryItem).filter(Boolean);
      const merged = [...normalizedIncoming, ...existing].slice(0, HISTORY_LIMIT);
      await saveHistory(merged);
      return merged;
    });
  }

  async function clearHistory() {
    return withHistoryMutation(async () => {
      await saveHistory([]);
      return [];
    });
  }

  async function deleteHistoryItems(ids, options = {}) {
    return withHistoryMutation(async () => {
      const idSet = new Set(
        (Array.isArray(ids) ? ids : [ids])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      );
      if (idSet.size === 0) {
        return loadHistory();
      }

      const existing = await loadHistory();
      const removed = existing.filter((item) => idSet.has(item.id));
      const nextHistory = existing.filter((item) => !idSet.has(item.id));

      if (options.deleteLocalFiles === true) {
        const filePaths = new Set(
          removed
            .map((item) => String(item?.image?.filePath || "").trim())
            .filter(Boolean)
        );
        for (const filePath of filePaths) {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            if (error?.code !== "ENOENT") {
              // Keep the history deletion non-blocking even if one local file is locked.
            }
          }
        }
      }

      await saveHistory(nextHistory);
      return nextHistory;
    });
  }

  return {
    getDefaultOutputDir,
    getConfigPath,
    getHistoryPath,
    defaultConfig,
    normalizeConfig,
    loadConfig,
    saveConfig,
    normalizeHistoryItem,
    loadHistory,
    saveHistory,
    appendHistoryEntries,
    clearHistory,
    deleteHistoryItems,
  };
}

module.exports = {
  DEFAULT_AUTO_UPDATE_ENABLED,
  DEFAULT_UPDATE_CHANNEL,
  HISTORY_LIMIT,
  ensureDirectory,
  createAppStorage,
};
