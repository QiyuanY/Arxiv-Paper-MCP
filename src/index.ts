#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { searchArxivPapers } from "./tools/search.js";
import { getRecentPapers } from "./tools/recent.js";
import { getArxivPdfUrl, parsePaperContent } from "./tools/paper.js";

const server = new Server(
  {
    name: "arxiv-paper-mcp",
    version: "1.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_arxiv",
        description: "搜索 arXiv 论文，支持关键词、作者、分类、日期范围、排序等参数",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "搜索英文关键词"
            },
            maxResults: {
              type: "number",
              description: "最大结果数量",
              default: 5
            },
            author: {
              type: "string",
              description: "按作者名筛选"
            },
            categories: {
              type: "array",
              items: { type: "string" },
              description: "arXiv 学科分类过滤，如 ['cs.AI', 'cs.CL']"
            },
            date_from: {
              type: "string",
              description: "起始日期过滤，格式 YYYY-MM-DD"
            },
            date_to: {
              type: "string",
              description: "截止日期过滤，格式 YYYY-MM-DD"
            },
            sort_by: {
              type: "string",
              enum: ["relevance", "lastUpdatedDate", "submittedDate"],
              description: "排序方式",
              default: "relevance"
            },
            sort_order: {
              type: "string",
              enum: ["ascending", "descending"],
              description: "排序方向",
              default: "descending"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_recent_papers",
        description: "获取 arXiv 指定领域最新论文。支持任意 arXiv 分类，如 cs.AI、cs.CL、cs.CV、cs.LG、stat.ML、cs.NE、cs.IR 等。",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "arXiv 分类，默认 cs.AI。常见分类：cs.AI, cs.CL, cs.CV, cs.LG, stat.ML, cs.NE, cs.IR",
              default: "cs.AI"
            }
          },
          required: []
        }
      },
      {
        name: "get_arxiv_pdf_url",
        description: "获取 arXiv PDF 下载链接",
        inputSchema: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "arXiv 论文URL（如：https://arxiv.org/abs/2403.15137v1）或 arXiv ID（如：2403.15137v1）"
            }
          },
          required: ["input"]
        }
      },
      {
        name: "parse_paper_content",
        description: "解析论文内容（优先使用 HTML 版本，回退到 PDF）",
        inputSchema: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "arXiv 论文URL或 arXiv ID"
            },
            paperInfo: {
              type: "object",
              description: "论文信息（可选，用于添加论文元数据）",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                published: { type: "string" },
                authors: { type: "array" }
              }
            }
          },
          required: ["input"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_arxiv": {
        const { query, maxResults, author, categories, date_from, date_to, sort_by, sort_order } = args as {
          query: string; maxResults?: number; author?: string; categories?: string[];
          date_from?: string; date_to?: string; sort_by?: string; sort_order?: string;
        };
        const results = await searchArxivPapers({
          query, maxResults, author, categories,
          dateFrom: date_from, dateTo: date_to,
          sortBy: sort_by as any, sortOrder: sort_order as any,
        });

        return {
          content: [{
            type: "text",
            text: `找到 ${results.papers.length} 篇相关论文（总计 ${results.totalResults} 篇）：\n\n${results.papers.map((paper: any, index: number) =>
              `${index + 1}. **${paper.title}**\n   ID: ${paper.id}\n   发布日期: ${paper.published}\n   作者: ${paper.authors.map((author: any) => author.name || author).join(', ')}\n   摘要: ${paper.summary.substring(0, 300)}...\n   URL: ${paper.url}\n`
            ).join('\n')}`
          }]
        };
      }

      case "get_recent_papers": {
        const { category = 'cs.AI' } = args as { category?: string };
        const result = await getRecentPapers(category);

        return {
          content: [{
            type: "text",
            text: `获取到 ${result.papers.length} 篇 ${category} 领域最新论文：\n\n${result.papers.map((paper, index) =>
              `${index + 1}. **${paper.title}**\n   ID: ${paper.id}\n   作者: ${paper.authors.join(', ')}\n   摘要: ${paper.summary}...\n   URL: ${paper.url}\n`
            ).join('\n')}`
          }]
        };
      }

      case "get_arxiv_pdf_url": {
        const { input } = args as { input: string };
        const pdfUrl = getArxivPdfUrl(input);

        return {
          content: [{
            type: "text",
            text: pdfUrl
          }]
        };
      }

      case "parse_paper_content": {
        const { input, paperInfo } = args as { input: string; paperInfo?: any };
        const result = await parsePaperContent(input, paperInfo);

        return {
          content: [{
            type: "text",
            text: result.content
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `工具执行失败: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

console.log("启动 ArXiv Paper MCP Server...");

const transport = new StdioServerTransport();
await server.connect(transport);

console.log("🚀 ArXiv Paper MCP Server 已启动，等待连接...");
