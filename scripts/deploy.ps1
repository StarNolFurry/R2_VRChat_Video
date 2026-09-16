# Cloudflare Worker + R2 + KV 一键部署脚本 (Windows PowerShell)
# 依赖: wrangler (npm i -g wrangler)、已 wrangler login

$ErrorActionPreference = "Stop"

function Write-Step($msg)  { Write-Host "`n⚙  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ---------- 前置检查 ----------
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Write-Err "未找到 wrangler，请先执行: npm i -g wrangler && wrangler login" }
if (-not (Get-Command node   -ErrorAction SilentlyContinue)) { Write-Err "未找到 Node.js" }

$WranglerToml = "wrangler.toml"
if (-not (Test-Path $WranglerToml)) { Write-Err "未找到 wrangler.toml，请在项目根目录运行本脚本" }

# ---------- 交互式收集参数 ----------
Write-Host ""
Write-Host "═══ R2 Video Worker 一键部署 ═══" -ForegroundColor Green
Write-Host ""

$WorkerName  = Read-Host "  Worker 名称 (英文, 留空使用默认 r2-video-worker)"
if ([string]::IsNullOrWhiteSpace($WorkerName)) { $WorkerName = "r2-video-worker" }

$BucketName  = Read-Host "  R2 存储桶名称 (英文, 例如 video-bucket)"
if ([string]::IsNullOrWhiteSpace($BucketName)) { Write-Err "R2 桶名不能为空" }

$KvName      = Read-Host "  KV 命名空间名称 (英文, 例如 video-index)"
if ([string]::IsNullOrWhiteSpace($KvName)) { Write-Err "KV 命名空间不能为空" }

$AdminUrl    = Read-Host "  管理后台访问路径 (例如 /secret-admin, 默认 /admin)"
if ([string]::IsNullOrWhiteSpace($AdminUrl)) { $AdminUrl = "/admin" }
if (-not $AdminUrl.StartsWith("/")) { $AdminUrl = "/$AdminUrl" }

$AdminPass   = Read-Host "  管理后台密码" -AsSecureString
$AdminPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPass))
if ([string]::IsNullOrWhiteSpace($AdminPassPlain)) { Write-Err "密码不能为空" }

$SessionSecret = Read-Host "  SESSION_SECRET (直接回车自动生成随机值)"
if ([string]::IsNullOrWhiteSpace($SessionSecret)) {
  $SessionSecret = node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  Write-Ok "自动生成 SESSION_SECRET: $($SessionSecret.Substring(0,16))..."
}

# ---------- 创建 R2 + KV ----------
Write-Step "创建 R2 存储桶: $BucketName"
try { wrangler r2 bucket create $BucketName } catch { Write-Warn "R2 桶可能已存在，继续..." }

Write-Step "创建 KV 命名空间: $KvName"
$KvOutput = wrangler kv namespace create $KvName 2>&1 | Out-String
$KvId = ([regex]::Match($KvOutput, '\b[a-f0-9]{32}\b')).Value
if ([string]::IsNullOrWhiteSpace($KvId)) {
  Write-Warn "未能自动解析 KV ID，请手动输入 (在上面输出中找到 ID 行):"
  $KvId = Read-Host "  KV Namespace ID"
}
Write-Ok "KV Namespace ID: $KvId"

# ---------- 重写 wrangler.toml ----------
Write-Step "更新 wrangler.toml"
$Today = (Get-Date).ToString("yyyy-MM-dd")
@"
name = "$WorkerName"
main = "src/index.js"
compatibility_date = "$Today"

[[r2_buckets]]
binding = "VIDEOS_BUCKET"
bucket_name = "$BucketName"

[[kv_namespaces]]
binding = "VIDEO_INDEX"
id = "$KvId"

[vars]
ADMIN_URL = "$AdminUrl"
"@ | Set-Content -Path $WranglerToml -Encoding UTF8
Write-Ok "wrangler.toml 已生成"

# ---------- 安装依赖 ----------
if (-not (Test-Path "node_modules")) {
  Write-Step "安装依赖"
  npm install
}

# ---------- 部署 Worker ----------
Write-Step "部署 Worker..."
npm run deploy

# ---------- 写入 Secrets ----------
Write-Step "设置 Secret: ADMIN_PASS"
$AdminPassPlain | wrangler secret put ADMIN_PASS

Write-Step "设置 Secret: SESSION_SECRET"
$SessionSecret | wrangler secret put SESSION_SECRET

# ---------- 完成 ----------
Write-Host ""
Write-Ok "═══ 部署完成 ═══"
Write-Host ""
Write-Host "  Worker 名称:      $WorkerName" -ForegroundColor Cyan
Write-Host "  R2 存储桶:        $BucketName" -ForegroundColor Cyan
Write-Host "  KV 命名空间:      $KvName ($KvId)" -ForegroundColor Cyan
Write-Host "  管理后台路径:     $AdminUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "👉 访问地址请在 Cloudflare Dashboard → Workers 详情页查看 workers.dev 子域名。" -ForegroundColor Yellow
Write-Host "   典型格式: https://$WorkerName.<你的subdomain>.workers.dev$AdminUrl" -ForegroundColor Yellow
