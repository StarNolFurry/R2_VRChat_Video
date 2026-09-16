# R2 Video Worker

基于 Cloudflare Worker + R2 + KV 构建的视频托管服务，用于 VRChat 房间播放器。

## 功能

| 路由 | 说明 |
|------|------|
| `GET /` | Nginx 伪装页面（对搜索引擎/扫描器友好） |
| `GET /<ADMIN_URL>` | 管理后台登录页 |
| `POST /<ADMIN_URL>` | 提交密码 → 进入管理后台 |
| `GET /video?hash=<hash>` | 播放/下载视频（支持 Range 请求，VRChat 友好） |
| `GET  /api/admin/files` | 列出所有文件 |
| `POST /api/admin/upload` | 上传视频 |
| `DELETE /api/admin/file?hash=<hash>` | 删除文件 |

## 准备工作

1. 安装 Wrangler CLI：
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. 创建 R2 存储桶：
   ```bash
   wrangler r2 bucket create your-video-bucket
   ```

3. 创建 KV 命名空间：
   ```bash
   wrangler kv namespace create video-index
   ```

## 配置

编辑 `wrangler.toml`，替换以下占位符：

```toml
[[r2_buckets]]
bucket_name = "your-video-bucket"    # ← 替换为你的 R2 桶名

[[kv_namespaces]]
id = "your-kv-namespace-id"          # ← 替换为你的 KV namespace ID

[vars]
ADMIN_URL = "/your-secret-admin-path" # ← 修改成你想要的后台路径
```

## 设置密钥环境变量

```bash
wrangler secret put ADMIN_PASS
# （粘贴你的管理密码）

wrangler secret put SESSION_SECRET
# （粘贴一段随机长字符串，用于 HMAC 签名 Cookie）
```

## 部署

```bash
npm install
npm run deploy
```

部署完成后访问：
- `https://your-worker.your-subdomain.workers.dev/` → Nginx 伪装页
- `https://your-worker.your-subdomain.workers.dev/<ADMIN_URL>` → 管理后台
- `https://your-worker.your-subdomain.workers.dev/video?hash=xxxxx` → 视频直链

## 本地开发

```bash
npm run dev
```

## VRChat 集成

VRChat 的房间播放器支持 HTTP 直链播放。上传视频后，在管理后台点击预览/复制 Hash，然后在 VRChat 中填入：

```
https://your-worker.your-subdomain.workers.dev/video?hash=<你的视频hash>
```

服务端已开启 CORS（R2 默认）和 Range 请求支持，可以正常随机播放/拖动进度条。

## 注意事项

- Workers 免费计划 body 限制约 100MB。超过此大小的视频需要考虑使用 R2 presigned URL 直传或 multipart upload。
- 请妥善保管 `ADMIN_URL` 路径和密码，ADMIN_URL 是隐性安全措施，不是强鉴权。
- `SESSION_SECRET` 泄露后可伪造登录 Cookie，务必保密。
