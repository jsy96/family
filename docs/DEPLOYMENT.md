# 关系网 - 部署指南

## 推荐部署方案：Vercel（前端）+ Railway（后端）

### 方案优势

| 特性 | Vercel | Railway |
|------|--------|---------|
| 免费额度 | 无限带宽 | $5/月 |
| 全球CDN | ✅ | - |
| 自动HTTPS | ✅ | ✅ |
| 自动部署 | ✅ | ✅ |
| 数据持久化 | - | ✅ |
| 响应速度 | 毫秒级 | 快速 |

---

## 第一步：部署后端（Railway）

### 1. 注册 Railway

访问 https://railway.app/ 并注册账号

### 2. 创建新项目

1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 授权你的 GitHub 账号

### 3. 配置项目

1. 选择或创建 GitHub 仓库
2. Railway 会自动检测 Node.js 项目

### 4. 设置环境变量

在项目设置中添加：

```
JWT_SECRET=随机生成的32位字符串
PORT=3000
```

### 5. 获取后端 URL

部署完成后，Railway 会提供一个 URL，如：
```
https://your-backend.railway.app
```

### 6. 配置持久化存储

1. 在项目中选择 "New Volume"
2. 挂载路径：`/app/database.sqlite`
3. 这样数据库不会在重启后丢失

---

## 第二步：部署前端（Vercel）

### 1. 注册 Vercel

访问 https://vercel.com/ 并注册账号

### 2. 导入项目

1. 点击 "New Project"
2. 选择你的 GitHub 仓库
3. Vercel 会自动检测静态网站

### 3. 配置 API 地址

修改 `js/api.js` 中的 baseURL：

```javascript
// 开发环境
baseURL: 'http://localhost:3000/api',

// 生产环境（替换为你的 Railway URL）
baseURL: 'https://your-backend.railway.app/api',
```

### 4. 部署

点击 "Deploy" 按钮，等待部署完成

### 5. 获取前端 URL

Vercel 会提供一个 URL，如：
```
https://your-app.vercel.app
```

---

## 替代方案

### 方案 A：Fly.io（全栈部署）

**适合**：需要完全控制部署流程

```bash
# 安装 Fly CLI
curl -L https://fly.io/install.sh | sh

# 登录
fly auth login

# 初始化项目
fly init

# 创建配置文件
fly launch

# 部署
fly deploy
```

### 方案 B：Render（后端）+ Netlify（前端）

**适合**：需要更简单的部署流程

| | Render | Netlify |
|--|--------|---------|
| 免费额度 | 750小时/月 | 无限 |
| 持久存储 | ❌ | - |
| 推荐度 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 成本对比

| 方案 | 月成本 | 年成本 |
|------|--------|--------|
| Vercel + Railway | $0 | $0 |
| Fly.io 全栈 | $0 | $0 |
| Render + Netlify | $0 | $0 |

> 以上方案均在免费额度内，实际成本为 $0

---

## 域名配置（可选）

### 在 Vercel 添加自定义域名

1. 项目设置 → Domains
2. 添加你的域名
3. 配置 DNS 记录

### DNS 配置

```
类型    名称    值
A       www     76.76.21.21
CNAME   @       cname.vercel-dns.com
```

---

## 监控和维护

### Railway 监控

- 查看日志：项目 → Logs
- 查看指标：项目 → Metrics
- 数据库备份：项目 → Volumes

### Vercel 分析

- 查看访问量：项目 → Analytics
- 查看部署历史：项目 → Deployments

---

## 故障排除

### 问题 1：CORS 错误

在后端 `server.js` 已配置 CORS，如仍有问题：

```javascript
app.use(cors({
    origin: ['https://your-app.vercel.app', 'http://localhost:3000'],
    credentials: true
}));
```

### 问题 2：数据库丢失

确保 Railway 配置了持久化存储 Volume

### 问题 3：部署失败

检查 `package.json` 中的启动脚本：

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

---

## 安全建议

1. **修改 JWT_SECRET**：使用强随机字符串
2. **启用 HTTPS**：Vercel 和 Railway 自动提供
3. **限制速率**：添加 API 速率限制
4. **定期备份**：Railway 自动备份数据库

---

## 性能优化

1. **启用压缩**：Express 已配置
2. **CDN 缓存**：Vercel 自动处理
3. **数据库索引**：已配置主键和外键
4. **静态资源**：Vercel 自动优化
