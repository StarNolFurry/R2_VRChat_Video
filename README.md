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

---

## 🚀 一键部署（推荐）

将代码仓库 `https://github.com/StarNolFurry/R2_VRChat_Video` 导入 Cloudflare 自动部署。

### 方式一：Cloudflare Dashboard 连接 Git（最省心）

1. **Fork / 导入仓库**
   
   将本仓库 fork 到你自己的 GitHub 账号，或直接在 Cloudflare 内导入：
   ```
   https://github.com/StarNolFurry/R2_VRChat_Video
   ```

2. **在 Cloudflare Dashboard 创建 Worker 并绑定仓库**
   
   1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application**
   2. 选择 **Workers** → **Create Worker** → **Connect to Git**
   3. 选择你的 Git 提供商（GitHub），选中 fork 的仓库，点击 **Begin setup**
   4. Framework preset 选 **None**，构建命令留空，输出目录留空，点击 **Save and Deploy**

3. **创建并绑定 R2 存储桶 + KV 命名空间**
   
   部署完成后，在 Worker 详情页：
   
   - 进入 **Settings** → **Bindings** → **R2 Bucket Bindings** → **Add binding**
     - Variable name: `VIDEOS_BUCKET`
     - 点击 **Create new bucket**，命名任意（例如 `video-bucket`），创建后选中
   
   - 继续在 **Settings** → **Bindings** → **KV Namespace Bindings** → **Add binding**
     - Variable name: `VIDEO_INDEX`
     - 点击 **Create new namespace**，命名任意（例如 `video-index`），创建后选中

4. **设置环境变量（密钥）**
   
   在 Worker 详情页 → **Settings** → **Variables** → **Environment Variables**：
   
   | 变量名 | 类型 | 值 | 说明 |
   |--------|------|----|------|
   | `ADMIN_URL` | Plain text | `/your-secret-path` | 后台访问路径，改成你自己的随机字符串 |
   | `ADMIN_PASS` | Secret | （你的密码） | 管理后台登录密码 |
   | `SESSION_SECRET` | Secret | （随机长字符串） | 用于 HMAC 签名 Cookie，建议 64+ 字符 |

   > ⚠️ `ADMIN_PASS` 和 `SESSION_SECRET` 请务必标记为 **Secret**，不要写入 `wrangler.toml` 或 git 仓库。

5. **等待自动重新部署**
   
   变量保存后 Worker 会自动重新部署，部署日志显示 "Success" 即完成。

---

### 方式二：本地一键脚本（CLI 用户）

克隆仓库后运行对应的一键脚本，自动完成 `wrangler` 的全部创建 + 部署流程：

```bash
git clone https://github.com/StarNolFurry/R2_VRChat_Video
cd R2_VRChat_Video

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1

# macOS / Linux
bash scripts/deploy.sh
```

脚本会交互式询问 R2 桶名、KV 命名空间名、后台路径、密码等，全程自动完成，无需手动编辑 `wrangler.toml`。

---

## 🔧 手动部署（备选）

### 准备工作

1. 安装 Wrangler CLI：
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. 创建 R2 存储桶 + KV 命名空间：
   ```bash
   wrangler r2 bucket create your-video-bucket
   wrangler kv namespace create video-index
   ```

### 配置 `wrangler.toml`

替换以下占位符：

```toml
[[r2_buckets]]
bucket_name = "your-video-bucket"    # ← 替换为你的 R2 桶名

[[kv_namespaces]]
id = "your-kv-namespace-id"          # ← 替换为你的 KV namespace ID

[vars]
ADMIN_URL = "/your-secret-admin-path" # ← 修改成你想要的后台路径
```

### 设置密钥

```bash
wrangler secret put ADMIN_PASS
wrangler secret put SESSION_SECRET
```

### 部署

```bash
npm install
npm run deploy
```

---

## 部署完成后访问

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
