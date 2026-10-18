# 扫描仪接入

从登录页点击「我要扫描」，首次选择学校后保存在本机浏览器中。之后自动列出该校**已发布的试卷或讲义答题卡**，撤回发布后不再显示。点击答题卡会触发扫描仪，支持继续扫描多张、逐张预览和下载。

浏览器无法直接调用通用的 WIA / SANE / TWAIN 驱动，因此需在**连接扫描仪的计算机上**运行本机桥接服务（Windows 使用系统 WIA 驱动；Linux 需要安装并配置 SANE 的 `scanimage` 命令）。需安装 Node.js 22 或以上。

PowerShell：

```powershell
$env:SCANNER_ALLOWED_ORIGIN="https://你的InteSchool域名"
node scripts/scanner-bridge.mjs
```

Linux：

```sh
SCANNER_ALLOWED_ORIGIN=https://你的InteSchool域名 node scripts/scanner-bridge.mjs
```

测试时使用本地 Vite 前端地址作为来源，例如 `http://localhost:5173`。来源必须与浏览器地址栏中的网站来源（协议、域名、端口）完全一致。桥接仅监听 `127.0.0.1:17380`，不对局域网开放，不接收任意命令，禁止其他网页来源访问。首次连接时浏览器如提示访问本地网络，需允许。

扫描图像只返回到当前浏览器，并不会自动上传服务器、进行 OCR 或写入成绩。离开页面前请逐张下载；刷新或关闭页面会丢失未下载的结果。学校绑定只保存在当前浏览器，可在扫描页切换学校，不代表教师身份认证或学校权限授权。
