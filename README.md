# ArXiv Paper MCP

一个基于 arXiv 的论文检索与内容解析工具。支持 Model Context Protocol (MCP) 标准，提供论文搜索、PDF链接获取、内容解析和最新论文获取功能。

## 功能特性

- **论文搜索** — 支持关键词、作者、学科分类、日期范围、排序方式等多维搜索
- **最新论文获取** — 支持任意 arXiv 分类（cs.AI、cs.CL、cs.CV、cs.LG、stat.ML 等）
- **PDF 链接获取** — 通过 arXiv ID 或 URL 获取直接 PDF 下载链接
- **论文内容解析** — 优先 HTML 版本，回退 PDF，自动缓存已解析内容

## 安装使用

### NPX 方式（推荐）

```bash
npx @qiyuany/arxiv-paper-mcp
```

### 全局安装

```bash
npm install -g @qiyuany/arxiv-paper-mcp
arxiv-paper-mcp
```

## MCP 客户端配置

### Claude Desktop 配置

在 Claude Desktop 的配置文件中添加：

```json
{
  "mcpServers": {
    "arxiv-paper-mcp": {
      "command": "npx",
      "args": ["-y", "@qiyuany/arxiv-paper-mcp@latest"]
    }
  }
}
```

配置文件位置：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 其他 MCP 客户端

对于其他支持 MCP 的客户端，请参考其文档配置 stdio 传输方式。

## 可用工具与参数

### 1. 搜索论文

- **工具名**: `search_arxiv`
- **参数**:
  - `query`（必填）：搜索关键词
  - `maxResults`（可选，默认 5）：返回论文数量
  - `author`（可选）：按作者名筛选
  - `categories`（可选）：学科分类过滤，如 `["cs.AI", "cs.CL"]`
  - `date_from`（可选）：起始日期，格式 `YYYY-MM-DD`
  - `date_to`（可选）：截止日期，格式 `YYYY-MM-DD`
  - `sort_by`（可选）：排序方式，`relevance` | `lastUpdatedDate` | `submittedDate`
  - `sort_order`（可选）：排序方向，`ascending` | `descending`

### 2. 获取最新论文

- **工具名**: `get_recent_papers`
- **参数**:
  - `category`（可选，默认 `cs.AI`）：arXiv 分类，支持 cs.AI、cs.CL、cs.CV、cs.LG、stat.ML、cs.NE、cs.IR 等

### 3. 获取 PDF 下载链接

- **工具名**: `get_arxiv_pdf_url`
- **参数**:
  - `input`（必填）：arXiv 论文 URL 或 arXiv ID

### 4. 解析论文内容

- **工具名**: `parse_paper_content`
- **参数**:
  - `input`（必填）：arXiv 论文 URL 或 arXiv ID
  - `paperInfo`（可选）：论文元信息（title、summary、published、authors）

## 使用流程示例

1. **搜索论文** — `search_arxiv` 按关键词、作者或分类搜索
2. **获取最新论文** — `get_recent_papers` 获取指定领域最新论文列表
3. **获取 PDF 链接** — `get_arxiv_pdf_url` 获取 PDF 直接下载链接
4. **解析论文内容** — `parse_paper_content` 提取论文全文（HTML 优先，PDF 回退，自动缓存）

## 开发指南

### 本地开发

```bash
git clone https://github.com/QiyuanY/Arxiv-Paper-MCP.git
cd arxiv-paper-mcp
npm install
npm run dev      # 监听模式编译
npm run build    # 构建
npm start        # 运行
```

### 项目结构

```
src/
├── index.ts           # MCP 服务器入口 + 工具注册
├── tools/
│   ├── search.ts      # 搜索相关（多参数、缓存）
│   ├── paper.ts       # 论文解析（HTML 优先 → PDF 回退）
│   └── recent.ts      # 最新论文获取
├── parsers/
│   ├── html.ts        # HTML 内容提取（JSDOM）
│   └── pdf.ts         # PDF 文本提取（pdf-parse）
└── utils/
    ├── arxiv.ts       # ArXiv 客户端实例
    └── cache.ts       # LRU 缓存（100 条，30 分钟 TTL）
```

## 技术栈

- **Node.js** >= 18.0.0
- **TypeScript**
- **Model Context Protocol SDK**
- **@agentic/arxiv** — arXiv API 客户端
- **pdf-parse** — PDF 文本提取
- **jsdom** — HTML 内容解析

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
