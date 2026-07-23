# 贡献指南

## 开发环境

1. 安装 Node.js 22。
2. 使用 `npm ci` 安装锁定依赖。
3. 使用 `npm run dev` 启动本地开发服务器。

不要提交 `node_modules/`、`dist/`、`coverage/`、安装包、压缩包或本地环境文件。

## 修改流程

1. 从最新主分支创建功能分支。
2. 先为可复现缺陷补充失败测试。
3. 进行最小范围修复，避免在同一提交中混入无关重构。
4. 更新受影响的中文文档。
5. 提交前运行：

```bash
npm run validate
```

## 测试要求

- 服务层行为修改必须补充 Vitest 回归测试。
- 通用组件交互或可访问性修改应使用 Testing Library 验证。
- 修复数据迁移、认证、导入、删除等高风险路径时，至少覆盖成功路径和一个异常或边界路径。
- 不应通过降低覆盖率门槛来绕过失败；确需调整时，应在提交说明中解释原因。

## 代码风格

- 保持 TypeScript 类型明确，新增代码避免使用 `any`。
- 不要引入默认随机失败、依赖系统时间的脆弱测试或跨测试共享状态。
- React Hooks 依赖应按实际闭包语义处理，不要仅为消除警告机械添加依赖。
- 用户可见文本优先使用中文，并保持现有产品术语一致。

## 提交建议

每个提交应只处理一个可审查主题，例如：

```text
fix: keep school affiliation in sync after approval
test: cover question metadata lifecycle
ci: add automated validation workflow
docs: add Chinese project documentation
```
