# InteSchool（智题云校）

[![CI](https://github.com/caosuoming/InteSchool/actions/workflows/ci.yml/badge.svg)](https://github.com/caosuoming/InteSchool/actions/workflows/ci.yml)

InteSchool 是一个面向教师的题库、讲义、试卷和教学资源管理平台前端原型。项目以“智题云校”为产品名称，提供学校身份、题库管理、资源导入、讲义编辑、班级学生、集体备课和教学分析等演示流程。

> 当前版本是**纯前端演示项目**。数据、认证、AI 分析和网络请求均由浏览器端 Mock 服务模拟，不应直接用于生产环境。

## 功能概览

- 教师邮箱注册、登录、学校认证与多身份切换
- 题库筛选、查重、编辑、批量导入和试题篮管理
- 试卷、讲义、课件、素材的统一资源管理
- Word 文档解析、公式展示和模拟 AI 提取流程
- 班级、学生、集体备课、教学互动和统计分析
- 浏览器本地持久化的完整演示数据
- 路由级代码分割，重型编辑器按需加载

## 技术栈

- React 18 + TypeScript 5
- Vite 6 + Tailwind CSS 3
- React Router 7
- Zustand 5
- Vitest + Testing Library + jsdom
- ESLint 9 + GitHub Actions

## 快速开始

### 环境要求

- Node.js `>= 20.19.0`，推荐 Node.js 22
- npm 10 或更高版本

仓库提供 `.nvmrc`：

```bash
nvm use
```

### 安装与运行

```bash
git clone https://github.com/caosuoming/InteSchool.git
cd InteSchool
npm ci
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

### 演示账号

```text
邮箱：li.zhang@bj04.edu.cn
密码：demo1234
```

也可以在登录页点击演示账号自动填充。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm run check` | 执行 TypeScript 类型检查 |
| `npm test` | 运行一次单元测试与组件测试 |
| `npm run test:watch` | 以监听模式运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run build` | 类型检查并生成生产构建 |
| `npm run preview` | 本地预览生产构建 |
| `npm run validate` | 依次执行 lint、类型检查、覆盖率测试和构建 |

提交代码前建议执行：

```bash
npm run validate
```

## 测试与 CI

测试目前重点覆盖容易造成数据错乱的核心路径：

- Mock 数据库初始化、迁移、重置和快照隔离
- 注册登录态持久化、登录登出和学校身份同步
- 题目查重哈希、批量导入、筛选、备注和使用次数
- 通用表单控件的标签与错误信息可访问性
- 本地存储容错、日期格式化和可控故障模拟

覆盖率门槛由 `vitest.config.ts` 强制执行：语句、函数和行覆盖率不低于 70%，分支覆盖率不低于 60%。GitHub Actions 会在每次 push、Pull Request 和手动触发时运行完整 `npm run validate`。

## 项目结构

```text
.
├── .github/workflows/ci.yml    # 持续集成
├── docs/                       # 产品与架构文档
├── public/                     # 静态资源
├── src/
│   ├── components/             # 通用 UI 与业务组件
│   ├── hooks/                  # 可复用 React Hooks
│   ├── lib/                    # DOCX、公式和通用解析逻辑
│   ├── pages/                  # 路由页面
│   ├── services/               # 浏览器端 Mock 服务与数据库
│   ├── stores/                 # Zustand 状态
│   ├── test/                   # 测试初始化
│   └── types/                  # TypeScript 数据模型
├── vitest.config.ts            # 测试与覆盖率配置
└── vite.config.ts              # 开发与构建配置
```

## 数据与本地存储

核心演示数据库使用 `localStorage` 持久化，键名前缀为 `zhiti:`。首次访问会注入种子数据；数据库版本升级时会执行兼容字段补齐。

需要恢复初始数据时，可在浏览器开发者工具中删除以 `zhiti:` 开头的本地存储项后刷新页面。此操作会删除当前浏览器中的所有演示修改。

## 构建与部署

```bash
npm ci
npm run build
```

输出位于 `dist/`。应用使用浏览器端路由，部署到 Nginx、静态托管平台或对象存储时，需要将未知路径回退到 `index.html`。

示例 Nginx 规则：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

## 当前限制

- 没有真实后端、数据库、权限校验或文件存储
- 演示账号密码以明文存在种子数据和浏览器本地存储中
- 微信、企业微信、AI 识别和联网分析均为模拟流程
- 上传文件主要在浏览器内解析，刷新后不保证保留二进制文件
- 现有页面仍有部分 React Hooks 依赖警告，后续应按模块逐步收紧 lint 基线

安全边界详见 [SECURITY.md](SECURITY.md)。

## 文档

- [产品需求文档](docs/product-requirements.md)
- [技术架构文档](docs/architecture.md)
- [贡献指南](CONTRIBUTING.md)

## 许可证

仓库目前未声明开源许可证。未经版权所有者明确授权，不应假定代码可用于再分发或商业用途。
