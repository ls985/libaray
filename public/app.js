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
  sniperTimer: null,
  sniperRunning: false,
  sniperRound: 0,
};

const $ = (id) => document.getElementById(id);

const el = {
  endpointInput: $("endpointInput"),
  cookieInput: $("cookieInput"),
  originInput: $("originInput"),
  refererInput: $("refererInput"),
  uaInput: $("uaInput"),
  configState: $("configState"),
  copyOauthBtn: $("copyOauthBtn"),
  openOauthBtn: $("openOauthBtn"),
  oauthCallbackInput: $("oauthCallbackInput"),
  importOauthBtn: $("importOauthBtn"),
  saveConfigBtn: $("saveConfigBtn"),
  testCookieBtn: $("testCookieBtn"),
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
  sniperState: $("sniperState"),
  sniperFloorSelect: $("sniperFloorSelect"),
  sniperIntervalInput: $("sniperIntervalInput"),
  sniperSeatKeywordInput: $("sniperSeatKeywordInput"),
  startSniperBtn: $("startSniperBtn"),
  stopSniperBtn: $("stopSniperBtn"),
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

function extractCookie(input) {
  const text = String(input || "").trim();
  if (!text) return "";

  const cookieLine =
    text.match(/(?:^|\n|\r)\s*cookie\s*:\s*([^\r\n]+)/i) ||
    text.match(/cookie\s*:\s*([^'"\r\n]+)/i);
  if (cookieLine) return cleanupCookie(cookieLine[1]);

  const setCookieLines = [...text.matchAll(/(?:^|\n|\r)\s*set-cookie\s*:\s*([^\r\n]+)/gi)];
  if (setCookieLines.length) {
    return cleanupCookie(
      setCookieLines
        .map((match) => match[1].split(";")[0])
        .filter(Boolean)
        .join("; "),
    );
  }

  const inline = text.match(/((?:[\w.-]+=[^;\s]+;\s*)+[\w.-]+=[^;\s]+)/);
  if (inline) return cleanupCookie(inline[1]);

  return cleanupCookie(text);
}

function cleanupCookie(cookie) {
  return String(cookie || "")
    .replace(/^cookie\s*:\s*/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("; ")
    .replaceAll(/;{2,}/g, ";")
    .replaceAll(/\s*;\s*/g, "; ")
    .trim();
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
  renderSniperOptions();
}

function renderSniperOptions() {
  const floors = [...new Set(state.libs.map((lib) => normalizeFloor(lib.lib_floor)))];
  const current = el.sniperFloorSelect.value || state.selectedFloor;
  el.sniperFloorSelect.textContent = "";

  if (!floors.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "请先加载场馆";
    el.sniperFloorSelect.appendChild(option);
    el.startSniperBtn.disabled = true;
  } else {
    for (const floor of floors) {
      const option = document.createElement("option");
      option.value = floor;
      option.textContent = floor;
      if (floor === current) option.selected = true;
      el.sniperFloorSelect.appendChild(option);
    }
    el.startSniperBtn.disabled = state.sniperRunning;
  }

  el.stopSniperBtn.disabled = !state.sniperRunning;
  el.sniperState.textContent = state.sniperRunning ? `运行中 #${state.sniperRound}` : "未启动";
  el.sniperState.className = `badge ${state.sniperRunning ? "running" : ""}`;
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
  const extractedCookie = extractCookie(el.cookieInput.value);
  const config = {
    endpoint: el.endpointInput.value.trim() || DEFAULT_ENDPOINT,
    cookie: extractedCookie,
    origin: el.originInput.value.trim() || DEFAULT_ORIGIN,
    referer: el.refererInput.value.trim() || DEFAULT_REFERER,
    userAgent: el.uaInput.value.trim() || navigator.userAgent,
  };
  saveLocalConfig(config);
  const payload = await api("/api/config", config);
  el.configState.textContent = payload.config.hasCookie ? `本机已保存 ${payload.config.cookiePreview}` : "本机未保存 Cookie";
  el.cookieInput.value = extractedCookie;
  state.demo = false;
  log(`配置已保存到当前浏览器；Cookie 长度 ${extractedCookie.length}；服务端不落盘保存 Cookie`);
}

async function getOauthUrl() {
  const payload = await api("/api/oauth-url", null, "GET");
  return payload.url;
}

async function copyOauthUrl() {
  const url = await getOauthUrl();
  await navigator.clipboard.writeText(url);
  log("已复制微信授权链接。请在微信里打开它，完成跳转后复制最终链接回来。");
}

async function openOauthUrl() {
  const url = await getOauthUrl();
  window.open(url, "_blank", "noopener,noreferrer");
  log("已打开微信授权链接。如果当前不是微信浏览器，建议复制链接到微信里打开。");
}

async function importOauthCookie() {
  const callbackUrl = el.oauthCallbackInput.value.trim();
  if (!callbackUrl) {
    log("请先粘贴微信授权后跳转到的最终链接");
    return;
  }
  const payload = await api("/api/oauth-cookie", { url: callbackUrl });
  if (!payload.cookie) {
    log("授权链接没有返回 Cookie；请确认粘贴的是微信授权后包含 code 的最终跳转链接", payload);
    return;
  }

  const current = loadLocalConfig();
  const config = { ...current, cookie: payload.cookie };
  saveLocalConfig(config);
  el.cookieInput.value = payload.cookie;
  el.configState.textContent = `本机已保存 ${payload.cookiePreview}`;
  state.demo = false;
  log(`已从授权链接导入 Cookie：${payload.cookiePreview}`);
}

async function testCookie() {
  if (!loadLocalConfig().cookie) await saveConfig();
  const payload = await api("/api/libs", { auth: authPayload() });
  const libs = payload.libs || [];
  log(`Cookie 测试成功：加载到 ${libs.length} 个区域`);
  if (libs.length) {
    state.demo = false;
    state.libs = libs;
    state.selectedFloor = "";
    state.selectedLib = null;
    state.layout = null;
    state.pickedSeat = null;
    renderAll();
  }
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

async function fetchLayoutForLib(lib) {
  const path = state.demo ? "/api/demo/layout" : "/api/layout";
  const payload = await api(path, {
    libId: lib.lib_id,
    mode: el.modeSelect.value,
    auth: authPayload(),
  });
  return payload.layout || {};
}

async function reserveSeat(lib, seat) {
  const path = state.demo ? "/api/demo/reserve" : "/api/reserve";
  return api(path, {
    libId: lib.lib_id,
    seatKey: seat.key,
    mode: el.modeSelect.value,
    auth: authPayload(),
  });
}

async function reservePickedSeat() {
  if (!state.selectedLib || !state.pickedSeat) return;
  const payload = await reserveSeat(state.selectedLib, state.pickedSeat);
  log("预约请求已提交", payload.result);
}

function findFreeSeat(layout, keyword) {
  const seats = layout?.seats || [];
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  return seats.find((seat) => {
    if (!seatFree(seat)) return false;
    if (!normalizedKeyword) return true;
    const haystack = `${seat.name || ""} ${seat.key || ""} ${seat.x || ""}-${seat.y || ""}`.toLowerCase();
    return haystack.includes(normalizedKeyword);
  });
}

async function sniperTick() {
  if (!state.sniperRunning) return;
  state.sniperRound += 1;
  renderSniperOptions();

  const floor = el.sniperFloorSelect.value;
  const keyword = el.sniperSeatKeywordInput.value;
  const libs = state.libs.filter((lib) => normalizeFloor(lib.lib_floor) === floor && lib.is_open !== 0);

  if (!libs.length) {
    log(`闲时抢座：楼层 ${floor} 无开放区域`);
    scheduleNextSniperTick();
    return;
  }

  log(`闲时抢座第 ${state.sniperRound} 轮：扫描 ${floor}，${libs.length} 个区域`);

  for (const lib of libs) {
    if (!state.sniperRunning) return;
    try {
      const layout = await fetchLayoutForLib(lib);
      const seat = findFreeSeat(layout, keyword);
      if (!seat) {
        log(`未发现空位：${lib.lib_name}`);
        continue;
      }

      log(`发现空位，准备预约：${lib.lib_name} / ${seat.name || seat.key}`, {
        libId: lib.lib_id,
        seatKey: seat.key,
      });
      const result = await reserveSeat(lib, seat);
      stopSniper();
      state.selectedFloor = normalizeFloor(lib.lib_floor);
      state.selectedLib = lib;
      state.layout = layout;
      state.pickedSeat = seat;
      renderAll();
      log("闲时抢座已提交预约并停止监控", result.result);
      return;
    } catch (error) {
      log(`扫描失败：${lib.lib_name}：${error.message}`, error.detail);
    }
  }

  scheduleNextSniperTick();
}

function scheduleNextSniperTick() {
  if (!state.sniperRunning) return;
  const seconds = Math.max(2, Math.min(60, Number(el.sniperIntervalInput.value || 5)));
  state.sniperTimer = window.setTimeout(() => sniperTick().catch(reportError), seconds * 1000);
}

function startSniper() {
  if (state.sniperRunning) return;
  if (!state.libs.length) {
    log("请先加载场馆，再启动闲时抢座");
    return;
  }
  state.sniperRunning = true;
  state.sniperRound = 0;
  renderSniperOptions();
  log(`闲时抢座已启动：楼层 ${el.sniperFloorSelect.value}，间隔 ${el.sniperIntervalInput.value || 5} 秒`);
  sniperTick().catch(reportError);
}

function stopSniper() {
  if (state.sniperTimer) window.clearTimeout(state.sniperTimer);
  state.sniperTimer = null;
  state.sniperRunning = false;
  renderSniperOptions();
  log("闲时抢座已停止");
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
  el.copyOauthBtn.addEventListener("click", () => copyOauthUrl().catch(reportError));
  el.openOauthBtn.addEventListener("click", () => openOauthUrl().catch(reportError));
  el.importOauthBtn.addEventListener("click", () => importOauthCookie().catch(reportError));
  el.saveConfigBtn.addEventListener("click", () => saveConfig().catch(reportError));
  el.testCookieBtn.addEventListener("click", () => testCookie().catch(reportError));
  el.clearConfigBtn.addEventListener("click", () => {
    clearLocalConfig();
    loadConfig().then(() => log("已清除当前浏览器里的配置")).catch(reportError);
  });
  el.loadLibsBtn.addEventListener("click", () => loadLibs().catch(reportError));
  el.refreshLayoutBtn.addEventListener("click", () => loadLayout().catch(reportError));
  el.reserveBtn.addEventListener("click", () => reservePickedSeat().catch(reportError));
  el.startSniperBtn.addEventListener("click", () => startSniper());
  el.stopSniperBtn.addEventListener("click", () => stopSniper());
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
