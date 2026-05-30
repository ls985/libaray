# 部署成一个手机可直接点击的网址

目标：部署后得到一个公网链接，例如：

```text
https://igotolib-mobile-web.onrender.com
```

手机只需要打开这个链接即可使用，不需要电脑运行 `node server.js`。

## 最简单方案：Vercel 免费部署

### 1. 上传到 GitHub

当前项目已经推送到：

```text
https://github.com/ls985/libaray
```

### 2. Vercel 导入 GitHub 仓库

打开：

```text
https://vercel.com
```

按顺序：

1. 用 GitHub 登录 Vercel
2. Add New Project
3. Import `ls985/libaray`
4. Framework Preset 选择 `Other`
5. Build Command 留空或填 `npm install --omit=dev`
6. Output Directory 留空
7. Deploy

### 3. 得到公网链接

部署完成后，Vercel 会给一个链接：

```text
https://libaray-xxxx.vercel.app
```

把这个链接发到手机，手机点开即可使用。

## 手机使用

1. 打开 Render 给的链接。
2. 点“演示模式”确认页面正常。
3. 粘贴抓包得到的 Cookie。
4. 点“保存配置”。
5. 点“加载场馆”。
6. 选择楼层、区域、座位。
7. 点“提交预约”。

## 注意

- Cookie 只保存在手机浏览器本地。
- 服务端不保存 Cookie。
- Vercel Serverless 没有常驻进程，适合当前这种“网页 + API 代理”。

## 备选：Render / Docker

如果你以后有可用 Render 或 VPS，也可以继续用 `render.yaml` 或 Docker。

如果你有 VPS：

```bash
docker build -t igotolib-mobile-web .
docker run -d --name igotolib-mobile-web -p 3000:3000 igotolib-mobile-web
```

然后用反向代理绑定域名即可。
