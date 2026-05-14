const { DEFAULT_UPDATE_CHANNEL } = require("./app-storage");

function loadElectronUpdater() {
  try {
    return require("electron-updater").autoUpdater;
  } catch (error) {
    return null;
  }
}

function createAutoUpdaterController({
  app,
  loadConfig,
  sendState,
  autoUpdater = loadElectronUpdater(),
  defaultChannel = DEFAULT_UPDATE_CHANNEL,
}) {
  let state = {
    configured: false,
    checking: false,
    downloading: false,
    updateAvailable: false,
    updateDownloaded: false,
    version: app?.getVersion?.() || "0.0.0",
    channel: defaultChannel,
    feedUrl: "",
    downloadedVersion: "",
    availableVersion: "",
    message: "未配置更新地址",
    error: "",
  };

  function notify() {
    if (typeof sendState === "function") {
      sendState(state);
    }
  }

  function getState() {
    return state;
  }

  function setState(patch) {
    state = {
      ...state,
      ...patch,
    };
    notify();
  }

  function getFeedUrl(config) {
    return String(config?.updateFeedUrl || "").trim();
  }

  function configure(config) {
    if (!autoUpdater) {
      setState({
        configured: false,
        checking: false,
        downloading: false,
        message: "在线升级组件不可用",
        error: "",
      });
      return false;
    }

    const feedUrl = getFeedUrl(config);
    const channel = String(config?.updateChannel || defaultChannel).trim() || defaultChannel;
    const enabled = config?.autoUpdateEnabled !== false;

    if (!feedUrl || !enabled || !app.isPackaged) {
      setState({
        configured: false,
        channel,
        feedUrl,
        checking: false,
        downloading: false,
        updateAvailable: false,
        updateDownloaded: false,
        availableVersion: "",
        downloadedVersion: "",
        message: !app.isPackaged
          ? "开发模式下不执行在线升级"
          : feedUrl
            ? "在线升级已关闭"
            : "未配置更新地址",
        error: "",
      });
      return false;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl,
      channel,
    });

    setState({
      configured: true,
      channel,
      feedUrl,
      message: "已配置在线升级",
      error: "",
    });
    return true;
  }

  async function check(manual = false) {
    const config = await loadConfig();
    const canCheck = configure(config);

    if (!canCheck) {
      return state;
    }

    if (state.checking || state.downloading) {
      return state;
    }

    setState({
      checking: true,
      error: "",
      message: manual ? "正在检查新版本" : "启动后自动检查更新",
    });

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      setState({
        checking: false,
        message: "检查更新失败",
        error: error.message || "未知错误",
      });
    }

    return state;
  }

  async function download() {
    if (!state.configured) {
      return state;
    }

    if (state.downloading || state.updateDownloaded) {
      return state;
    }

    setState({
      downloading: true,
      error: "",
      message: "正在下载更新",
    });

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      setState({
        downloading: false,
        message: "下载更新失败",
        error: error.message || "未知错误",
      });
    }

    return state;
  }

  function install() {
    if (!state.updateDownloaded || !autoUpdater) {
      return false;
    }
    autoUpdater.quitAndInstall();
    return true;
  }

  function registerEvents() {
    if (!autoUpdater) {
      return;
    }

    autoUpdater.on("checking-for-update", () => {
      setState({
        checking: true,
        error: "",
        message: "正在检查新版本",
      });
    });

    autoUpdater.on("update-available", (info) => {
      setState({
        checking: false,
        updateAvailable: true,
        updateDownloaded: false,
        availableVersion: String(info?.version || ""),
        downloadedVersion: "",
        message: info?.version ? `发现新版本 ${info.version}` : "发现新版本",
        error: "",
      });
    });

    autoUpdater.on("update-not-available", () => {
      setState({
        checking: false,
        downloading: false,
        updateAvailable: false,
        updateDownloaded: false,
        availableVersion: "",
        downloadedVersion: "",
        message: "当前已经是最新版本",
        error: "",
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Number.isFinite(progress?.percent) ? Math.round(progress.percent) : 0;
      setState({
        downloading: true,
        message: `正在下载更新 ${percent}%`,
        error: "",
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      setState({
        checking: false,
        downloading: false,
        updateAvailable: true,
        updateDownloaded: true,
        downloadedVersion: String(info?.version || ""),
        availableVersion: String(info?.version || state.availableVersion || ""),
        message: info?.version
          ? `新版本 ${info.version} 已下载，重启后安装`
          : "新版本已下载，重启后安装",
        error: "",
      });
    });

    autoUpdater.on("error", (error) => {
      setState({
        checking: false,
        downloading: false,
        message: "在线升级出现问题",
        error: error?.message || "未知错误",
      });
    });
  }

  registerEvents();

  return {
    check,
    configure,
    download,
    getState,
    install,
    notify,
  };
}

module.exports = {
  createAutoUpdaterController,
  loadElectronUpdater,
};
