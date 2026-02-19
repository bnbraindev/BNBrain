[English](EXTRAS.md) | 中文

# 附录：演示视频与展示材料

演示视频和幻灯片是提交材料的辅助部分。技术评委主要评估代码和文档。

---

- **在线演示**：[https://app.bnbrain.dev](https://app.bnbrain.dev)

- **演示视频**： [https://youtu.be/yRiy0IHUQgE](https://youtu.be/yRiy0IHUQgE)
---

## AI 构建日志

本项目全程使用 **AI 辅助开发**：

- **Claude Code**（Anthropic CLI）— 主要开发工具，用于所有代码生成、调试和架构决策
- **自动化实施流水线** — 自定义 `implement-loop.sh` 编排脚本，将功能拆分为切片并顺序执行
- **AI 驱动的代码审查** — 自动化审计脚本（`/audit`、`/audit-fix`、`/audit-verify`）用于质量保证

### 构建过程亮点

1. **核心聊天运行时和 37 个 AI 工具** — 通过迭代式 AI 辅助开发设计和实现
2. **24 个交互式结果卡片** — UI 组件由 AI 生成，通过视觉测试优化
3. **Worker 后台架构** — AI 设计的弹性后台处理，含租约/心跳机制
4. **Solidity 编译服务** — Worker Thread 隔离的编译器，支持 OpenZeppelin 导入解析
5. **多源安全验证** — AI 编排的数据源集成（GoPlus + Honeypot.is + DexScreener + BscScan）

### 使用的开发工具

| 工具 | 用途 |
|------|------|
| Claude Code（Anthropic） | 主要 AI 编程助手 |
| Next.js 16 | 框架（最新 App Router） |
| Vercel AI SDK | AI 模型集成 |
| wagmi + viem | 区块链交互 |
| Docker | 部署与测试 |

> 视频和幻灯片是仓库内容的辅助。技术评审请参考代码、`docs/PROJECT.zh-CN.md` 和 `docs/TECHNICAL.zh-CN.md`。
