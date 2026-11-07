# CI 与发布流程

## 每次 PR 与主分支提交

`.github/workflows/ci.yml` 是唯一的常规合并门禁。

- `Lint and typecheck`：在 `.nvmrc` 指定的 Node 版本执行 ESLint 和 TypeScript 检查。
- `Tests and coverage`：运行全部 Vitest 测试，强制执行 `vitest.config.ts` 中的覆盖率阈值，保留 7 天覆盖率报告。
- `Production build`：构建 Web 和 Node 服务，确认关键产物存在。
- `Review dependency changes`：仅 PR 执行，拦截引入已知高危或严重依赖漏洞的改动。
- `Windows scanner package`：修改扫描桥接或 Windows 安装文件时执行，实际构建、安装和测试 Windows 程序。
- `Container smoke test`：修改容器、依赖或构建配置时执行，构建镜像、启动服务并检查 `/api/health` 与非 root 运行。
- `Required checks`：单一稳定合并门禁，汇总所有必需及按需检查；失败或取消不能被跳过掩盖。

主分支提交不会被后续提交取消。新的 PR 提交会取消同一 PR 上的旧检查。

建议将分支保护的必需状态检查设为 **`Required checks`**。由于可选的扫描器和容器 Job 会按路径跳过，不要将这些 Job 单独设为必需检查；它们的结果已由 `Required checks` 汇总。

## 安全与维护

- `Security audit`：每周一及手动触发，运行生产依赖漏洞审计和 JavaScript/TypeScript CodeQL 分析。
- Dependabot 每周检查 npm 和 GitHub Actions 依赖更新；涉及依赖的 PR 仍需通过统一门禁。
- 所有常规检查只授予只读权限；发布器仅在实际发布步骤获得写权限。
- 操作系统依赖或 CodeQL 检测到的安全问题需要人工确认和修复，不应降低检测门槛绕过。

## 版本发布

`Release` 由符合 `vMAJOR.MINOR.PATCH`（可选预发布后缀）的标签或手动输入已存在的版本标签触发。只有指向 `main` 历史中提交的版本标签可发布。

1. 确认标签、运行完整校验。
2. 使用发布标签构建并实际启动单架构容器完成健康检查。
3. 构建并发布 GHCR 的 `amd64` 与 `arm64` 镜像，附带 provenance 与 SBOM。
4. 发布 GitHub Release。稳定版本才更新 GHCR `latest` 标签。

生产环境部署属于独立的运维操作，CI 不会在缺少经审查的部署密钥/环境保护时直接改动生产服务。

## Windows 扫描桥接发布

在 `main` 分支手动触发 **Publish Windows scanner installer**。工作流首先调用与 CI 相同的安装包验证，然后将安装包及 SHA256 摘要更新到 `scanner-bridge-latest` Release。PR 不具备发布权限。

## 本地复现

```bash
npm ci
npm run validate
```

需要修改扫描器、Docker 或发布工作流时，除了本地校验，还应确认 PR 中对应的 Windows 或 Docker 实测 Job 成功。
