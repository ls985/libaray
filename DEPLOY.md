# 部署成一个手机可直接点击的网址

目标：部署后得到一个公网链接，例如：

```text
https://igotolib-mobile-web.onrender.com
```

手机只需要打开这个链接即可使用，不需要电脑运行 `node server.js`。

## 最简单方案：Render 免费部署

### 1. 上传到 GitHub

在当前目录初始化并提交：

```powershell
git init
git add .
git commit -m "init igotolib mobile web"
```

然后新建一个 GitHub 仓库，把代码推上去。

### 2. Render 创建 Web Service

打开：

```text
https://render.com
```

按顺序：

1. 登录 Render
2. New
3. Web Service
4. 选择刚才的 GitHub 仓库
5. Render 会读取 `render.yaml`
6. 确认创建

### 3. 得到公网链接

部署完成后，Render 会给一个链接：

```text
https://你的服务名.onrender.com
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
- Render 免费实例空闲后会休眠，第一次打开可能慢几十秒。
- 如果比赛演示需要稳定，建议提前打开一次链接唤醒。

## Docker 部署

如果你有 VPS：

```bash
docker build -t igotolib-mobile-web .
docker run -d --name igotolib-mobile-web -p 3000:3000 igotolib-mobile-web
```

然后用反向代理绑定域名即可。
