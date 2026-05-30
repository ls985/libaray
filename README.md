# 我去图书馆手机 Web / PWA 选座

这是一个零依赖 Node.js + PWA 原型，用网址替代 APK 壳完成手机端选座。

## 已实现

- 手机浏览器访问
- 可添加到手机桌面，像 App 一样打开
- Cookie / Endpoint / Header 只保存在当前浏览器 `localStorage`
- 后端无状态代理，不把 Cookie 写入服务器文件
- 加载图书馆区域
- 按 `lib_floor` 选择楼层
- 查看座位布局并选择具体座位
- 支持当日预约 `reserve.reserueSeat`
- 支持明日预约 `prereserve.save`
- 内置演示模式，无 Cookie 也能看完整流程

## 本地运行

```powershell
node server.js
```

浏览器打开：

```text
http://localhost:3000
```

手机同局域网访问时，把 `localhost` 换成电脑局域网 IP，例如：

```text
http://192.168.1.10:3000
```

## 手机端使用流程

1. 手机浏览器打开网址。
2. 可选：浏览器菜单里点“添加到主屏幕”。
3. 在“接口配置”里粘贴抓包得到的 `Cookie`。
4. 点击“保存配置”。
5. 点击“加载场馆”。
6. 选择楼层、区域、座位。
7. 选择预约模式：
   - `reserve`: 当天预约
   - `prereserve`: 明日预约/预选
8. 点击“提交预约”。

## 接口证据

接口字段来自现有 APK 字符串：

- GraphQL Endpoint: `https://wechat.v2.traceint.com/index.php/graphql/`
- 场馆列表: `userAuth.reserve.libs(libType: -1)`
- 座位布局: `userAuth.reserve.libs(...).lib_layout`
- 明日预约布局: `userAuth.prereserve.libLayout(libId: $libId)`
- 当日预约: `reserve.reserueSeat(libId, seatKey, captchaCode, captcha)`
- 明日预约: `prereserve.save(key, libId, captcha, captchaCode)`

## 部署建议

如果你希望手机只点一个公网链接，不需要电脑参与，把项目部署到 Render / Railway / VPS。

最短路径见：

```text
DEPLOY.md
```

当前项目没有第三方依赖，部署时只需要能运行 Node.js：

```text
node server.js
```

免费部署可以选：

- Render Web Service
- Railway
- Fly.io
- 自己的 VPS

如果使用 Vercel / Cloudflare Pages，需要改成对应 Serverless/Worker 形态。

## 安全边界

- Cookie 不写入服务端 `.data/config.json`。
- 每次真实请求时，前端把 Cookie 放在请求 body 的 `auth` 字段发给本服务端代理。
- 服务端只转发当前请求，不持久化。
- 如需清除本机 Cookie，点击页面里的“清除配置”。

## 后续可加功能

- 定时抢座：后端加计划任务，到点调用预约 mutation
- 多候选座位：按优先级自动尝试多个 `seatKey`
- Cookie 保活：周期性请求首页 GraphQL
- WebSocket 排队：接入 `wss://wechat.v2.traceint.com/ws?ns=prereserve/queue`
- 导入/导出配置：方便换手机或比赛演示
