(function () {
  const STAGE_BASE_WIDTH = 1024;
  const STAGE_BASE_HEIGHT = 1024;
  const MIN_GENERATION_PIXELS = 655360;
  const MAX_GENERATION_PIXELS = 8294400;
  const MAX_GENERATION_EDGE = 3840;
  const MAX_GENERATION_RATIO = 3;
  const STORAGE_KEY = "xiaolan.canvasWorkbenches.v2";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundToMultiple(value, step) {
    return Math.max(step, Math.round(value / step) * step);
  }

  function fitSizeToGenerationRules(width, height) {
    let nextWidth = Math.max(16, Number(width || 0));
    let nextHeight = Math.max(16, Number(height || 0));
    const originalRatio = nextWidth / Math.max(1, nextHeight);
    const ratio = Math.max(nextWidth, nextHeight) / Math.max(1, Math.min(nextWidth, nextHeight));

    if (ratio > MAX_GENERATION_RATIO) {
      if (nextWidth >= nextHeight) {
        nextHeight = nextWidth / MAX_GENERATION_RATIO;
      } else {
        nextWidth = nextHeight / MAX_GENERATION_RATIO;
      }
    }

    let pixels = nextWidth * nextHeight;
    const longEdge = Math.max(nextWidth, nextHeight);
    if (longEdge > MAX_GENERATION_EDGE || pixels > MAX_GENERATION_PIXELS) {
      const scale = Math.min(
        MAX_GENERATION_EDGE / longEdge,
        Math.sqrt(MAX_GENERATION_PIXELS / pixels)
      );
      nextWidth *= scale;
      nextHeight *= scale;
    }

    pixels = nextWidth * nextHeight;
    if (pixels < MIN_GENERATION_PIXELS) {
      const scale = Math.sqrt(MIN_GENERATION_PIXELS / pixels);
      nextWidth *= scale;
      nextHeight *= scale;
    }

    nextWidth = roundToMultiple(nextWidth, 16);
    nextHeight = roundToMultiple(nextHeight, 16);

    if (nextWidth * nextHeight > MAX_GENERATION_PIXELS) {
      const scale = Math.sqrt(MAX_GENERATION_PIXELS / (nextWidth * nextHeight));
      nextWidth = Math.max(16, Math.floor((nextWidth * scale) / 16) * 16);
      nextHeight = Math.max(16, Math.floor((nextHeight * scale) / 16) * 16);
    }

    if (Math.max(nextWidth, nextHeight) / Math.max(1, Math.min(nextWidth, nextHeight)) > MAX_GENERATION_RATIO) {
      if (originalRatio >= 1) {
        nextHeight = Math.ceil((nextWidth / MAX_GENERATION_RATIO) / 16) * 16;
      } else {
        nextWidth = Math.ceil((nextHeight / MAX_GENERATION_RATIO) / 16) * 16;
      }
    }

    return `${nextWidth}x${nextHeight}`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片加载失败"));
      image.src = src;
    });
  }

  function createBoard(name = "画布 1") {
    return {
      id: `canvas-board-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      prompt: "",
      viewScale: 0.7,
      cameraX: 0,
      cameraY: 0,
      selectedId: "",
      items: [],
    };
  }

  function defaultBoardState() {
    const board = createBoard("画布 1");
    return {
      activeBoardId: board.id,
      boards: [board],
    };
  }

  function createCanvasWorkbench(options = {}) {
    const elements = options.elements || {};
    const setStatus = options.setStatus || (() => {});
    const addReferenceImages = options.addReferenceImages || (() => {});
    const onReferenceAdded = options.onReferenceAdded || (() => {});
    const sendToGenerate = options.sendToGenerate || (() => {});
    const requestGenerate = options.requestGenerate || (() => {});
    const openImageEditor = options.openImageEditor || (() => {});
    const toFileUrl = options.toFileUrl || ((filePath) => filePath);
    const getPathForFile = options.getPathForFile || (() => "");

    const canvas = elements.canvas;
    const ctx = canvas?.getContext("2d");
    const imageCache = new Map();
    let saveTimer = 0;
    let isRestoring = false;
    let boardStore = defaultBoardState();
    const state = {
      width: STAGE_BASE_WIDTH,
      height: STAGE_BASE_HEIGHT,
      viewScale: 0.7,
      cameraX: 0,
      cameraY: 0,
      viewportWidth: 1,
      viewportHeight: 1,
      items: [],
      selectedId: "",
      drag: null,
      panDrag: null,
      contextTargetId: "",
      isSpaceDown: false,
      isGenerating: false,
      history: [],
      clipboardItem: null,
    };

    function sanitizeItem(item) {
      if (!item || !item.filePath) {
        return null;
      }
      const width = Number(item.width || item.naturalWidth || 0);
      const height = Number(item.height || item.naturalHeight || 0);
      if (!width || !height) {
        return null;
      }
      return {
        id: String(item.id || `canvas-item-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        type: "image",
        src: toFileUrl(item.filePath),
        filePath: String(item.filePath),
        name: String(item.name || item.filePath.split(/[\\/]/).pop() || "图片"),
        naturalWidth: Number(item.naturalWidth || width),
        naturalHeight: Number(item.naturalHeight || height),
        x: Number(item.x || 0),
        y: Number(item.y || 0),
        width,
        height,
        flipX: item.flipX === true,
        flipY: item.flipY === true,
        meta: item.meta && typeof item.meta === "object" ? { ...item.meta } : null,
      };
    }

    function serializeItem(item) {
      if (!item?.filePath) {
        return null;
      }
      return {
        id: item.id,
        filePath: item.filePath,
        name: item.name,
        naturalWidth: item.naturalWidth,
        naturalHeight: item.naturalHeight,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        flipX: item.flipX === true,
        flipY: item.flipY === true,
        meta: item.meta || null,
      };
    }

    function activeBoard() {
      let board = boardStore.boards.find((candidate) => candidate.id === boardStore.activeBoardId);
      if (!board) {
        board = boardStore.boards[0] || createBoard("画布 1");
        boardStore.boards = boardStore.boards.length ? boardStore.boards : [board];
        boardStore.activeBoardId = board.id;
      }
      return board;
    }

    function captureCurrentBoard() {
      const board = activeBoard();
      board.prompt = String(elements.prompt?.value || "");
      board.viewScale = state.viewScale;
      board.cameraX = state.cameraX;
      board.cameraY = state.cameraY;
      board.selectedId = state.selectedId;
      board.items = state.items.map(serializeItem).filter(Boolean);
    }

    function persistStateNow() {
      if (isRestoring) {
        return;
      }
      try {
        captureCurrentBoard();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boardStore));
      } catch (error) {
        console.warn("canvas persistence failed", error);
      }
    }

    function schedulePersist() {
      if (isRestoring) {
        return;
      }
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(persistStateNow, 120);
    }

    function readStoredBoards() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return defaultBoardState();
        }
        const parsed = JSON.parse(raw);
        const boards = Array.isArray(parsed?.boards)
          ? parsed.boards
              .map((board, index) => ({
                id: String(board.id || `canvas-board-${index + 1}`),
                name: String(board.name || `画布 ${index + 1}`),
                prompt: String(board.prompt || ""),
                viewScale: clamp(Number(board.viewScale || 0.7), 0.06, 3),
                cameraX: Number(board.cameraX || 0),
                cameraY: Number(board.cameraY || 0),
                selectedId: String(board.selectedId || ""),
                items: Array.isArray(board.items) ? board.items.map(sanitizeItem).filter(Boolean) : [],
              }))
              .filter(Boolean)
          : [];
        if (!boards.length) {
          return defaultBoardState();
        }
        const activeBoardId = boards.some((board) => board.id === parsed.activeBoardId)
          ? parsed.activeBoardId
          : boards[0].id;
        return { activeBoardId, boards };
      } catch (error) {
        console.warn("canvas restore failed", error);
        return defaultBoardState();
      }
    }

    function refreshBoardSelect() {
      if (!elements.boardSelect) {
        return;
      }
      elements.boardSelect.innerHTML = "";
      boardStore.boards.forEach((board, index) => {
        const option = document.createElement("option");
        option.value = board.id;
        option.textContent = board.name || `画布 ${index + 1}`;
        elements.boardSelect.appendChild(option);
      });
      elements.boardSelect.value = boardStore.activeBoardId;
    }

    async function applyBoard(board) {
      isRestoring = true;
      state.items = Array.isArray(board.items) ? board.items.map(sanitizeItem).filter(Boolean) : [];
      state.selectedId = state.items.some((item) => item.id === board.selectedId) ? board.selectedId : state.items.at(-1)?.id || "";
      state.viewScale = clamp(Number(board.viewScale || 0.7), 0.06, 3);
      state.cameraX = Number(board.cameraX || 0);
      state.cameraY = Number(board.cameraY || 0);
      state.history = [];
      state.drag = null;
      state.panDrag = null;
      if (elements.prompt) {
        elements.prompt.value = board.prompt || elements.prompt.value || "";
      }
      refreshBoardSelect();
      updateViewScale();
      draw();
      schedulePersist();
      isRestoring = false;
    }

    async function switchBoard(boardId) {
      if (!boardId || boardId === boardStore.activeBoardId) {
        return;
      }
      persistStateNow();
      boardStore.activeBoardId = boardId;
      await applyBoard(activeBoard());
      schedulePersist();
    }

    async function createNewBoard() {
      persistStateNow();
      const board = createBoard(`画布 ${boardStore.boards.length + 1}`);
      board.prompt = String(elements.prompt?.value || "");
      boardStore.boards.push(board);
      boardStore.activeBoardId = board.id;
      await applyBoard(board);
      setStatus(`已新建${board.name}`, "success");
      schedulePersist();
    }

    async function deleteCurrentBoard() {
      if (boardStore.boards.length <= 1) {
        setStatus("至少保留一个画布", "idle");
        return;
      }
      const board = activeBoard();
      if (!window.confirm(`确定删除“${board.name}”吗？`)) {
        return;
      }
      const index = boardStore.boards.findIndex((candidate) => candidate.id === board.id);
      boardStore.boards = boardStore.boards.filter((candidate) => candidate.id !== board.id);
      boardStore.activeBoardId = boardStore.boards[Math.max(0, index - 1)]?.id || boardStore.boards[0].id;
      await applyBoard(activeBoard());
      setStatus("已删除当前画布", "idle");
      schedulePersist();
    }

    function loadCachedImage(src) {
      const cached = imageCache.get(src);
      if (cached?.image) {
        return Promise.resolve(cached.image);
      }
      if (cached?.promise) {
        return cached.promise;
      }
      const promise = loadImage(src).then((image) => {
        imageCache.set(src, { image });
        return image;
      });
      imageCache.set(src, { promise });
      return promise;
    }

    function selectedItem() {
      return state.items.find((item) => item.id === state.selectedId) || null;
    }

    function getGenerationSourceItem() {
      const selected = selectedItem();
      if (selected) {
        return selected;
      }
      return state.items.length === 1 ? state.items[0] : null;
    }

    function pushHistory() {
      state.history.push(state.items.map((item) => ({ ...item })));
      if (state.history.length > 30) {
        state.history.shift();
      }
    }

    function resizeViewport() {
      if (!canvas || !elements.dropZone) {
        return;
      }
      const rect = elements.dropZone.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const ratio = window.devicePixelRatio || 1;
      state.viewportWidth = width;
      state.viewportHeight = height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function updateViewScale() {
      if (elements.zoomFitButton) {
        elements.zoomFitButton.textContent = `${Math.round(state.viewScale * 100)}%`;
      }
      if (elements.zoomOutButton) {
        elements.zoomOutButton.disabled = state.isGenerating || state.viewScale <= 0.08;
      }
      if (elements.zoomInButton) {
        elements.zoomInButton.disabled = state.isGenerating || state.viewScale >= 3;
      }
    }

    function screenToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - state.viewportWidth / 2) / state.viewScale + state.cameraX,
        y: (clientY - rect.top - state.viewportHeight / 2) / state.viewScale + state.cameraY,
      };
    }

    function worldToScreen(x, y) {
      return {
        x: (x - state.cameraX) * state.viewScale + state.viewportWidth / 2,
        y: (y - state.cameraY) * state.viewScale + state.viewportHeight / 2,
      };
    }

    function updateSelectionToolbar() {
      if (!elements.selectionToolbar) {
        return;
      }
      const selected = selectedItem();
      if (!selected || state.isGenerating) {
        elements.selectionToolbar.hidden = true;
        return;
      }
      const topCenter = worldToScreen(selected.x + selected.width / 2, selected.y);
      elements.selectionToolbar.hidden = false;
      elements.selectionToolbar.style.left = `${clamp(topCenter.x, 88, state.viewportWidth - 88)}px`;
      elements.selectionToolbar.style.top = `${clamp(topCenter.y - 12, 48, state.viewportHeight - 12)}px`;
    }

    function hideContextMenu() {
      if (!elements.contextMenu) {
        return;
      }
      elements.contextMenu.hidden = true;
      state.contextTargetId = "";
    }

    function showContextMenu(event, item) {
      if (!elements.contextMenu || !item) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      state.selectedId = item.id;
      state.contextTargetId = item.id;
      draw();
      const menuWidth = 168;
      const menuHeight = 292;
      elements.contextMenu.style.left = `${clamp(event.clientX, 12, window.innerWidth - menuWidth - 12)}px`;
      elements.contextMenu.style.top = `${clamp(event.clientY, 12, window.innerHeight - menuHeight - 12)}px`;
      elements.contextMenu.hidden = false;
    }

    function contextItem() {
      return state.items.find((item) => item.id === state.contextTargetId) || selectedItem();
    }

    function setViewScale(nextScale, anchorEvent = null) {
      const next = clamp(Math.round(nextScale * 100) / 100, 0.06, 3);
      const anchor = anchorEvent
        ? screenToWorld(anchorEvent.clientX, anchorEvent.clientY)
        : { x: state.cameraX, y: state.cameraY };
      const rect = anchorEvent ? canvas.getBoundingClientRect() : null;
      const anchorScreenX = anchorEvent ? anchorEvent.clientX - rect.left : state.viewportWidth / 2;
      const anchorScreenY = anchorEvent ? anchorEvent.clientY - rect.top : state.viewportHeight / 2;

      state.viewScale = next;
      state.cameraX = anchor.x - (anchorScreenX - state.viewportWidth / 2) / state.viewScale;
      state.cameraY = anchor.y - (anchorScreenY - state.viewportHeight / 2) / state.viewScale;
      updateViewScale();
      draw();
      schedulePersist();
    }

    function fitViewToStage() {
      resizeViewport();
      if (state.items.length) {
        const bounds = state.items.reduce(
          (next, item) => ({
            left: Math.min(next.left, item.x),
            top: Math.min(next.top, item.y),
            right: Math.max(next.right, item.x + item.width),
            bottom: Math.max(next.bottom, item.y + item.height),
          }),
          { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
        );
        const contentWidth = Math.max(160, bounds.right - bounds.left);
        const contentHeight = Math.max(160, bounds.bottom - bounds.top);
        const availableWidth = Math.max(160, state.viewportWidth - 96);
        const availableHeight = Math.max(160, state.viewportHeight - 96);
        state.cameraX = bounds.left + contentWidth / 2;
        state.cameraY = bounds.top + contentHeight / 2;
        state.viewScale = clamp(Math.min(1.5, availableWidth / contentWidth, availableHeight / contentHeight), 0.06, 3);
      } else if (!state.drag && !state.panDrag) {
        const availableWidth = Math.max(160, state.viewportWidth - 96);
        const availableHeight = Math.max(160, state.viewportHeight - 96);
        state.cameraX = 0;
        state.cameraY = 0;
        state.viewScale = clamp(Math.min(1, availableWidth / state.width, availableHeight / state.height), 0.06, 3);
      } else {
        resizeViewport();
      }
      updateViewScale();
      draw();
      schedulePersist();
    }

    function fitViewToItem(item = selectedItem()) {
      if (!item) {
        return;
      }
      resizeViewport();
      const availableWidth = Math.max(160, state.viewportWidth - 128);
      const availableHeight = Math.max(160, state.viewportHeight - 128);
      state.cameraX = item.x + item.width / 2;
      state.cameraY = item.y + item.height / 2;
      state.viewScale = clamp(Math.min(2.4, availableWidth / Math.max(1, item.width), availableHeight / Math.max(1, item.height)), 0.06, 3);
      updateViewScale();
      draw();
      schedulePersist();
    }

    function fitImage(image) {
      const scale = Math.min(state.viewportWidth * 0.58 / image.naturalWidth, state.viewportHeight * 0.68 / image.naturalHeight, 1);
      const width = Math.max(80, Math.round(image.naturalWidth * scale));
      const height = Math.max(80, Math.round(image.naturalHeight * scale));
      return {
        width,
        height,
        x: Math.round(state.cameraX - width / 2 + state.items.length * 24),
        y: Math.round(state.cameraY - height / 2 + state.items.length * 24),
      };
    }

    async function addImage(input = {}) {
      const src = input.src || (input.filePath ? toFileUrl(input.filePath) : "");
      if (!src) {
        return;
      }
      const image = await loadCachedImage(src);
      const fitted = fitImage(image);
      pushHistory();
      const item = {
        id: `canvas-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: "image",
        src,
        filePath: input.filePath || "",
        name: input.name || input.fileName || input.filePath?.split(/[\\/]/).pop() || "图片",
        naturalWidth: image.naturalWidth || fitted.width,
        naturalHeight: image.naturalHeight || fitted.height,
        x: fitted.x,
        y: fitted.y,
        width: fitted.width,
        height: fitted.height,
        flipX: input.flipX === true,
        flipY: input.flipY === true,
        meta: input.meta && typeof input.meta === "object" ? { ...input.meta } : null,
      };
      state.items.push(item);
      state.selectedId = item.id;
      setStatus(`已放入画布：${item.name}`, "success");
      draw();
      schedulePersist();
    }

    async function addFiles(files) {
      for (const file of Array.from(files || [])) {
        const filePath = getPathForFile(file);
        const src = filePath ? toFileUrl(filePath) : await readFileAsDataUrl(file);
        await addImage({
          src,
          filePath,
          name: file.name || filePath,
        });
      }
    }

    function getItemAt(point) {
      for (let index = state.items.length - 1; index >= 0; index -= 1) {
        const item = state.items[index];
        if (
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height
        ) {
          return item;
        }
      }
      return null;
    }

    function withWorldTransform(callback) {
      ctx.save();
      ctx.translate(state.viewportWidth / 2, state.viewportHeight / 2);
      ctx.scale(state.viewScale, state.viewScale);
      ctx.translate(-state.cameraX, -state.cameraY);
      callback();
      ctx.restore();
    }

    function drawGrid() {
      const left = state.cameraX - state.viewportWidth / 2 / state.viewScale;
      const top = state.cameraY - state.viewportHeight / 2 / state.viewScale;
      const right = state.cameraX + state.viewportWidth / 2 / state.viewScale;
      const bottom = state.cameraY + state.viewportHeight / 2 / state.viewScale;
      const gridSize = state.viewScale < 0.2 ? 512 : state.viewScale < 0.45 ? 256 : 128;
      const startX = Math.floor(left / gridSize) * gridSize;
      const startY = Math.floor(top / gridSize) * gridSize;

      ctx.strokeStyle = "rgba(148, 166, 190, 0.11)";
      ctx.lineWidth = 1 / state.viewScale;
      for (let x = startX; x <= right; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      for (let y = startY; y <= bottom; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      }
    }

    function drawSelection(item) {
      if (!item) {
        return;
      }
      const lineWidth = Math.max(2 / state.viewScale, 2);
      const handleSize = Math.max(10 / state.viewScale, 12);
      ctx.save();
      ctx.strokeStyle = "#18c7d8";
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([12 / state.viewScale, 8 / state.viewScale]);
      ctx.strokeRect(item.x, item.y, item.width, item.height);
      ctx.setLineDash([]);
      ctx.fillStyle = "#f8fbff";
      ctx.strokeStyle = "#18c7d8";
      for (const [x, y] of [
        [item.x, item.y],
        [item.x + item.width, item.y],
        [item.x, item.y + item.height],
        [item.x + item.width, item.y + item.height],
      ]) {
        ctx.beginPath();
        ctx.roundRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize, 5 / state.viewScale);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawImageItem(image, item) {
      ctx.save();
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
      ctx.drawImage(image, -item.width / 2, -item.height / 2, item.width, item.height);
      ctx.restore();
    }

    function draw() {
      if (!ctx || !canvas) {
        return;
      }
      const ratio = window.devicePixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);
      ctx.fillStyle = "#101925";
      ctx.fillRect(0, 0, state.viewportWidth, state.viewportHeight);

      withWorldTransform(() => {
        drawGrid();
        for (const item of state.items) {
          const cached = imageCache.get(item.src);
          if (cached?.image) {
            drawImageItem(cached.image, item);
          } else {
            loadCachedImage(item.src)
              .then(() => draw())
              .catch(() => {});
          }
        }
        drawSelection(selectedItem());
      });
      updateUi();
    }

    function updateUi() {
      const selected = selectedItem();
      elements.empty?.classList.toggle("is-hidden", state.items.length > 0);
      elements.loading?.toggleAttribute("hidden", !state.isGenerating);
      elements.dropZone?.classList.toggle("is-generating", state.isGenerating);
      if (elements.selectedName) {
        elements.selectedName.textContent = selected ? selected.name : "未选中图片";
      }
      if (elements.boardDeleteButton) {
        elements.boardDeleteButton.disabled = state.isGenerating || boardStore.boards.length <= 1;
      }
      for (const button of [
        elements.deleteButton,
        elements.pickButton,
        elements.undoButton,
        elements.clearButton,
        elements.referenceButton,
        elements.generateButton,
        elements.zoomFitButton,
        elements.boardSelect,
        elements.boardNewButton,
      ]) {
        if (button) {
          button.disabled =
            state.isGenerating ||
            (button === elements.deleteButton && !selected) ||
            (button === elements.referenceButton && state.items.length === 0) ||
            (button === elements.generateButton && state.items.length === 0);
        }
      }
      if (elements.generateButton) {
        elements.generateButton.textContent = state.isGenerating ? "生成中..." : "生成当前选中图";
      }
      updateViewScale();
      updateSelectionToolbar();
    }

    function setGenerating(isGenerating, text = "") {
      state.isGenerating = isGenerating;
      if (elements.loadingText) {
        elements.loadingText.textContent = text || (isGenerating ? "正在处理，请稍等..." : "");
      }
      updateUi();
    }

    function duplicateSelected() {
      if (!copySelected()) {
        return false;
      }
      const pasted = pasteCopied();
      if (pasted) {
        setStatus("已创建副本", "success");
      }
      return pasted;
    }

    function deleteSelected() {
      if (!state.selectedId) {
        return;
      }
      pushHistory();
      state.items = state.items.filter((item) => item.id !== state.selectedId);
      state.selectedId = "";
      draw();
      setStatus("已删除画布图片", "idle");
      schedulePersist();
    }

    function copySelected() {
      const selected = selectedItem();
      if (!selected) {
        return false;
      }
      state.clipboardItem = { ...selected };
      setStatus("已复制画布图片", "idle");
      return true;
    }

    async function copySelectedAsImage() {
      const selected = selectedItem();
      if (!selected?.filePath || !window.desktopApi?.copyImageToClipboard) {
        setStatus("这张图片没有本地路径，不能复制为图片", "error");
        return false;
      }
      await window.desktopApi.copyImageToClipboard(selected.filePath);
      setStatus("已复制为图片", "success");
      return true;
    }

    async function saveSelectedAs() {
      const selected = selectedItem();
      if (!selected?.filePath || !window.desktopApi?.saveImageAs) {
        setStatus("这张图片没有本地路径，不能另存为", "error");
        return null;
      }
      const savedPath = await window.desktopApi.saveImageAs({
        sourcePath: selected.filePath,
        defaultPath: selected.filePath,
      });
      if (savedPath) {
        setStatus(`已另存为：${savedPath.split(/[\\/]/).pop()}`, "success");
      }
      return savedPath;
    }

    function flipSelected(axis) {
      const selected = selectedItem();
      if (!selected) {
        return false;
      }
      pushHistory();
      if (axis === "x") {
        selected.flipX = !selected.flipX;
      } else {
        selected.flipY = !selected.flipY;
      }
      draw();
      schedulePersist();
      setStatus(axis === "x" ? "已水平翻转" : "已垂直翻转", "success");
      return true;
    }

    function formatMetaValue(value) {
      if (Array.isArray(value)) {
        return value.length ? value.join("，") : "无";
      }
      const text = String(value ?? "").trim();
      return text || "无";
    }

    function showGenerationInfo(item = selectedItem()) {
      if (!item || !elements.infoModal || !elements.infoList) {
        return;
      }
      const meta = item.meta || {};
      const rows = [
        ["文件名", item.name],
        ["文件路径", item.filePath],
        ["原始尺寸", `${Math.round(item.naturalWidth || item.width)} × ${Math.round(item.naturalHeight || item.height)}`],
        ["画布尺寸", `${Math.round(item.width)} × ${Math.round(item.height)}`],
        ["翻转", `${item.flipX ? "水平" : ""}${item.flipX && item.flipY ? " / " : ""}${item.flipY ? "垂直" : ""}` || "无"],
        ["生成方式", meta.mode === "image" ? "图生图" : meta.mode === "text" ? "文生图" : "无"],
        ["提示词", meta.prompt || String(elements.prompt?.value || "")],
        ["尺寸参数", meta.size],
        ["质量", meta.quality],
        ["格式", meta.outputFormat],
        ["参考图", meta.referenceImagePaths],
        ["生成时间", meta.createdAt],
      ];
      elements.infoList.replaceChildren();
      for (const [label, value] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = formatMetaValue(value);
        elements.infoList.append(dt, dd);
      }
      elements.infoModal.hidden = false;
    }

    function closeGenerationInfo() {
      if (elements.infoModal) {
        elements.infoModal.hidden = true;
      }
    }

    function pasteCopied() {
      if (!state.clipboardItem) {
        return false;
      }
      pushHistory();
      const offset = Math.max(18, Math.round(Math.min(state.width, state.height) * 0.035));
      const item = cloneCanvasItem(state.clipboardItem, offset);
      state.items.push(item);
      state.selectedId = item.id;
      draw();
      setStatus("已粘贴画布图片", "success");
      schedulePersist();
      return true;
    }

    function cutSelected() {
      if (!copySelected()) {
        return false;
      }
      deleteSelected();
      setStatus("已剪切画布图片", "idle");
      return true;
    }

    function cloneCanvasItem(source, offset = 0) {
      return {
        ...source,
        id: `canvas-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: `${source.name || "image"} copy`,
        x: source.x + offset,
        y: source.y + offset,
        flipX: source.flipX === true,
        flipY: source.flipY === true,
        meta: source.meta ? { ...source.meta } : null,
      };
    }

    function undo() {
      const previous = state.history.pop();
      if (!previous) {
        return;
      }
      state.items = previous;
      state.selectedId = state.items.at(-1)?.id || "";
      draw();
      setStatus("已撤销画布操作", "idle");
      schedulePersist();
    }

    function clear() {
      if (state.items.length === 0) {
        return;
      }
      if (!window.confirm("确定清空画布里的所有图片吗？")) {
        return;
      }
      pushHistory();
      state.items = [];
      state.selectedId = "";
      draw();
      setStatus("画布已清空", "idle");
      schedulePersist();
    }

    function isTypingTarget(target) {
      const tagName = target?.tagName?.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable;
    }

    function isCanvasVisible() {
      return Boolean(elements.dropZone?.offsetParent);
    }

    function updateSpaceMode() {
      elements.dropZone?.classList.toggle("is-space-panning", state.isSpaceDown);
    }

    function handleShortcut(event) {
      if (!isCanvasVisible() || isTypingTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        state.isSpaceDown = event.type === "keydown";
        updateSpaceMode();
        event.preventDefault();
        return;
      }

      if (event.type !== "keydown") {
        return;
      }

      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      let handled = false;

      if (command && event.shiftKey && key === "c") {
        copySelectedAsImage().catch((error) => setStatus(error.message || "复制为图片失败", "error"));
        handled = true;
      } else if (command && key === "c") {
        handled = copySelected();
      } else if (command && key === "x") {
        handled = cutSelected();
      } else if (command && key === "v") {
        handled = pasteCopied();
      } else if (command && key === "d") {
        handled = duplicateSelected();
      } else if (command && key === "z") {
        undo();
        handled = true;
      } else if (command && (key === "+" || key === "=")) {
        setViewScale(state.viewScale + 0.1);
        handled = true;
      } else if (command && key === "-") {
        setViewScale(state.viewScale - 0.1);
        handled = true;
      } else if (command && key === "0") {
        fitViewToStage();
        handled = true;
      } else if (key === "delete" || key === "backspace") {
        if (state.selectedId) {
          deleteSelected();
          handled = true;
        }
      }

      if (handled) {
        event.preventDefault();
      }
    }

    function addSelectedImageToReference() {
      const sourceItem = getGenerationSourceItem();
      if (!sourceItem) {
        setStatus(
          state.items.length > 1
            ? "画布里有多张图片，请先选中要加入参考图的那张"
            : "请先把图片放入画布",
          "error"
        );
        return;
      }
      if (!sourceItem.filePath) {
        setStatus("这张图片没有本地文件路径，不能加入参考图", "error");
        return;
      }
      addReferenceImages([sourceItem.filePath], "画布选中图");
      onReferenceAdded(sourceItem);
      setStatus(`已把选中图加入参考图：${sourceItem.name}`, "success");
    }

    async function replaceSelectedImage(filePath) {
      const selected = selectedItem();
      if (!selected || !filePath) {
        return;
      }
      const src = toFileUrl(filePath);
      const loadedImage = await loadCachedImage(src);
      pushHistory();
      selected.src = src;
      selected.filePath = filePath;
      selected.name = filePath.split(/[\\/]/).pop() || selected.name;
      selected.naturalWidth = loadedImage.naturalWidth || selected.naturalWidth;
      selected.naturalHeight = loadedImage.naturalHeight || selected.naturalHeight;
      draw();
      schedulePersist();
    }

    async function editSelectedImage() {
      const sourceItem = getGenerationSourceItem();
      if (!sourceItem?.filePath) {
        setStatus("请先选中一张有本地路径的图片", "error");
        return;
      }
      try {
        const result = await openImageEditor(sourceItem.filePath, sourceItem.name || "画布图片");
        if (result?.filePath) {
          await replaceSelectedImage(result.filePath);
          setStatus(`已更新画布图片：${result.fileName || sourceItem.name}`, "success");
        }
      } catch (error) {
        setStatus(error.message || "图片编辑失败", "error");
      }
    }

    async function addGeneratedImageBesideSource(sourceItem, image, generation = {}) {
      if (!sourceItem || !image?.filePath) {
        return;
      }
      const payload = generation.response?.payload || {};
      const src = toFileUrl(image.filePath);
      const loadedImage = await loadCachedImage(src);
      const displayHeight = sourceItem.height;
      const displayWidth = Math.max(
        80,
        Math.round(displayHeight * ((loadedImage.naturalWidth || sourceItem.width) / Math.max(1, loadedImage.naturalHeight || sourceItem.height)))
      );
      pushHistory();
      const gap = Math.max(32, Math.round(sourceItem.width * 0.08));
      const item = {
        id: `canvas-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: "image",
        src,
        filePath: image.filePath,
        name: image.fileName || image.filePath.split(/[\\/]/).pop() || "生成图",
        naturalWidth: loadedImage.naturalWidth || displayWidth,
        naturalHeight: loadedImage.naturalHeight || displayHeight,
        x: sourceItem.x + sourceItem.width + gap,
        y: sourceItem.y,
        width: displayWidth,
        height: displayHeight,
        flipX: false,
        flipY: false,
        meta: {
          mode: "image",
          prompt: String(elements.prompt?.value || ""),
          size: payload.size || image.size || generation.size || "",
          quality: payload.quality || image.quality || "",
          outputFormat: payload.output_format || payload.outputFormat || image.outputFormat || "",
          referenceImagePaths: [sourceItem.filePath],
          createdAt: image.createdAt || new Date().toISOString(),
        },
      };
      state.items.push(item);
      state.selectedId = item.id;
      state.cameraX = item.x + item.width / 2;
      state.cameraY = item.y + item.height / 2;
      draw();
      setStatus(`已把生成图放到原图右侧：${item.name}`, "success");
      schedulePersist();
    }

    async function generateFromCanvas() {
      if (state.isGenerating) {
        return;
      }

      const sourceItem = getGenerationSourceItem();
      if (!sourceItem) {
        setStatus(
          state.items.length > 1
            ? "画布里有多张图片，请先选中要生成的那张"
            : "请先把图片放入画布",
          "error"
        );
        return;
      }

      if (!sourceItem.filePath) {
        setStatus("这张图片没有本地文件路径，不能直接用于图生图", "error");
        return;
      }

      const size = fitSizeToGenerationRules(sourceItem.naturalWidth || sourceItem.width, sourceItem.naturalHeight || sourceItem.height);
      try {
        setGenerating(true, `正在发送原图 ${size}...`);
        setStatus(`正在按原图尺寸生成：${size}`, "loading");
        const response = await requestGenerate({
          referenceImagePaths: [sourceItem.filePath],
          size,
        });
        const generatedImage = Array.isArray(response?.images) ? response.images[0] : null;
        await addGeneratedImageBesideSource(sourceItem, generatedImage, { response, size });
      } finally {
        setGenerating(false);
      }
    }

    elements.dropZone?.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.(".canvas-selection-toolbar, .canvas-context-menu")) {
        return;
      }
      if (event.button !== 0 || event.target === canvas) {
        return;
      }
      event.preventDefault();
      state.panDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cameraX: state.cameraX,
        cameraY: state.cameraY,
      };
      elements.dropZone.classList.add("is-panning");
      elements.dropZone.setPointerCapture(event.pointerId);
    });

    elements.dropZone?.addEventListener("pointermove", (event) => {
      if (!state.panDrag) {
        return;
      }
      event.preventDefault();
      state.cameraX = state.panDrag.cameraX - (event.clientX - state.panDrag.startX) / state.viewScale;
      state.cameraY = state.panDrag.cameraY - (event.clientY - state.panDrag.startY) / state.viewScale;
      draw();
      schedulePersist();
    });

    elements.dropZone?.addEventListener("pointerup", (event) => {
      if (!state.panDrag) {
        return;
      }
      state.panDrag = null;
      elements.dropZone.classList.remove("is-panning");
      try {
        elements.dropZone.releasePointerCapture(event.pointerId);
      } catch (error) {}
      schedulePersist();
    });

    canvas?.addEventListener("pointerdown", (event) => {
      if (event.button === 2) {
        return;
      }
      hideContextMenu();
      if (state.isSpaceDown) {
        return;
      }
      const point = screenToWorld(event.clientX, event.clientY);
      const item = getItemAt(point);
      state.selectedId = item?.id || "";
      if (!item) {
        event.preventDefault();
        state.panDrag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          cameraX: state.cameraX,
          cameraY: state.cameraY,
        };
        elements.dropZone?.classList.add("is-panning");
        canvas.setPointerCapture(event.pointerId);
        draw();
        schedulePersist();
        return;
      }
      const nearCorner =
        Math.abs(point.x - (item.x + item.width)) < Math.max(18 / state.viewScale, item.width * 0.04) &&
        Math.abs(point.y - (item.y + item.height)) < Math.max(18 / state.viewScale, item.height * 0.04);
      pushHistory();
      let dragItem = item;
      if (event.altKey) {
        dragItem = cloneCanvasItem(item, 18 / state.viewScale);
        dragItem.x = item.x;
        dragItem.y = item.y;
        state.items.push(dragItem);
        state.selectedId = dragItem.id;
        setStatus("已复制并拖动新图片", "success");
      }
      state.drag = {
        id: dragItem.id,
        type: nearCorner ? "resize" : "move",
        startX: point.x,
        startY: point.y,
        item: { ...dragItem },
      };
      canvas.setPointerCapture(event.pointerId);
      draw();
    });

    canvas?.addEventListener("contextmenu", (event) => {
      const point = screenToWorld(event.clientX, event.clientY);
      const item = getItemAt(point);
      if (item) {
        showContextMenu(event, item);
      } else {
        hideContextMenu();
      }
    });

    canvas?.addEventListener("pointermove", (event) => {
      if (state.panDrag) {
        event.preventDefault();
        state.cameraX = state.panDrag.cameraX - (event.clientX - state.panDrag.startX) / state.viewScale;
        state.cameraY = state.panDrag.cameraY - (event.clientY - state.panDrag.startY) / state.viewScale;
        draw();
        schedulePersist();
        return;
      }
      if (!state.drag) {
        return;
      }
      const point = screenToWorld(event.clientX, event.clientY);
      const item = state.items.find((candidate) => candidate.id === state.drag.id);
      if (!item) {
        return;
      }
      const dx = point.x - state.drag.startX;
      const dy = point.y - state.drag.startY;
      if (state.drag.type === "resize") {
        const ratio = state.drag.item.width / Math.max(1, state.drag.item.height);
        const nextWidth = clamp(state.drag.item.width + dx, 80, 20000);
        item.width = nextWidth;
        item.height = clamp(nextWidth / ratio, 80, 20000);
      } else {
        item.x = state.drag.item.x + dx;
        item.y = state.drag.item.y + dy;
      }
      draw();
      schedulePersist();
    });

    canvas?.addEventListener("pointerup", (event) => {
      state.drag = null;
      state.panDrag = null;
      elements.dropZone?.classList.remove("is-panning");
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {}
      schedulePersist();
    });

    for (const eventName of ["dragenter", "dragover"]) {
      elements.dropZone?.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.classList.add("is-dragging");
      });
    }

    for (const eventName of ["dragleave", "drop"]) {
      elements.dropZone?.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove("is-dragging");
      });
    }

    elements.dropZone?.addEventListener("drop", async (event) => {
      const internalPath = event.dataTransfer?.getData("application/x-xiaolan-reference-path");
      if (internalPath) {
        await addImage({ filePath: internalPath });
        return;
      }
      await addFiles(event.dataTransfer?.files);
    });

    elements.contextMenu?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const actionButton = event.target?.closest?.("[data-canvas-action]");
      const action = actionButton?.dataset?.canvasAction;
      if (!action) {
        return;
      }
      const item = contextItem();
      if (item) {
        state.selectedId = item.id;
      }
      hideContextMenu();
      try {
        if (action === "duplicate") {
          duplicateSelected();
        } else if (action === "copy-image") {
          await copySelectedAsImage();
        } else if (action === "save-as") {
          await saveSelectedAs();
        } else if (action === "info") {
          showGenerationInfo(item);
        } else if (action === "flip-x") {
          flipSelected("x");
        } else if (action === "flip-y") {
          flipSelected("y");
        } else if (action === "send-generate") {
          sendToGenerate(item);
        } else if (action === "delete") {
          deleteSelected();
        }
      } catch (error) {
        setStatus(error.message || "画布操作失败", "error");
      }
    });

    for (const isolatedElement of [elements.contextMenu, elements.selectionToolbar]) {
      isolatedElement?.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      isolatedElement?.addEventListener("pointerup", (event) => {
        event.stopPropagation();
      });
      isolatedElement?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      isolatedElement?.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }

    document.addEventListener("click", (event) => {
      if (!elements.contextMenu || elements.contextMenu.hidden) {
        return;
      }
      if (!elements.contextMenu.contains(event.target)) {
        hideContextMenu();
      }
    });

    elements.infoCloseButton?.addEventListener("click", closeGenerationInfo);
    elements.infoModal?.addEventListener("click", (event) => {
      if (event.target === elements.infoModal || event.target.classList.contains("lightbox-backdrop")) {
        closeGenerationInfo();
      }
    });

    elements.pickButton?.addEventListener("click", async () => {
      const filePaths = await window.desktopApi.pickReferenceImages();
      for (const filePath of filePaths || []) {
        await addImage({ filePath });
      }
    });
    elements.deleteButton?.addEventListener("click", deleteSelected);
    elements.undoButton?.addEventListener("click", undo);
    elements.clearButton?.addEventListener("click", clear);
    elements.boardSelect?.addEventListener("change", () => {
      switchBoard(elements.boardSelect.value).catch((error) => setStatus(error.message, "error"));
    });
    elements.boardNewButton?.addEventListener("click", () => {
      createNewBoard().catch((error) => setStatus(error.message, "error"));
    });
    elements.boardDeleteButton?.addEventListener("click", () => {
      deleteCurrentBoard().catch((error) => setStatus(error.message, "error"));
    });
    elements.prompt?.addEventListener("input", schedulePersist);
    elements.zoomOutButton?.addEventListener("click", () => setViewScale(state.viewScale - 0.1));
    elements.zoomInButton?.addEventListener("click", () => setViewScale(state.viewScale + 0.1));
    elements.zoomFitButton?.addEventListener("click", fitViewToStage);
    elements.referenceButton?.addEventListener("click", addSelectedImageToReference);
    elements.generateButton?.addEventListener("click", () => generateFromCanvas().catch((error) => setStatus(error.message, "error")));
    elements.selectionReferenceButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addSelectedImageToReference();
    });
    elements.selectionGenerateButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      generateFromCanvas().catch((error) => setStatus(error.message, "error"));
    });
    elements.selectionEditButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      editSelectedImage();
    });
    elements.dropZone?.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        setViewScale(state.viewScale + (event.deltaY < 0 ? 0.08 : -0.08), event);
      },
      { passive: false }
    );
    document.addEventListener("keydown", handleShortcut);
    document.addEventListener("keyup", handleShortcut);
    window.addEventListener("blur", () => {
      state.isSpaceDown = false;
      state.panDrag = null;
      updateSpaceMode();
      elements.dropZone?.classList.remove("is-panning");
    });
    window.addEventListener("resize", fitViewToStage);
    window.addEventListener("beforeunload", persistStateNow);
    boardStore = readStoredBoards();
    applyBoard(activeBoard());
    resizeViewport();
    if (!state.items.length && !activeBoard().items.length) {
      fitViewToStage();
    } else {
      updateViewScale();
      draw();
    }
    updateUi();

    return {
      addImage,
      draw,
      fitViewToStage,
      setViewScale,
    };
  }

  window.XiaolanCanvasWorkbench = {
    createCanvasWorkbench,
  };
})();
