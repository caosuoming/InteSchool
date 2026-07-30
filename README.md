# InteSchool（智题云校）

[![CI](https://github.com/caosuoming/InteSchool/actions/workflows/ci.yml/badge.svg)](https://github.com/caosuoming/InteSchool/actions/workflows/ci.yml)

InteSchool 是面向教师和学校的题库、试卷、讲义、课件、班级学生、集体备课与教学分析服务。当前版本已从浏览器端演示原型改造为可部署的全栈应用：前端只负责交互，认证、授权、业务规则、文件处理和持久化均由后端执行。

## 主要能力

- 经学校预授权或教师担保后注册；注册时选择或创建学校并设置任教学科
- 邮箱密码登录、退出和修改密码
- 学校认证申请、管理员审核和多身份切换
- 教师可在个人中心维护任教学科、年级和班级，并申请加入其他学校
- 学校管理员可维护本校教师教学资料；平台管理员审核学校管理员申请
- 题库、试题篮、试卷、讲义、课件和素材管理
- 班级、学生、组织、备课任务和教学互动管理
- DOCX、PDF、Markdown、文本文件的服务端存储与文本提取
- 资源分享、校本资源、平台资源和使用分析
- 可选的 OpenAI-compatible AI 题目与知识块生成
- Docker Compose 部署、健康检查、持久化数据卷
- tag 驱动的多架构 GHCR 镜像和 GitHub Release

## 架构

```text
Browser
  └─ React + TypeScript + Vite
       └─ same-origin /api
            └─ Fastify
                 ├─ HttpOnly session + CSRF + rate limit
                 ├─ authorization + business services
                 ├─ SQLite (WAL)
                 └─ protected file storage
```

关键安全边界：

- 账号密码只进入服务端，使用带随机盐的 `scrypt` 哈希保存。
- 会话令牌仅存在于 `HttpOnly`、`SameSite=Lax` Cookie；数据库只保存令牌哈希。
- 修改请求必须同时携带内存中的 CSRF 令牌。
- 服务端校验教师身份、学校范围、资源所有者和管理员权限。
- 业务数据不写入 `localStorage`。浏览器本地存储只用于界面偏好。
- 原始文件存入服务端数据目录，文件名随机化，下载和解析均需登录授权。

详细设计见 [技术架构](docs/architecture.md)，部署安全要求见 [安全说明](SECURITY.md)。

## Docker 生产部署

### 1. 准备配置

```bash
git clone https://github.com/caosuoming/InteSchool.git
cd InteSchool
cp .env.example .env
```

首次生产部署至少修改以下配置：

```dotenv
INTESCHOOL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
INTESCHOOL_BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-strong-password
INTESCHOOL_BOOTSTRAP_ADMIN_NAME=平台管理员
INTESCHOOL_BOOTSTRAP_SCHOOL_ID=school-1
INTESCHOOL_BOOTSTRAP_SCHOOL_NAME=示例中学
INTESCHOOL_BOOTSTRAP_SCHOOL_CODE=EXAMPLE
INTESCHOOL_BOOTSTRAP_SCHOOL_CITY=南京
```

`INTESCHOOL_BOOTSTRAP_ADMIN_PASSWORD` 至少 12 位。管理员账号创建成功后，应从 `.env` 删除该密码并重新创建容器；数据库中的账号不会被删除或重置。

### 2. 启动

```bash
docker compose up -d --build
```

默认访问地址为 `http://localhost:3000`。状态检查：

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

### 3. 配置 HTTPS

生产环境应由 Nginx、Caddy、Traefik 等反向代理提供 HTTPS，并设置：

```dotenv
INTESCHOOL_COOKIE_SECURE=true
```

反向代理需要保留 `Host`、`X-Forwarded-Proto` 和客户端地址信息。应用默认不信任代理头；应将 `INTESCHOOL_TRUST_PROXY` 设置为可信代理的 IP/CIDR，或在拓扑固定时设置可信跳数。不要将原始应用端口同时暴露到公网。

### 4. 数据持久化

Compose 使用命名卷 `inteschool-data`，容器内路径为 `/app/data`：

```text
/app/data/inteschool.sqlite
/app/data/inteschool.sqlite-wal
/app/data/inteschool.sqlite-shm
/app/data/uploads/
```

SQLite 使用 WAL 模式。进行文件级备份时应先停止应用，确保数据库和上传目录处于一致状态：

```bash
docker compose stop inteschool
# 备份 Docker volume 中的 /app/data
# 完成后：
docker compose start inteschool
```

恢复时应同时恢复 SQLite 文件和 `uploads/`，且应用版本不得低于备份时版本。

### 5. 升级

使用 GHCR 发布镜像时：

```bash
docker compose pull
docker compose up -d
```

从源码构建时：

```bash
git pull --ff-only
docker compose up -d --build
```

升级前先备份数据卷。数据库迁移在服务启动时自动执行。

## 初始化与演示数据

生产容器默认：

```dotenv
INTESCHOOL_SEED_DEMO_DATA=false
INTESCHOOL_ENABLE_DEMO=false
```

因此不会导入虚构教师、题目和资源，也不存在默认登录凭据。

本地开发可启用演示数据：

```dotenv
INTESCHOOL_SEED_DEMO_DATA=true
INTESCHOOL_ENABLE_DEMO=true
INTESCHOOL_DEMO_EMAIL=li.zhang@bj04.edu.cn
INTESCHOOL_DEMO_PASSWORD=demo123456
```

不要在公开生产环境启用演示账号。

## AI 服务

AI 生成功能使用服务端配置的 OpenAI-compatible `chat/completions` 接口：

```dotenv
INTESCHOOL_AI_BASE_URL=https://your-provider.example/v1
INTESCHOOL_AI_API_KEY=your-secret
INTESCHOOL_AI_MODEL=your-model
```

密钥不会返回浏览器。未配置时，AI 生成接口会明确报错，其他教学资源功能不受影响。提供商必须支持 JSON object 响应格式；返回内容还会经过服务端结构校验。

## 其他环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `INTESCHOOL_PORT` | `3000` | Compose 对外端口 |
| `INTESCHOOL_COOKIE_SECURE` | `false` | HTTPS 部署必须设为 `true` |
| `INTESCHOOL_TRUST_PROXY` | `false` | 可信代理 IP/CIDR 或跳数；未配置时忽略转发客户端地址 |
| `INTESCHOOL_SESSION_DAYS` | `30` | 会话有效天数 |
| `INTESCHOOL_MAX_UPLOAD_BYTES` | `52428800` | 单文件上限，默认 50 MiB |
| `INTESCHOOL_AUTO_APPROVE_APPLICATIONS` | `false` | 是否自动通过学校认证；生产不建议启用 |
| `INTESCHOOL_SEED_DEMO_DATA` | 生产 `false` | 是否导入开发演示业务数据 |
| `INTESCHOOL_ENABLE_DEMO` | 生产 `false` | 是否创建演示登录账号 |

完整示例见 [.env.example](.env.example)。

## 本地开发

环境要求：Node.js `>= 22.13.0`，推荐 Node.js 22 LTS。

```bash
npm ci
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`
- Vite 将 `/api` 代理到本地后端。

单独启动：

```bash
npm run dev:server
npm run dev:web
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run check` | 前后端 TypeScript 检查 |
| `npm run lint` | ESLint 检查 |
| `npm test` | 单元与后端集成测试 |
| `npm run test:coverage` | 覆盖率测试 |
| `npm run build` | 构建前端和服务端 |
| `npm run validate` | 运行完整质量门禁 |
| `npm start` | 运行已构建的生产服务 |

## 测试与 CI

集成测试使用真实 Fastify 实例、临时 SQLite 数据库和临时上传目录，覆盖：

- 密码哈希、凭据不回传和 HttpOnly 会话
- CSRF 校验与教师身份冒充拦截
- 业务记录重启持久化
- 文件落盘、文本提取和文档导入
- 学校认证待审核与管理员审批
- 生产空库 bootstrap 管理员

CI 对每次 push 和 Pull Request 执行 `npm run validate`，并实际构建生产 Docker 镜像。推送 `v*` tag 后，Release workflow 会发布 `linux/amd64` 和 `linux/arm64` GHCR 镜像并创建 GitHub Release。

## 数据库说明

内建数据库为 SQLite，适合单实例或单写节点部署。不要同时运行多个共享同一数据卷的应用副本。需要水平扩展、跨节点高可用或外部事务数据库时，应先实现独立数据库适配层和分布式文件存储，不应直接将 SQLite 卷挂载给多个容器。

## 项目结构

```text
.
├── server/                     # Fastify、认证、业务域、SQLite、文件处理
├── src/                        # React 前端与 API 客户端
├── .github/workflows/          # CI 与 Release
├── Dockerfile                  # 多阶段、非 root 生产镜像
├── docker-compose.yml          # 单实例部署与持久化卷
├── server/seed-state.json      # 仅用于开发演示种子
└── docs/                       # 产品与架构文档
```

## 许可证

仓库目前未声明开源许可证。未经版权所有者明确授权，不应假定代码可用于再分发或商业用途。
