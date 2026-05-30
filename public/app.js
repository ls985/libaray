const DEFAULT_ENDPOINT = "https://wechat.v2.traceint.com/index.php/graphql/";
const DEFAULT_ORIGIN = "https://web.traceint.com";
const DEFAULT_REFERER = "https://web.traceint.com/";
const CONFIG_KEY = "igotolib.mobile.config.v1";

const state = {
  demo: false,
  libs: [],
  selectedFloor: "",
  selectedLib: null,
  layout: null,
  pickedSeat: null,
};

const $ = (id) => document.getElementById(id);

const el = {
  endpointInput: $("endpointInput"),
  cookieInput: $("cookieInput"),
  originInput: $("originInput"),
  refererInput: $("refererInput"),
  uaInput: $("uaInput"),
  configState: $("configState"),
  saveConfigBtn: $("saveConfigBtn"),
  clearConfigBtn: $("clearConfigBtn"),
  loadLibsBtn: $("loadLibsBtn"),
  demoBtn: $("demoBtn"),
  floorChips: $("floorChips"),
  libList: $("libList"),
  libCount: $("libCount"),
  selectedLib: $("selectedLib"),
  modeSelect: $("modeSelect"),
  seatGrid: $("seatGrid"),
  pickedSeat: $("pickedSeat"),
  reserveBtn: $("reserveBtn"),
  refreshLayoutBtn: $("refreshLayoutBtn"),
  logBox: $("logBox"),
  clearLogBtn: $("clearLogBtn"),
};

function log(message, data) {
  const time = new Date().toLocaleTimeString();
  const detail = data ? `\n${JSON.stringify(data, null, 2)}` : "";
  el.logBox.textContent = `[${time}] ${message}${detail}\n\n${el.logBox.textContent}`;
}

async function api(path, body, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.detail = payload.detail;
    throw error;
  }
  return payload;
}

function loadLocalConfig() {
  try {
    return {
      endpoint: DEFAULT_ENDPOINT,
      origin: DEFAULT_ORIGIN,
      referer: DEFAULT_REFERER,
      userAgent: navigator.userAgent,
      cookie: "",
      ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"),
    };
  } catch {
    return {
      endpoint: DEFAULT_ENDPOINT,
      origin: DEFAULT_ORIGIN,
      referer: DEFAULT_REFERER,
      userAgent: navigator.userAgent,
      cookie: "",
    };
  }
}

function saveLocalConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function clearLocalConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function authPayload() {
  return loadLocalConfig();
}

function cookiePreview(cookie) {
  return cookie ? `${cookie.slice(0, 18)}...` : "";
}

function normalizeFloor(floor) {
  return String(floor || "未分层").trim() || "未分层";
}

function seatFree(seat) {
  const value = String(seat?.status ?? seat?.seat_status ?? "").toLowerCase();
  return ["", "0", "false", "free", "idle", "available"].includes(value);
}

function renderFloors() {
  const floors = [...new Set(state.libs.map((lib) => normalizeFloor(lib.lib_floor)))];
  if (!state.selectedFloor && floors.length) state.selectedFloor = floors[0];
  el.floorChips.className = floors.length ? "chips" : "chips empty";
  el.floorChips.textContent = "";

  if (!floors.length) {
    el.floorChips.textContent = "暂无楼层";
    return;
  }

  for (const floor of floors) {
    const chip = document.createElement("button");
    chip.className = `chip ${floor === state.selectedFloor ? "active" : ""}`;
    chip.textContent = floor;
    chip.addEventListener("click", () => {
      state.selectedFloor = floor;
      state.selectedLib = null;
      state.layout = null;
      state.pickedSeat = null;
      renderAll();
    });
    el.floorChips.appendChild(chip);
  }
}

function renderLibs() {
  const libs = state.libs.filter((lib) => normalizeFloor(lib.lib_floor) === state.selectedFloor);
  el.libCount.textContent = `${state.libs.length} 个区域`;
  el.libList.textContent = "";

  if (!libs.length) {
    el.libList.innerHTML = `<div class="empty">当前楼层暂无区域</div>`;
    return;
  }

  for (const lib of libs) {
    const rt = lib.lib_rt || {};
    const item = document.createElement("div");
    item.className = `lib-item ${state.selectedLib?.lib_id === lib.lib_id ? "active" : ""}`;
    item.innerHTML = `
      <div class="lib-title">
        <span>${escapeHtml(lib.lib_name || `区域 ${lib.lib_id}`)}</span>
        <span>${lib.is_open ? "开放" : "关闭"}</span>
      </div>
      <div class="lib-meta">
        ID ${lib.lib_id} · ${escapeHtml(normalizeFloor(lib.lib_floor))}
        · 可用 ${rt.seats_has ?? "-"} / 总 ${rt.seats_total ?? "-"}
      </div>
    `;
    item.addEventListener("click", async () => {
      state.selectedLib = lib;
      state.layout = null;
      state.pickedSeat = null;
      renderAll();
      await loadLayout();
    });
    el.libList.appendChild(item);
  }
}

function renderSelection() {
  if (!state.selectedLib) {
    el.selectedLib.textContent = "未选择区域";
  } else {
    el.selectedLib.textContent = `${state.selectedLib.lib_floor || ""} · ${state.selectedLib.lib_name} · libId=${state.selectedLib.lib_id}`;
  }

  if (!state.pickedSeat) {
    el.pickedSeat.textContent = "未选择座位";
    el.reserveBtn.disabled = true;
  } else {
    el.pickedSeat.textContent = `已选座位：${state.pickedSeat.name || state.pickedSeat.key} · key=${state.pickedSeat.key}`;
    el.reserveBtn.disabled = false;
  }

  el.refreshLayoutBtn.disabled = !state.selectedLib;
}

function renderSeats() {
  const layout = state.layout;
  el.seatGrid.textContent = "";

  if (!layout?.seats?.length) {
    el.seatGrid.className = "seat-grid empty";
    el.seatGrid.textContent = state.selectedLib ? "暂无座位数据" : "选择区域后加载座位";
    return;
  }

  const maxX = Number(layout.max_x || Math.max(...layout.seats.map((seat) => Number(seat.x || 1))));
  const maxY = Number(layout.max_y || Math.max(...layout.seats.map((seat) => Number(seat.y || 1))));
  const seatMap = new Map(layout.seats.map((seat) => [`${seat.x}:${seat.y}`, seat]));

  el.seatGrid.className = "seat-grid";
  el.seatGrid.style.gridTemplateColumns = `repeat(${maxX}, minmax(46px, 1fr))`;

  for (let y = 1; y <= maxY; y += 1) {
    for (let x = 1; x <= maxX; x += 1) {
      const seat = seatMap.get(`${x}:${y}`);
      const button = document.createElement("button");
      if (!seat) {
        button.className = "seat blank";
        button.disabled = true;
        el.seatGrid.appendChild(button);
        continue;
      }

      const free = seatFree(seat);
      const picked = state.pickedSeat?.key === seat.key;
      button.className = `seat ${free ? "free" : "busy"} ${picked ? "picked" : ""}`;
      button.textContent = seat.name || seat.key || `${x}-${y}`;
      button.disabled = !free;
      button.title = `x=${x}, y=${y}, key=${seat.key}, status=${seat.status ?? seat.seat_status ?? ""}`;
      button.addEventListener("click", () => {
        state.pickedSeat = seat;
        renderAll();
      });
      el.seatGrid.appendChild(button);
    }
  }
}

function renderAll() {
  renderFloors();
  renderLibs();
  renderSelection();
  renderSeats();
}

async function loadConfig() {
  const config = loadLocalConfig();
  el.endpointInput.value = config.endpoint || DEFAULT_ENDPOINT;
  el.originInput.value = config.origin || DEFAULT_ORIGIN;
  el.refererInput.value = config.referer || DEFAULT_REFERER;
  el.uaInput.value = config.userAgent || navigator.userAgent;
  el.cookieInput.value = config.cookie || "";
  el.configState.textContent = config.cookie ? `本机已保存 ${cookiePreview(config.cookie)}` : "本机未保存 Cookie";
}

async function saveConfig() {
  const config = {
    endpoint: el.endpointInput.value.trim() || DEFAULT_ENDPOINT,
    cookie: el.cookieInput.value.trim(),
    origin: el.originInput.value.trim() || DEFAULT_ORIGIN,
    referer: el.refererInput.value.trim() || DEFAULT_REFERER,
    userAgent: el.uaInput.value.trim() || navigator.userAgent,
  };
  saveLocalConfig(config);
  const payload = await api("/api/config", config);
  el.configState.textContent = payload.config.hasCookie ? `本机已保存 ${payload.config.cookiePreview}` : "本机未保存 Cookie";
  state.demo = false;
  log("配置已保存到当前浏览器；服务端不落盘保存 Cookie");
}

async function loadLibs() {
  const path = state.demo ? "/api/demo/libs" : "/api/libs";
  const payload = await api(path, { auth: authPayload() });
  state.libs = payload.libs || [];
  state.selectedFloor = "";
  state.selectedLib = null;
  state.layout = null;
  state.pickedSeat = null;
  renderAll();
  log(`已加载 ${state.libs.length} 个区域`);
}

async function loadLayout() {
  if (!state.selectedLib) return;
  const path = state.demo ? "/api/demo/layout" : "/api/layout";
  const payload = await api(path, {
    libId: state.selectedLib.lib_id,
    mode: el.modeSelect.value,
    auth: authPayload(),
  });
  state.layout = payload.layout || {};
  state.pickedSeat = null;
  renderAll();
  log(`已加载座位布局：${state.selectedLib.lib_name}`, {
    seats_total: state.layout.seats_total,
    seats_used: state.layout.seats_used,
    seats_booking: state.layout.seats_booking,
  });
}

async function reservePickedSeat() {
  if (!state.selectedLib || !state.pickedSeat) return;
  const path = state.demo ? "/api/demo/reserve" : "/api/reserve";
  const payload = await api(path, {
    libId: state.selectedLib.lib_id,
    seatKey: state.pickedSeat.key,
    mode: el.modeSelect.value,
    auth: authPayload(),
  });
  log("预约请求已提交", payload.result);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  el.saveConfigBtn.addEventListener("click", () => saveConfig().catch(reportError));
  el.clearConfigBtn.addEventListener("click", () => {
    clearLocalConfig();
    loadConfig().then(() => log("已清除当前浏览器里的配置")).catch(reportError);
  });
  el.loadLibsBtn.addEventListener("click", () => loadLibs().catch(reportError));
  el.refreshLayoutBtn.addEventListener("click", () => loadLayout().catch(reportError));
  el.reserveBtn.addEventListener("click", () => reservePickedSeat().catch(reportError));
  el.modeSelect.addEventListener("change", () => {
    if (state.selectedLib) loadLayout().catch(reportError);
  });
  el.demoBtn.addEventListener("click", async () => {
    state.demo = true;
    el.configState.textContent = "演示模式";
    await loadLibs();
  });
  el.clearLogBtn.addEventListener("click", () => {
    el.logBox.textContent = "";
  });
}

function reportError(error) {
  log(`错误：${error.message}`, error.detail);
}

bindEvents();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((error) => log(`Service Worker 注册失败：${error.message}`));
}
loadConfig().then(renderAll).catch(reportError);
