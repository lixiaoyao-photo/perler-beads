const state = {
  image: null,
  objectUrl: null,
  mode: "pattern",
  showGrid: true,
  cropSquare: true,
  gridSize: 64,
  colorCount: 16,
  beadSize: 82,
  exportScale: 2,
  renderData: null,
};

const paletteSymbols = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const XHS_NAME = "离小遥";
const XHS_HANDLE = "fDuyaoyao";

const refs = {
  imageInput: document.querySelector("#imageInput"),
  gridSize: document.querySelector("#gridSize"),
  colorCount: document.querySelector("#colorCount"),
  beadSize: document.querySelector("#beadSize"),
  modeSelect: document.querySelector("#modeSelect"),
  exportScale: document.querySelector("#exportScale"),
  cropSquare: document.querySelector("#cropSquare"),
  showGrid: document.querySelector("#showGrid"),
  gridSizeValue: document.querySelector("#gridSizeValue"),
  colorCountValue: document.querySelector("#colorCountValue"),
  beadSizeValue: document.querySelector("#beadSizeValue"),
  previewCanvas: document.querySelector("#previewCanvas"),
  imageMeta: document.querySelector("#imageMeta"),
  beadCount: document.querySelector("#beadCount"),
  paletteCount: document.querySelector("#paletteCount"),
  paletteList: document.querySelector("#paletteList"),
  downloadBtn: document.querySelector("#downloadBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  followModal: document.querySelector("#followModal"),
  modalCopy: document.querySelector("#modalCopy"),
  closeModalBtn: document.querySelector("#closeModalBtn"),
  dismissModalBtn: document.querySelector("#dismissModalBtn"),
  copyHandleBtn: document.querySelector("#copyHandleBtn"),
};

const ctx = refs.previewCanvas.getContext("2d");
const CANVAS_SIZE = 960;

function setupCanvasResolution() {
  const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
  const scaledSize = Math.round(CANVAS_SIZE * pixelRatio);
  refs.previewCanvas.width = scaledSize;
  refs.previewCanvas.height = scaledSize;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function sampleAverageCellColor(pixels, width, startX, startY, endX, endY) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3] / 255;
      r += pixels[offset] * alpha;
      g += pixels[offset + 1] * alpha;
      b += pixels[offset + 2] * alpha;
      count += alpha || 1;
    }
  }

  if (!count) {
    return [255, 255, 255];
  }

  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function averageColor(pixels, bucket) {
  let r = 0;
  let g = 0;
  let b = 0;

  for (const pixel of bucket) {
    const index = pixel * 4;
    r += pixels[index];
    g += pixels[index + 1];
    b += pixels[index + 2];
  }

  return [
    Math.round(r / bucket.length),
    Math.round(g / bucket.length),
    Math.round(b / bucket.length),
  ];
}

function quantizeColors(pixels, maxColors) {
  const pixelCount = pixels.length / 4;
  const indexes = Array.from({ length: pixelCount }, (_, index) => index);
  let buckets = [indexes];

  while (buckets.length < maxColors) {
    let splitIndex = -1;
    let maxRange = -1;
    let splitChannel = 0;

    for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
      const bucket = buckets[bucketIndex];
      if (bucket.length <= 1) {
        continue;
      }

      let rMin = 255;
      let rMax = 0;
      let gMin = 255;
      let gMax = 0;
      let bMin = 255;
      let bMax = 0;

      for (const pixelIndex of bucket) {
        const offset = pixelIndex * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        rMin = Math.min(rMin, r);
        rMax = Math.max(rMax, r);
        gMin = Math.min(gMin, g);
        gMax = Math.max(gMax, g);
        bMin = Math.min(bMin, b);
        bMax = Math.max(bMax, b);
      }

      const ranges = [rMax - rMin, gMax - gMin, bMax - bMin];
      const localMax = Math.max(...ranges);
      if (localMax > maxRange) {
        maxRange = localMax;
        splitIndex = bucketIndex;
        splitChannel = ranges.indexOf(localMax);
      }
    }

    if (splitIndex === -1) {
      break;
    }

    const bucket = buckets[splitIndex];
    bucket.sort((left, right) => {
      const leftValue = pixels[left * 4 + splitChannel];
      const rightValue = pixels[right * 4 + splitChannel];
      return leftValue - rightValue;
    });

    const middle = Math.floor(bucket.length / 2);
    const first = bucket.slice(0, middle);
    const second = bucket.slice(middle);

    buckets.splice(splitIndex, 1, first, second);
  }

  return buckets.map((bucket) => averageColor(pixels, bucket));
}

function nearestColor(color, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const distance =
      (color[0] - candidate[0]) ** 2 +
      (color[1] - candidate[1]) ** 2 +
      (color[2] - candidate[2]) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function extractImageData(image, size, cropSquare) {
  const sourceCanvas = document.createElement("canvas");
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (cropSquare) {
    const square = Math.min(image.width, image.height);
    sx = Math.floor((image.width - square) / 2);
    sy = Math.floor((image.height - square) / 2);
    sw = square;
    sh = square;
  }

  sourceCanvas.width = sw;
  sourceCanvas.height = sh;
  sourceContext.imageSmoothingEnabled = false;
  sourceContext.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  const fullData = sourceContext.getImageData(0, 0, sw, sh);
  const outputWidth = cropSquare ? size : clamp(Math.round((sw / sh) * size), 24, 144);
  const outputHeight = cropSquare ? size : clamp(Math.round((sh / sw) * size), 24, 144);
  const cells = [];

  for (let y = 0; y < outputHeight; y += 1) {
    const startY = Math.floor((y / outputHeight) * sh);
    const endY = Math.max(startY + 1, Math.floor(((y + 1) / outputHeight) * sh));
    for (let x = 0; x < outputWidth; x += 1) {
      const startX = Math.floor((x / outputWidth) * sw);
      const endX = Math.max(startX + 1, Math.floor(((x + 1) / outputWidth) * sw));
      cells.push(sampleAverageCellColor(fullData.data, sw, startX, startY, endX, endY));
    }
  }

  return { width: outputWidth, height: outputHeight, cells };
}

function buildPattern() {
  if (!state.image) {
    return null;
  }

  const sampled = extractImageData(state.image, state.gridSize, state.cropSquare);
  const flatPixels = new Uint8ClampedArray(sampled.cells.length * 4);
  sampled.cells.forEach((color, index) => {
    const offset = index * 4;
    flatPixels[offset] = color[0];
    flatPixels[offset + 1] = color[1];
    flatPixels[offset + 2] = color[2];
    flatPixels[offset + 3] = 255;
  });

  const palette = quantizeColors(flatPixels, state.colorCount);
  const colorMap = new Map();
  const cells = [];

  for (let y = 0; y < sampled.height; y += 1) {
    for (let x = 0; x < sampled.width; x += 1) {
      const color = sampled.cells[y * sampled.width + x];
      const matched = nearestColor(color, palette);
      const hex = rgbToHex(matched);
      const entry = colorMap.get(hex) || { color: matched, count: 0 };
      entry.count += 1;
      colorMap.set(hex, entry);
      cells.push({ x, y, color: matched, hex });
    }
  }

  const paletteEntries = [...colorMap.entries()]
    .map(([hex, value]) => ({
      hex,
      rgb: value.color,
      count: value.count,
    }))
    .sort((left, right) => right.count - left.count)
    .map((item, index) => ({
      ...item,
      symbol: paletteSymbols[index] || `C${index + 1}`,
    }));

  const symbolMap = new Map(paletteEntries.map((item) => [item.hex, item.symbol]));
  for (const cell of cells) {
    cell.symbol = symbolMap.get(cell.hex);
  }

  return { width: sampled.width, height: sampled.height, cells, paletteEntries };
}

function drawBead(x, y, cellSize, fill, beadRatio) {
  const activeContext = this;
  const radius = (cellSize * beadRatio) / 2;
  const centerX = x + cellSize / 2;
  const centerY = y + cellSize / 2;

  activeContext.beginPath();
  activeContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  activeContext.fillStyle = fill;
  activeContext.fill();

  activeContext.beginPath();
  activeContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  activeContext.lineWidth = Math.max(0.8, cellSize * 0.06);
  activeContext.strokeStyle = "rgba(22, 16, 12, 0.2)";
  activeContext.stroke();

  activeContext.beginPath();
  activeContext.arc(centerX - radius * 0.25, centerY - radius * 0.28, radius * 0.38, 0, Math.PI * 2);
  activeContext.fillStyle = "rgba(255,255,255,0.18)";
  activeContext.fill();
}

function renderPattern(targetContext, canvasSize) {
  const pattern = state.renderData;
  targetContext.clearRect(0, 0, canvasSize, canvasSize);

  if (!pattern) {
    targetContext.fillStyle = "#f1e8dc";
    targetContext.fillRect(0, 0, canvasSize, canvasSize);
    targetContext.fillStyle = "#7b6e64";
    targetContext.textAlign = "center";
    targetContext.font = `600 ${Math.round(canvasSize * 0.03)}px Avenir Next`;
    targetContext.fillText("上传一张图片开始", canvasSize / 2, canvasSize / 2);
    return;
  }

  const padding = canvasSize * 0.035;
  const usableWidth = canvasSize - padding * 2;
  const usableHeight = canvasSize - padding * 2;
  const cellSize = Math.min(usableWidth / pattern.width, usableHeight / pattern.height);
  const offsetX = (canvasSize - pattern.width * cellSize) / 2;
  const offsetY = (canvasSize - pattern.height * cellSize) / 2;
  const beadRatio = state.beadSize / 100;

  targetContext.fillStyle = "#fffaf4";
  targetContext.fillRect(0, 0, canvasSize, canvasSize);

  if (state.mode === "preview") {
    for (const cell of pattern.cells) {
      drawBead.call(
        targetContext,
        offsetX + cell.x * cellSize,
        offsetY + cell.y * cellSize,
        cellSize,
        cell.hex,
        beadRatio
      );
    }
  } else {
    targetContext.fillStyle = "#fffaf4";
    targetContext.fillRect(offsetX, offsetY, pattern.width * cellSize, pattern.height * cellSize);

    for (const cell of pattern.cells) {
      const x = offsetX + cell.x * cellSize;
      const y = offsetY + cell.y * cellSize;
      targetContext.fillStyle = cell.hex;
      targetContext.globalAlpha = state.mode === "pattern" ? 0.92 : 0.18;
      targetContext.fillRect(x, y, cellSize, cellSize);
      targetContext.globalAlpha = 1;

      if (state.mode === "numbered") {
        targetContext.fillStyle = "#2a221d";
        targetContext.font = `${Math.max(10, cellSize * 0.34)}px Avenir Next`;
        targetContext.textAlign = "center";
        targetContext.textBaseline = "middle";
        targetContext.fillText(cell.symbol, x + cellSize / 2, y + cellSize / 2 + 1);
      }
    }
  }

  if (state.showGrid || state.mode !== "preview") {
    targetContext.strokeStyle = "rgba(28, 21, 17, 0.16)";
    targetContext.lineWidth = Math.max(1, canvasSize / 960);
    for (let x = 0; x <= pattern.width; x += 1) {
      const lineX = offsetX + x * cellSize;
      targetContext.beginPath();
      targetContext.moveTo(lineX, offsetY);
      targetContext.lineTo(lineX, offsetY + pattern.height * cellSize);
      targetContext.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      const lineY = offsetY + y * cellSize;
      targetContext.beginPath();
      targetContext.moveTo(offsetX, lineY);
      targetContext.lineTo(offsetX + pattern.width * cellSize, lineY);
      targetContext.stroke();
    }
  }
}

function renderCanvas() {
  renderPattern(ctx, CANVAS_SIZE);
}

function renderPalette() {
  const pattern = state.renderData;
  if (!pattern) {
    refs.beadCount.textContent = "0";
    refs.paletteCount.textContent = "0";
    refs.paletteList.innerHTML = '<p class="empty-state">上传图片后生成颜色清单。</p>';
    return;
  }

  refs.beadCount.textContent = String(pattern.cells.length);
  refs.paletteCount.textContent = String(pattern.paletteEntries.length);
  refs.paletteList.innerHTML = pattern.paletteEntries
    .map(
      (item) => `
        <div class="palette-item">
          <span class="swatch" style="background:${item.hex}"></span>
          <div>
            <span class="palette-code">${item.symbol} · ${item.hex}</span>
            <span class="palette-meta">RGB ${item.rgb.join(", ")}</span>
          </div>
          <span class="palette-count">${item.count}</span>
        </div>
      `
    )
    .join("");
}

function rerender() {
  if (!state.image) {
    renderCanvas();
    renderPalette();
    return;
  }

  state.renderData = buildPattern();
  renderCanvas();
  renderPalette();
}

function updateLabels() {
  refs.gridSizeValue.textContent = String(state.gridSize);
  refs.colorCountValue.textContent = String(state.colorCount);
  refs.beadSizeValue.textContent = `${state.beadSize}%`;
}

function setControlState(enabled) {
  refs.downloadBtn.disabled = !enabled;
  refs.resetBtn.disabled = !enabled;
}

function openFollowModal() {
  refs.modalCopy.textContent = `我是上海女摄${XHS_NAME}，小红书号 ${XHS_HANDLE}。如果你做出了好看的图，欢迎带图来找我。`;
  refs.followModal.hidden = false;
}

function closeFollowModal() {
  refs.followModal.hidden = true;
}

async function loadImage(file) {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  state.objectUrl = URL.createObjectURL(file);

  const image = new Image();
  image.decoding = "async";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = state.objectUrl;
  });

  state.image = image;
  refs.imageMeta.textContent = `${file.name} · ${image.width} × ${image.height}`;
  setControlState(true);
  rerender();
}

function resetControls() {
  state.mode = "pattern";
  state.showGrid = true;
  state.cropSquare = true;
  state.gridSize = 64;
  state.colorCount = 16;
  state.beadSize = 82;
  state.exportScale = 2;

  refs.modeSelect.value = state.mode;
  refs.exportScale.value = String(state.exportScale);
  refs.showGrid.checked = state.showGrid;
  refs.cropSquare.checked = state.cropSquare;
  refs.gridSize.value = String(state.gridSize);
  refs.colorCount.value = String(state.colorCount);
  refs.beadSize.value = String(state.beadSize);
  updateLabels();
  rerender();
}

refs.imageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    await loadImage(file);
  } catch (error) {
    refs.imageMeta.textContent = "图片读取失败，请换一张试试。";
    console.error(error);
  }
});

refs.gridSize.addEventListener("input", (event) => {
  state.gridSize = Number(event.target.value);
  updateLabels();
  rerender();
});

refs.colorCount.addEventListener("input", (event) => {
  state.colorCount = Number(event.target.value);
  updateLabels();
  rerender();
});

refs.beadSize.addEventListener("input", (event) => {
  state.beadSize = Number(event.target.value);
  updateLabels();
  renderCanvas();
});

refs.modeSelect.addEventListener("change", (event) => {
  state.mode = event.target.value;
  renderCanvas();
});

refs.exportScale.addEventListener("change", (event) => {
  state.exportScale = Number(event.target.value);
});

refs.cropSquare.addEventListener("change", (event) => {
  state.cropSquare = event.target.checked;
  rerender();
});

refs.showGrid.addEventListener("change", (event) => {
  state.showGrid = event.target.checked;
  renderCanvas();
});

refs.downloadBtn.addEventListener("click", () => {
  if (!state.renderData) {
    return;
  }

  const exportCanvas = document.createElement("canvas");
  const exportSize = CANVAS_SIZE * state.exportScale;
  exportCanvas.width = exportSize;
  exportCanvas.height = exportSize;
  const exportContext = exportCanvas.getContext("2d");
  renderPattern(exportContext, exportSize);

  const link = document.createElement("a");
  link.href = exportCanvas.toDataURL("image/png");
  link.download = `pin-beads-${state.mode}-${state.exportScale}x.png`;
  link.click();
  openFollowModal();
});

refs.resetBtn.addEventListener("click", resetControls);
refs.closeModalBtn.addEventListener("click", closeFollowModal);
refs.dismissModalBtn.addEventListener("click", closeFollowModal);
refs.followModal.addEventListener("click", (event) => {
  if (event.target === refs.followModal) {
    closeFollowModal();
  }
});
refs.copyHandleBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(XHS_HANDLE);
    refs.copyHandleBtn.textContent = "已复制";
    window.setTimeout(() => {
      refs.copyHandleBtn.textContent = "复制账号";
    }, 1600);
  } catch (error) {
    refs.copyHandleBtn.textContent = "复制失败";
    window.setTimeout(() => {
      refs.copyHandleBtn.textContent = "复制账号";
    }, 1600);
  }
});

updateLabels();
setupCanvasResolution();
renderCanvas();

window.addEventListener("resize", () => {
  setupCanvasResolution();
  renderCanvas();
});
