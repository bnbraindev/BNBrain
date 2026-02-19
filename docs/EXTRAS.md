English | [中文](EXTRAS.zh-CN.md)

# Optional: Demo Video & Presentation

Demo videos and slide decks support the main submission. Technical judges primarily evaluate the code and documentation.

---

- **Live Demo**: [https://app.bnbrain.dev](https://app.bnbrain.dev)

- **Demo Video**: https://youtu.be/yRiy0IHUQgE

---

## AI Build Log

This project was built using **AI-assisted development** throughout the process:

- **Claude Code** (Anthropic CLI) — Primary development tool for all code generation, debugging, and architecture decisions
- **Automated implementation pipeline** — Custom `implement-loop.sh` orchestration script that breaks features into slices and executes them sequentially with AI
- **AI-powered code review** — Automated audit scripts (`/audit`, `/audit-fix`, `/audit-verify`) for quality assurance

### Build Process Highlights

1. **Core chat runtime & 37 AI tools** — Designed and implemented through iterative AI-assisted development
2. **24 interactive result cards** — UI components generated with AI, refined through visual testing
3. **Worker-based architecture** — AI-designed resilient background processing with lease/heartbeat mechanisms
4. **Solidity compilation service** — Worker-thread isolated compiler with OpenZeppelin import resolution
5. **Multi-source security verification** — AI-orchestrated data source integration (GoPlus + Honeypot.is + DexScreener + BscScan)

### Development Tools Used

| Tool | Purpose |
|------|---------|
| Claude Code (Anthropic) | Primary AI coding assistant |
| Next.js 16 | Framework (latest App Router) |
| Vercel AI SDK | AI model integration |
| wagmi + viem | Blockchain interaction |
| Docker | Deployment & testing |

> Video and slides support what's already in the repo. For technical evaluation, refer to the code, `docs/PROJECT.md`, and `docs/TECHNICAL.md`.
