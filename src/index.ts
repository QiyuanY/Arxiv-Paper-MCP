#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ArXivClient } from '@agentic/arxiv';
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import pdf from "pdf-parse";
import { tmpdir } from "os";
import { JSDOM } from "jsdom";

// 初始化 ArXiv 客户端
const arxivClient = new ArXivClient({});

// 创建 MCP 服务器
const server = new Server(
  {
    name: "arxiv-paper-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 搜索选项接口
interface SearchOptions {
  query: string;
  maxResults?: number;
  author?: string;
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
}

// 工具函数：搜索 arXiv 论文
async function searchArxivPapers(options: SearchOptions): Promise<{totalResults: number, papers: any[]}> {
  const {
    query,
    maxResults = 5,
    author,
    categories,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  } = options;

  try {
    // 构建 include 条件数组
    const include: { field: string; value: string }[] = [
      { field: "all", value: query }
    ];

    if (author) {
      include.push({ field: "author", value: author });
    }

    if (categories && categories.length > 0) {
      include.push({ field: "subject_category", value: categories.join(" OR ") });
    }

    // 如果有日期过滤，拼接到查询字符串中
    let dateFilter = '';
    if (dateFrom || dateTo) {
      const from = dateFrom
        ? dateFrom.replace(/-/g, '') + '000000'
        : '000000000000';
      const to = dateTo
        ? dateTo.replace(/-/g, '') + '235959'
        : '99991231235959';
      dateFilter = `+AND+submittedDate:[${from} TO ${to}]`;
    }

    // 构建 searchQuery：如果有日期过滤，使用原始字符串拼接
    const searchQuery = dateFilter
      ? include.map(tag => `${tag.field === 'all' ? 'all' : tag.field === 'author' ? 'au' : 'cat'}:${tag.value}`).join('+AND+') + dateFilter
      : { include };

    // 构建 URL 参数（sortBy / sortOrder 不在 SearchParams 中，需手动追加）
    const sortParam = sortBy ? `&sortBy=${sortBy}` : '';
    const orderParam = sortOrder ? `&sortOrder=${sortOrder}` : '';

    // 如果有自定义排序参数，使用原始 URL 调用 arXiv API
    if (sortParam || orderParam) {
      const queryString = typeof searchQuery === 'string'
        ? searchQuery
        : include.map(tag => {
            const fieldMap: Record<string, string> = { all: 'all', author: 'au', subject_category: 'cat' };
            return `${fieldMap[tag.field] || tag.field}:${tag.value}`;
          }).join('+AND+');

      const apiUrl = `https://export.arxiv.org/api/query?search_query=${queryString}&start=0&max_results=${maxResults}${sortParam}${orderParam}`;
      const response = await axios.get(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArXiv-Paper-MCP/1.0)' },
        timeout: 30000,
      });

      const dom = new JSDOM(response.data, { contentType: 'application/xml' });
      const doc = dom.window.document;

      const totalResults = parseInt(doc.querySelector('totalResults')?.textContent || '0', 10);
      const entries = Array.from(doc.querySelectorAll('entry'));

      const papers = entries.map((entry: any) => {
        const idEl = entry.querySelector('id');
        const titleEl = entry.querySelector('title');
        const summaryEl = entry.querySelector('summary');
        const publishedEl = entry.querySelector('published');
        const authorEls = entry.querySelectorAll('author name');
        const url = idEl?.textContent || '';
        const urlParts = url.split('/');
        const arxivId = urlParts[urlParts.length - 1];

        return {
          id: arxivId,
          url,
          title: (titleEl?.textContent || '').replace(/\s+/g, ' ').trim(),
          summary: (summaryEl?.textContent || '').replace(/\s+/g, ' ').trim(),
          published: publishedEl?.textContent || '',
          authors: Array.from(authorEls).map((el: any) => ({ name: el.textContent || '' })),
        };
      });

      return { totalResults, papers };
    }

    // 使用 @agentic/arxiv 库的标准搜索（无自定义排序）
    const results = await arxivClient.search({
      start: 0,
      searchQuery: { include: include as any },
      maxResults: maxResults
    });

    const papers = results.entries.map(entry => {
      const urlParts = entry.url.split('/');
      const arxivId = urlParts[urlParts.length - 1];

      return {
        id: arxivId,
        url: entry.url,
        title: entry.title.replace(/\s+/g, ' ').trim(),
        summary: entry.summary.replace(/\s+/g, ' ').trim(),
        published: entry.published,
        authors: entry.authors || []
      };
    });

    return {
      totalResults: results.totalResults,
      papers: papers
    };
  } catch (error) {
    console.error("搜索 arXiv 论文时出错:", error);
    throw new Error(`搜索失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 工具函数：检查是否有 HTML 版本并获取内容
async function getArxivHtmlContent(arxivId: string): Promise<string | null> {
  try {
    const cleanArxivId = arxivId.replace(/v\d+$/, '');
    const htmlUrl = `https://arxiv.org/html/${cleanArxivId}`;
    
    console.log(`尝试获取 HTML 版本: ${htmlUrl}`);
    
    const response = await axios({
      method: 'GET',
      url: htmlUrl,
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArXiv-Paper-MCP/1.0)'
      }
    });

    // 检查响应状态和内容类型
    if (response.status === 200 && response.headers['content-type']?.includes('text/html')) {
      const html = response.data;
      
      // 简单检查是否是有效的论文HTML（而不是错误页面）
      if (html.includes('ltx_document') || html.includes('ltx_page_main') || html.includes('ltx_abstract')) {
        console.log(`成功获取 HTML 版本: ${htmlUrl}`);
        return html;
      }
    }
    
    console.log(`HTML 版本不可用或无效: ${htmlUrl}`);
    return null;
  } catch (error) {
    console.log(`HTML 版本获取失败，将使用 PDF: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// 工具函数：从 HTML 中提取文本内容
function extractTextFromHtml(html: string): string {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // 移除脚本和样式标签
    const scripts = document.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());
    
    // 获取主要内容区域
    let mainContent = document.querySelector('.ltx_page_main') || 
                     document.querySelector('.ltx_document') || 
                     document.querySelector('body');
    
    if (!mainContent) {
      throw new Error('无法找到主要内容区域');
    }
    
    // 提取文本内容
    let text = mainContent.textContent || '';
    
    // 清理文本：移除多余的空白字符
    text = text.replace(/\s+/g, ' ').trim();
    
    if (text.length < 100) {
      throw new Error('HTML 文本内容过少');
    }
    
    return text;
  } catch (error) {
    console.error("HTML 文本提取失败:", error);
    throw new Error(`HTML 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
// 工具函数：获取指定领域最新论文
async function getRecentPapers(category: string = 'cs.AI'): Promise<{
  papers: Array<{
    id: string;
    title: string;
    authors: string[];
    summary: string;
    url: string;
  }>;
}> {
  try {
    const url = `https://arxiv.org/list/${category}/recent`;
    console.log(`正在获取 ${category} 领域最新论文: ${url}`);

    const response = await axios({
      method: 'GET',
      url: url,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArXiv-Paper-MCP/1.0)'
      }
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    const papers: Array<{
      id: string;
      title: string;
      authors: string[];
      summary: string;
      url: string;
    }> = [];

    // arXiv listing pages use <dt> and <dd> pairs
    const dts = document.querySelectorAll('dt');
    const dds = document.querySelectorAll('dd');

    const count = Math.min(dts.length, dds.length);

    for (let i = 0; i < count; i++) {
      const dt = dts[i];
      const dd = dds[i];

      // Extract arXiv ID from the link in the <dt>
      const idLink = dt.querySelector('a[href^="/abs/"]');
      if (!idLink) continue;
      const href = idLink.getAttribute('href') || '';
      const id = href.replace('/abs/', '');
      if (!id) continue;

      // Extract title from <dd> - look for .list-title
      const titleEl = dd.querySelector('.list-title');
      const title = titleEl
        ? titleEl.textContent!.replace('Title:', '').trim()
        : '';

      // Extract authors from <dd> - look for .list-authors
      const authorsEl = dd.querySelector('.list-authors');
      const authors: string[] = [];
      if (authorsEl) {
        const authorLinks = authorsEl.querySelectorAll('a');
        authorLinks.forEach((a: HTMLAnchorElement) => {
          const name = a.textContent!.trim();
          if (name) authors.push(name);
        });
      }

      // Extract abstract/summary from <dd> - look for .mathjax or .abstract
      const abstractEl = dd.querySelector('.mathjax') || dd.querySelector('.abstract');
      let summary = '';
      if (abstractEl) {
        summary = (abstractEl.textContent || '').trim().substring(0, 500);
      }

      papers.push({
        id,
        title,
        authors,
        summary,
        url: `https://arxiv.org/abs/${id}`,
      });
    }

    console.log(`成功解析 ${papers.length} 篇 ${category} 最新论文`);
    return { papers };
  } catch (error) {
    console.error(`获取 ${category} 最新论文时出错:`, error);
    throw new Error(`获取最新论文失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
// 工具函数：获取 arXiv PDF 下载链接
function getArxivPdfUrl(input: string): string {
  try {
    let arxivId: string;
    let pdfUrl: string;

    if (input.startsWith('http://') || input.startsWith('https://')) {
      const urlParts = input.split('/');
      arxivId = urlParts[urlParts.length - 1];
      pdfUrl = input.replace('http://', 'https://').replace('/abs/', '/pdf/') + '.pdf';
    } else {
      arxivId = input;
      pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    }

    return pdfUrl;
  } catch (error) {
    console.error("获取 PDF 链接时出错:", error);
    throw new Error(`获取PDF链接失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 工具函数：下载临时 PDF 文件
async function downloadTempPdf(pdfUrl: string): Promise<string> {
  try {
    console.log(`正在下载临时 PDF: ${pdfUrl}`);

    const response = await axios({
      method: 'GET',
      url: pdfUrl,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArXiv-Paper-MCP/1.0)'
      }
    });

    // 创建临时文件路径
    const tempPath = path.join(tmpdir(), `arxiv_temp_${Date.now()}.pdf`);
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    return new Promise<string>((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`临时 PDF 下载完成: ${tempPath}`);
        resolve(tempPath);
      });
      writer.on('error', (error) => {
        console.error(`临时 PDF 下载失败: ${error}`);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(error);
      });
    });
  } catch (error) {
    console.error("下载临时 PDF 时出错:", error);
    throw new Error(`下载失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 工具函数：提取 PDF 文本内容
async function extractPdfText(pdfPath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const text = data.text.replace(/\s+/g, ' ').trim();
    if (text.length < 100) {
      throw new Error("PDF 文本提取失败或内容过少");
    }
    return text;
  } catch (error) {
    console.error("PDF 解析失败:", error);
    throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 工具函数：解析论文内容（优先 HTML，回退 PDF）
async function parsePaperContent(input: string, paperInfo?: any): Promise<{content: string, source: 'html' | 'pdf'}> {
  let tempPdfPath: string | null = null;
  
  try {
    // 获取 arXiv ID
    let arxivId: string;
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const urlParts = input.split('/');
      arxivId = urlParts[urlParts.length - 1];
    } else {
      arxivId = input;
    }
    
    // 首先尝试获取 HTML 版本
    console.log("尝试获取 HTML 版本...");
    const htmlContent = await getArxivHtmlContent(arxivId);
    
    let paperText: string;
    let source: 'html' | 'pdf';
    
    if (htmlContent) {
      // 使用 HTML 版本
      console.log("使用 HTML 版本解析内容");
      paperText = extractTextFromHtml(htmlContent);
      source = 'html';
    } else {
      // 回退到 PDF 版本
      console.log("HTML 版本不可用，回退到 PDF 版本");
      const pdfUrl = getArxivPdfUrl(input);
      tempPdfPath = await downloadTempPdf(pdfUrl);
      paperText = await extractPdfText(tempPdfPath);
      source = 'pdf';
    }
    
    // 构建输出内容
    let outputContent = '';

    if (paperInfo) {
      outputContent += `=== 论文信息 ===\n`;
      outputContent += `标题: ${paperInfo.title}\n`;
      outputContent += `arXiv ID: ${arxivId}\n`;
      outputContent += `发布日期: ${paperInfo.published}\n`;
      outputContent += `内容来源: ${source.toUpperCase()}\n`;

      if (paperInfo.authors && paperInfo.authors.length > 0) {
        outputContent += `作者: ${paperInfo.authors.map((author: any) => author.name || author).join(', ')}\n`;
      }

      outputContent += `摘要: ${paperInfo.summary}\n`;
      outputContent += `\n=== 论文内容 ===\n\n`;
    } else {
      outputContent += `=== 论文内容 (来源: ${source.toUpperCase()}) ===\n\n`;
    }

    outputContent += paperText;

    return { content: outputContent, source };
  } catch (error) {
    console.error("解析论文内容时出错:", error);
    throw new Error(`论文内容解析失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // 清理临时 PDF 文件
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      try {
        fs.unlinkSync(tempPdfPath);
        console.log(`临时文件已删除: ${tempPdfPath}`);
      } catch (cleanupError) {
        console.warn(`清理临时文件失败: ${cleanupError}`);
      }
    }
  }
}

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_arxiv",
        description: "搜索 arXiv 论文，支持按关键词、作者、学科分类、日期范围筛选，支持自定义排序",
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
        description: "获取 arXiv 指定领域最新论文。支持任意 arXiv 分类，如 cs.AI（人工智能）、cs.CL（计算语言学）、cs.CV（计算机视觉）、cs.LG（机器学习）、stat.ML（统计机器学习）、cs.NE（神经与进化计算）、cs.IR（信息检索）等。",
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
              description: "arXiv 论文URL（如：http://arxiv.org/abs/2403.15137v1）或 arXiv ID（如：2403.15137v1）"
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

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_arxiv": {
        const {
          query,
          maxResults = 5,
          author,
          categories,
          date_from,
          date_to,
          sort_by,
          sort_order,
        } = args as {
          query: string;
          maxResults?: number;
          author?: string;
          categories?: string[];
          date_from?: string;
          date_to?: string;
          sort_by?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
          sort_order?: 'ascending' | 'descending';
        };
        const results = await searchArxivPapers({
          query,
          maxResults,
          author,
          categories,
          dateFrom: date_from,
          dateTo: date_to,
          sortBy: sort_by,
          sortOrder: sort_order,
        });

        return {
          content: [{
            type: "text",
            text: `找到 ${results.papers.length} 篇相关论文（总计 ${results.totalResults} 篇）：\n\n${results.papers.map((paper, index) =>
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

// 启动服务器
console.log("启动 ArXiv Paper MCP Server...");

const transport = new StdioServerTransport();
await server.connect(transport);

console.log("🚀 ArXiv Paper MCP Server 已启动，等待连接...");