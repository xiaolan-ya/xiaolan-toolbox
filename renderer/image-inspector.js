(function () {
  function formatDate(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function getModeLabel(item) {
    return item?.mode === "image" ? "参考图生成" : "直接生成";
  }

  function createImageInspector(options = {}) {
    const elements = options.elements || {};
    const getPromptValue = options.getPromptValue || (() => "");
    const setPromptValue = options.setPromptValue || (() => {});
    const setStatus = options.setStatus || (() => {});
    const addReferenceImages = options.addReferenceImages || (() => {});
    const onEdit = options.onEdit || (() => {});
    const onRegenerate = options.onRegenerate || (() => {});
    const onSendToCanvas = options.onSendToCanvas || (() => {});

    let currentItem = null;
    let currentImage = null;

    function setText(element, text) {
      if (element) {
        element.textContent = text || "";
      }
    }

    function setDisabled(disabled) {
      for (const button of [
        elements.copyPromptButton,
        elements.fillPromptButton,
        elements.regenerateButton,
        elements.addReferenceButton,
        elements.sendCanvasButton,
      ]) {
        if (button) {
          button.disabled = disabled;
        }
      }
    }

    function render(item, image) {
      currentItem = item || null;
      currentImage = image || item?.image || null;

      if (!currentItem || !currentImage) {
        elements.panel?.classList.add("is-empty");
        setText(elements.promptText, "选中一张生成图后，这里会显示当时使用的提示词和参数。");
        setText(elements.metaText, "暂无图片");
        setText(elements.fileText, "");
        setDisabled(true);
        return;
      }

      const prompt = String(currentItem.prompt || getPromptValue() || "").trim();
      const meta = [
        getModeLabel(currentItem),
        currentItem.size || "",
        currentItem.quality || "",
        currentItem.outputFormat || "",
        formatDate(currentItem.createdAt),
      ].filter(Boolean);

      elements.panel?.classList.remove("is-empty");
      setText(elements.promptText, prompt || "没有记录到生成词。");
      setText(elements.metaText, meta.join(" · "));
      setText(elements.fileText, currentImage.filePath || currentImage.fileName || "");
      setDisabled(false);
    }

    async function copyPrompt() {
      const prompt = String(currentItem?.prompt || "").trim();
      if (!prompt) {
        setStatus("当前图片没有可复制的生成词", "error");
        return;
      }
      await navigator.clipboard.writeText(prompt);
      setStatus("已复制生成词", "success");
    }

    function fillPrompt() {
      if (!currentItem || !currentImage) {
        setStatus("当前没有可编辑的图片", "error");
        return;
      }
      onEdit(currentItem, currentImage);
    }

    function addAsReference() {
      if (!currentImage?.filePath) {
        setStatus("当前图片不能加入参考图", "error");
        return;
      }
      addReferenceImages([currentImage.filePath], "生成图");
    }

    function sendToCanvas() {
      if (!currentImage?.filePath) {
        setStatus("当前图片不能放入画布", "error");
        return;
      }
      onSendToCanvas(currentItem, currentImage);
    }

    elements.copyPromptButton?.addEventListener("click", () => {
      copyPrompt().catch((error) => setStatus(error?.message || "复制失败", "error"));
    });
    elements.fillPromptButton?.addEventListener("click", fillPrompt);
    elements.regenerateButton?.addEventListener("click", () => onRegenerate(currentItem, currentImage));
    elements.addReferenceButton?.addEventListener("click", addAsReference);
    elements.sendCanvasButton?.addEventListener("click", sendToCanvas);

    render(null, null);

    return {
      render,
    };
  }

  window.XiaolanImageInspector = {
    createImageInspector,
  };
})();
