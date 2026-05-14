const { contextBridge, ipcRenderer, webUtils } = require("electron");

function getPathForFile(file) {
  try {
    return webUtils.getPathForFile(file);
  } catch (error) {
    return file?.path || "";
  }
}

contextBridge.exposeInMainWorld("desktopApi", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  getDefaultOutputDir: () => ipcRenderer.invoke("config:defaultOutputDir"),
  listModels: (input) => ipcRenderer.invoke("models:list", input),
  loadHistory: () => ipcRenderer.invoke("history:load"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  deleteHistoryItems: (input) => ipcRenderer.invoke("history:delete", input),
  getUpdaterState: () => ipcRenderer.invoke("updater:getState"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  onUpdaterState: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const handler = (_, state) => callback(state);
    ipcRenderer.on("updater:state", handler);
    return () => ipcRenderer.removeListener("updater:state", handler);
  },
  pickOutputDir: () => ipcRenderer.invoke("dialog:pickOutputDir"),
  pickReferenceImages: () => ipcRenderer.invoke("dialog:pickReferenceImages"),
  getPathForFile,
  saveEditedReferenceImage: (input) => ipcRenderer.invoke("reference:saveEditedImage", input),
  generatePromptFromReferenceImages: (input) => ipcRenderer.invoke("reference:generatePrompt", input),
  saveClipboardImageAsReference: (input) => ipcRenderer.invoke("reference:saveClipboardImage", input),
  generateImages: (input) => ipcRenderer.invoke("image:generate", input),
  copyImageToClipboard: (filePath) => ipcRenderer.invoke("image:copyToClipboard", filePath),
  saveImageAs: (input) => ipcRenderer.invoke("image:saveAs", input),
  openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke("shell:showItemInFolder", targetPath),
});
