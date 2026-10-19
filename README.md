# MindForest

把 AI 对话组织成一棵会生长的主题树，让每一次追问、分支和总结都留在同一个知识脉络里。

MindForest 是一个本地优先的桌面 AI 对话工具：每一轮问答都是主题树上的一个节点，你可以从任意历史节点继续追问、创建平行分支、把多轮对话折叠成一个主题，并用全文搜索在整棵森林里找回任何一句话。

> 当前版本：`v0.2.5-alpha-1`（预发布）。功能与数据格式仍可能调整，欢迎试用并反馈。

## 核心特性

- **对话即树**：发送一条消息就在当前节点下创建一个子节点；从任意历史节点继续就是分支。
- **主题节点簇**：多选或框选多轮对话，折叠成一个主题；支持主分支高亮、归档、折叠、回收站。
- **精确消息管理**：引用任意回答片段、编辑用户消息、重新生成多版本、切换同组回答。
- **上下文装配**：祖先链 + 自动链摘要；按模型上下文窗口动态调整预算；引用和附件自动注入。
- **多模型接入**：OpenAI 兼容接口、Provider 预设（DeepSeek / OpenAI / OpenRouter / Ollama / Moonshot / 通义千问 / 智谱）。
- **模型能力标签**：推理、视觉、上下文窗口、最大输出；推理模型可显示/折叠思考过程，并可设置思考强度。
- **图片与文本附件**：视觉模型支持图片；文本文件会自动提取内容注入上下文。
- **全文搜索**：基于 SQLite FTS5 的中文全文索引，`Ctrl+P` 命令面板快速跳转到任意节点。
- **可靠性与数据安全**：启动自动备份、手动备份/恢复、单实例运行、窗口状态记忆；API Key 经系统密钥环加密。
- **外观**：6 套主题 × 亮色/暗色、字体选择、可拖拽卡片布局、可配置主题树配色。

## 下载与安装

从 [GitHub Releases](https://github.com/TheSky-N/MindForest/releases) 下载最新预发布包：

- Fedora / RHEL：`mindforest-*.x86_64.rpm`
- 通用 Linux：`MindForest-*.AppImage`

```bash
# Fedora / RHEL
sudo dnf install ./mindforest-0.2.5-alpha-1.x86_64.rpm

# AppImage
chmod +x MindForest-0.2.5-alpha-1.AppImage
./MindForest-0.2.5-alpha-1.AppImage
```

Windows 安装包仍在验证中，当前预发布仅提供 Linux 构建。

## 首次使用

1. 打开「设置 → 模型」（`Ctrl+K`），选择服务商预设，填入 Base URL、模型与 API Key。
2. 点击「测试连接」，保存并设为当前使用。
3. 新建项目，在中心对话窗口发送第一条消息。
4. 在右侧主题树中单击预览、双击进入并继续；选中回答文本可引用，右键节点可重命名、归档、新建标签页等。

### 常用快捷键

| 快捷键       | 功能               |
| ------------ | ------------------ |
| `Ctrl+K`     | 打开/关闭设置      |
| `Ctrl+P`     | 打开搜索与命令面板 |
| `Ctrl+Enter` | 发送消息           |
| `Ctrl+T`     | 新建标签页         |
| `Ctrl+W`     | 关闭当前标签页     |
| `Ctrl+Tab`   | 切换标签页         |
| `Ctrl+1…9`   | 跳转到指定标签页   |

## 开发

要求：Node.js 24+、npm 11+。

```bash
npm install
npm run dev        # 开发模式
npm run typecheck  # TypeScript 检查
npm test           # 单元测试（Vitest）
npm run test:e2e   # 端到端测试（Playwright，需要先构建）
npm run build      # 构建 main / preload / renderer
npm run dist:linux # 打包 rpm + AppImage
```

### 项目结构

```
src/main       Electron 主进程：SQLite、LLM 客户端、IPC、备份、迁移
src/preload    安全桥接层
src/renderer   React 界面：对话、主题树、设置、搜索
src/shared     主进程与渲染进程共享类型、IPC 契约、Provider 预设
drizzle        SQLite 迁移（含 FTS5 全文索引）
tests          Vitest 单元测试
e2e            Playwright 端到端测试
```

## 数据与隐私

- 所有项目、对话、附件和设置都保存在本地应用数据目录的 SQLite 数据库中。
- API Key 使用 Electron `safeStorage` 加密；系统密钥环不可用时仅保留在本次会话。
- 数据库备份默认位于应用数据目录的 `backups/`，启动时每 24 小时自动备份一次，保留最近 12 份。
- 应用不会主动上传任何数据；只有在你发送消息时，才会把当前上下文发送到你配置的模型服务。

## 已知限制

- 仅支持 OpenAI 兼容的 `/chat/completions` 接口，暂未适配 Anthropic / Gemini 原生协议。
- 附件文本提取以 UTF-8 文本文件为主，PDF/Office 文档解析尚未实现。
- Windows 构建与自动更新仍在验证中。
- 预发布版本的数据格式可能在正式版前调整，升级前请先备份。

## 路线图

下一阶段聚焦「思维森林」知识层：自由主题、批注 + AI 评审、种子沉淀与检索反哺回答。详见 [docs/MindForest.md](docs/MindForest.md)。

## License

[MIT](LICENSE)
