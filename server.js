import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_ENDPOINT =
  process.env.TRACEINT_GRAPHQL_ENDPOINT ||
  "https://wechat.v2.traceint.com/index.php/graphql/";
const DEFAULT_WECHAT_OAUTH_URL =
  process.env.WECHAT_OAUTH_URL ||
  "https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx2996d437cd442527&redirect_uri=https%3A%2F%2Fwechat.v2.traceint.com%2Findex.php%2Fgraphql%2F&response_type=code&scope=snsapi_userinfo&state=1#wechat_redirect";

const DEFAULT_HEADERS = {
  Origin: "https://web.traceint.com",
  Referer: "https://web.traceint.com/",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger",
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const queries = {
  libs: {
    operationName: "list",
    query: `query list {
  userAuth {
    reserve {
      libs(libType: -1) {
        lib_id
        lib_floor
        is_open
        lib_name
        lib_type
        lib_group_id
        lib_comment
        lib_rt {
          seats_total
          seats_used
          seats_booking
          seats_has
          reserve_ttl
          open_time_str
          close_time_str
          advance_booking
        }
      }
      libGroups { id group_name }
      reserve { isRecordUser }
    }
    record {
      libs {
        lib_id
        lib_floor
        is_open
        lib_name
        lib_type
        lib_group_id
        lib_comment
        lib_color_name
        lib_rt {
          seats_total
          seats_used
          seats_booking
          seats_has
          reserve_ttl
          open_time_str
          close_time_str
          advance_booking
        }
      }
    }
    rule { signRule }
  }
}`,
  },
  reserveLayout: (libId) => ({
    operationName: "libLayout",
    query: `query libLayout($libId: Int, $libType: Int) {
  userAuth {
    reserve {
      libs(libType: $libType, libId: $libId) {
        lib_id
        is_open
        lib_floor
        lib_name
        lib_type
        lib_layout {
          seats_total
          seats_booking
          seats_used
          max_x
          max_y
          seats {
            x
            y
            key
            type
            name
            seat_status
            status
          }
        }
      }
    }
  }
}`,
    variables: { libId: Number(libId), libType: -1 },
  }),
  prereserveLayout: (libId) => ({
    operationName: "libLayout",
    query: `query libLayout($libId: Int!) {
  userAuth {
    prereserve {
      libLayout(libId: $libId) {
        max_x
        max_y
        seats_booking
        seats_total
        seats_used
        seats {
          key
          name
          seat_status
          status
          type
          x
          y
        }
      }
    }
  }
}`,
    variables: { libId: Number(libId) },
  }),
  reserveSeat: (libId, seatKey, captcha = "", captchaCode = "") => ({
    operationName: "reserueSeat",
    query: `mutation reserueSeat($libId: Int!, $seatKey: String!, $captchaCode: String, $captcha: String!) {
  userAuth {
    reserve {
      reserueSeat(
        libId: $libId
        seatKey: $seatKey
        captchaCode: $captchaCode
        captcha: $captcha
      )
    }
  }
}`,
    variables: {
      libId: Number(libId),
      seatKey: String(seatKey),
      captchaCode,
      captcha,
    },
  }),
  prereserveSave: (libId, seatKey, captcha = "", captchaCode = "") => ({
    operationName: "save",
    query: `mutation save($key: String!, $libid: Int!, $captchaCode: String, $captcha: String) {
  userAuth {
    prereserve {
      save(key: $key, libId: $libid, captcha: $captcha, captchaCode: $captchaCode)
    }
  }
}`,
    variables: {
      key: String(seatKey),
      libid: Number(libId),
      captchaCode,
      captcha,
    },
  }),
};

const demo = {
  libs: [
    {
      lib_id: 101,
      lib_floor: "1F",
      lib_name: "一楼自习区",
      is_open: 1,
      lib_rt: { seats_total: 20, seats_has: 8, seats_used: 9, seats_booking: 3 },
    },
    {
      lib_id: 201,
      lib_floor: "2F",
      lib_name: "二楼北区",
      is_open: 1,
      lib_rt: { seats_total: 24, seats_has: 11, seats_used: 8, seats_booking: 5 },
    },
    {
      lib_id: 301,
      lib_floor: "3F",
      lib_name: "三楼静音区",
      is_open: 0,
      lib_rt: { seats_total: 16, seats_has: 0, seats_used: 16, seats_booking: 0 },
    },
  ],
  layout(libId) {
    const max_x = 6;
    const max_y = 5;
    const seats = [];
    for (let y = 1; y <= max_y; y += 1) {
      for (let x = 1; x <= max_x; x += 1) {
        if ((x === 3 && y === 3) || (x === 4 && y === 3)) continue;
        const busy = (x + y + Number(libId)) % 4 === 0;
        seats.push({
          x,
          y,
          key: `${libId}-${y}-${x}`,
          name: `${y}${String(x).padStart(2, "0")}`,
          type: "seat",
          status: busy ? 1 : 0,
          seat_status: busy ? 1 : 0,
        });
      }
    }
    return {
      max_x,
      max_y,
      seats_total: seats.length,
      seats_used: seats.filter((seat) => !isFreeSeat(seat)).length,
      seats_booking: 0,
      seats,
    };
  },
};

function safeConfig(config) {
  return {
    endpoint: config.endpoint,
    headers: {
      Origin: config.headers?.Origin || "",
      Referer: config.headers?.Referer || "",
      "User-Agent": config.headers?.["User-Agent"] || "",
    },
    hasCookie: Boolean(config.cookie),
    cookiePreview: config.cookie ? `${config.cookie.slice(0, 18)}...` : "",
  };
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

function clientConfigFromBody(body) {
  const auth = body?.auth || {};
  return {
    endpoint: auth.endpoint || DEFAULT_ENDPOINT,
    cookie: auth.cookie || "",
    headers: {
      ...DEFAULT_HEADERS,
      Origin: auth.origin || auth.headers?.Origin || DEFAULT_HEADERS.Origin,
      Referer: auth.referer || auth.headers?.Referer || DEFAULT_HEADERS.Referer,
      "User-Agent": auth.userAgent || auth.headers?.["User-Agent"] || DEFAULT_HEADERS["User-Agent"],
    },
  };
}

function cookieFromSetCookie(headers) {
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")]
        : [];
  return raw
    .flatMap((line) => String(line).split(/,(?=\s*[\w.-]+=)/))
    .map((line) => line.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

export function sendError(res, error) {
  const status = Number(error.status || 500);
  sendJson(res, status, {
    ok: false,
    error: error.message || "Internal server error",
    detail: error.detail,
  });
}

async function graphQL(body, clientConfig) {
  const config = clientConfig || { endpoint: DEFAULT_ENDPOINT, headers: DEFAULT_HEADERS, cookie: "" };
  if (!config.cookie) {
    const error = new Error("Cookie is not configured. Save a captured Cookie in this browser, or use demo mode.");
    error.status = 400;
    throw error;
  }

  const response = await fetch(config.endpoint || DEFAULT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      ...DEFAULT_HEADERS,
      ...(config.headers || {}),
      Cookie: config.cookie,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const error = new Error(`GraphQL returned non-JSON response: HTTP ${response.status}`);
    error.status = 502;
    error.detail = text.slice(0, 600);
    throw error;
  }

  if (!response.ok || data.errors) {
    const error = new Error(`GraphQL request failed: HTTP ${response.status}`);
    error.status = 502;
    error.detail = data;
    throw error;
  }
  return data;
}

function normalizeLibs(payload) {
  const userAuth = payload?.data?.userAuth || {};
  const reserveLibs = userAuth.reserve?.libs || [];
  const recordLibs = userAuth.record?.libs || [];
  const byId = new Map();
  for (const lib of [...reserveLibs, ...recordLibs]) {
    if (lib?.lib_id != null && !byId.has(lib.lib_id)) byId.set(lib.lib_id, lib);
  }
  return [...byId.values()].sort((a, b) => {
    const floor = String(a.lib_floor || "").localeCompare(String(b.lib_floor || ""), "zh-Hans-CN");
    return floor || String(a.lib_name || "").localeCompare(String(b.lib_name || ""), "zh-Hans-CN");
  });
}

function normalizeLayout(payload, mode, libId) {
  if (mode === "prereserve") {
    return payload?.data?.userAuth?.prereserve?.libLayout || {};
  }
  const libs = payload?.data?.userAuth?.reserve?.libs || [];
  const lib = libs.find((item) => Number(item.lib_id) === Number(libId)) || libs[0] || {};
  return { ...(lib.lib_layout || {}), lib };
}

function isFreeSeat(seat) {
  const status = String(seat?.status ?? seat?.seat_status ?? "").toLowerCase();
  return ["0", "false", "free", "idle", "available", ""].includes(status);
}

export async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "igotolib-mobile-web", stateless: true });
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    return sendJson(res, 200, {
      ok: true,
      config: safeConfig({ endpoint: DEFAULT_ENDPOINT, headers: DEFAULT_HEADERS, cookie: "" }),
      stateless: true,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/oauth-url") {
    return sendJson(res, 200, { ok: true, url: DEFAULT_WECHAT_OAUTH_URL });
  }

  if (req.method === "POST" && url.pathname === "/api/oauth-cookie") {
    const body = await readJson(req);
    if (!body.url) {
      const error = new Error("url is required");
      error.status = 400;
      throw error;
    }

    const target = new URL(body.url);
    if (!["wechat.v2.traceint.com", "open.weixin.qq.com"].includes(target.hostname)) {
      const error = new Error("Only WeChat/Traceint OAuth callback URLs are accepted");
      error.status = 400;
      throw error;
    }

    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      headers: {
        ...DEFAULT_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const cookie = cookieFromSetCookie(response.headers);
    const location = response.headers.get("location") || "";
    return sendJson(res, 200, {
      ok: true,
      status: response.status,
      cookie,
      cookiePreview: cookie ? `${cookie.slice(0, 18)}...` : "",
      location,
      hasCookie: Boolean(cookie),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/config") {
    const body = await readJson(req);
    const config = {
      endpoint: body.endpoint || DEFAULT_ENDPOINT,
      cookie: body.cookie || "",
      headers: {
        Origin: body.origin || DEFAULT_HEADERS.Origin,
        Referer: body.referer || DEFAULT_HEADERS.Referer,
        "User-Agent": body.userAgent || DEFAULT_HEADERS["User-Agent"],
      },
    };
    return sendJson(res, 200, { ok: true, config: safeConfig(config), stateless: true });
  }

  if (req.method === "GET" && url.pathname === "/api/demo/libs") {
    return sendJson(res, 200, { ok: true, libs: demo.libs });
  }

  if (req.method === "POST" && url.pathname === "/api/demo/layout") {
    const body = await readJson(req);
    return sendJson(res, 200, { ok: true, layout: demo.layout(body.libId || 101) });
  }

  if (req.method === "POST" && url.pathname === "/api/demo/reserve") {
    const body = await readJson(req);
    return sendJson(res, 200, {
      ok: true,
      result: {
        demo: true,
        message: "demo reservation accepted",
        libId: body.libId,
        seatKey: body.seatKey,
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/libs") {
    const body = await readJson(req);
    const payload = await graphQL(queries.libs, clientConfigFromBody(body));
    return sendJson(res, 200, { ok: true, libs: normalizeLibs(payload), raw: payload });
  }

  if (req.method === "POST" && url.pathname === "/api/layout") {
    const body = await readJson(req);
    if (!body.libId) {
      const error = new Error("libId is required");
      error.status = 400;
      throw error;
    }
    const mode = body.mode === "prereserve" ? "prereserve" : "reserve";
    const payload = await graphQL(
      mode === "prereserve" ? queries.prereserveLayout(body.libId) : queries.reserveLayout(body.libId),
      clientConfigFromBody(body),
    );
    return sendJson(res, 200, { ok: true, layout: normalizeLayout(payload, mode, body.libId), raw: payload });
  }

  if (req.method === "POST" && url.pathname === "/api/reserve") {
    const body = await readJson(req);
    if (!body.libId || !body.seatKey) {
      const error = new Error("libId and seatKey are required");
      error.status = 400;
      throw error;
    }
    const mode = body.mode === "prereserve" ? "prereserve" : "reserve";
    const payload = await graphQL(
      mode === "prereserve"
        ? queries.prereserveSave(body.libId, body.seatKey, body.captcha, body.captchaCode)
        : queries.reserveSeat(body.libId, body.seatKey, body.captcha, body.captchaCode),
      clientConfigFromBody(body),
    );
    return sendJson(res, 200, { ok: true, result: payload });
  }

  sendJson(res, 404, { ok: false, error: "API route not found" });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const data = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

if (!process.env.VERCEL) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`igotolib-mobile-web listening on http://localhost:${PORT}`);
  });
}
