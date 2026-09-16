#!/usr/bin/env bash
# Cloudflare Worker + R2 + KV 一键部署脚本 (macOS / Linux)
# 依赖: wrangler (npm i -g wrangler)、已 wrangler login

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}ℹ${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ---------- 前置检查 ----------
command -v wrangler >/dev/null 2>&1 || err "未找到 wrangler，请先执行: npm i -g wrangler && wrangler login"
command -v node     >/dev/null 2>&1 || err "未找到 Node.js"

WRANGLER_TOML="wrangler.toml"
[[ -f "$WRANGLER_TOML" ]] || err "未找到 wrangler.toml，请在项目根目录运行本脚本"

# 如果仓库里已有 .env / .wrangler 痕迹，提示用户
[[ -d .wrangler ]] && warn "检测到 .wrangler 目录，可能已有过部署，将覆盖 wrangler.toml"

# ---------- 交互式收集参数 ----------
echo ""
echo -e "${GREEN}═══ R2 Video Worker 一键部署 ═══${NC}"
echo ""

read -rp "  Worker 名称 (英文, 留空使用默认 r2-video-worker): " WORKER_NAME
WORKER_NAME="${WORKER_NAME:-r2-video-worker}"

read -rp "  R2 存储桶名称 (英文, 例如 video-bucket): " BUCKET_NAME
[[ -z "$BUCKET_NAME" ]] && err "R2 桶名不能为空"

read -rp "  KV 命名空间名称 (英文, 例如 video-index): " KV_NAME
[[ -z "$KV_NAME" ]] && err "KV 命名空间不能为空"

read -rp "  管理后台访问路径 (例如 /secret-admin, 默认 /admin): " ADMIN_URL
ADMIN_URL="${ADMIN_URL:-/admin}"
[[ "$ADMIN_URL" != /* ]] && ADMIN_URL="/$ADMIN_URL"

read -rsp "  管理后台密码: " ADMIN_PASS; echo ""
[[ -z "$ADMIN_PASS" ]] && err "密码不能为空"

read -rsp "  SESSION_SECRET (直接回车自动生成随机值): " SESSION_SECRET; echo ""
if [[ -z "$SESSION_SECRET" ]]; then
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  ok "自动生成 SESSION_SECRET: ${SESSION_SECRET:0:16}..."
fi

# ---------- 创建 R2 + KV ----------
info "创建 R2 存储桶: $BUCKET_NAME"
wrangler r2 bucket create "$BUCKET_NAME" || warn "R2 桶可能已存在，继续..."

info "创建 KV 命名空间: $KV_NAME"
KV_ID=$(wrangler kv namespace create "$KV_NAME" | grep -oP '\b[a-f0-9]{32}\b' | head -1 || true)
if [[ -z "$KV_ID" ]]; then
  warn "未能自动解析 KV ID，请手动输入 (在输出中找到 ID 行):"
  read -rp "  KV Namespace ID: " KV_ID
fi
ok "KV Namespace ID: $KV_ID"

# ---------- 重写 wrangler.toml ----------
info "更新 wrangler.toml"
cat > "$WRANGLER_TOML" <<EOF
name = "$WORKER_NAME"
main = "src/index.js"
compatibility_date = "$(date +%Y-%m-%d)"

[[r2_buckets]]
binding = "VIDEOS_BUCKET"
bucket_name = "$BUCKET_NAME"

[[kv_namespaces]]
binding = "VIDEO_INDEX"
id = "$KV_ID"

[vars]
ADMIN_URL = "$ADMIN_URL"
EOF
ok "wrangler.toml 已生成"

# ---------- 安装依赖 ----------
[[ -d node_modules ]] || { info "安装依赖"; npm install; }

# ---------- 部署 Worker ----------
info "部署 Worker..."
npm run deploy

# ---------- 写入 Secrets ----------
info "设置 Secret: ADMIN_PASS"
echo -n "$ADMIN_PASS" | wrangler secret put ADMIN_PASS

info "设置 Secret: SESSION_SECRET"
echo -n "$SESSION_SECRET" | wrangler secret put SESSION_SECRET

# ---------- 完成 ----------
echo ""
ok "═══ 部署完成 ═══"
echo ""
echo "  Nginx 伪装首页:  https://$WORKER_NAME.$(wrangler whoami 2>/dev/null | awk '{print $NF}').workers.dev/"
echo "  管理后台:        https://$WORKER_NAME.$(wrangler whoami 2>/dev/null | awk '{print $NF}').workers.dev$ADMIN_URL"
echo "  视频直链示例:    https://$WORKER_NAME.$(wrangler whoami 2>/dev/null | awk '{print $NF}').workers.dev/video?hash=xxx"
echo ""
warn "如果 whoami 无法解析账号 subdomain，请在 Cloudflare Dashboard 查看 workers.dev 子域名。"
