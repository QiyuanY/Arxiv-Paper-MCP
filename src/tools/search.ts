import { searchCache } from "../utils/cache.js";
import axios from "axios";
import { JSDOM } from "jsdom";

export interface SearchOptions {
  query: string;
  maxResults?: number;
  author?: string;
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
}

export async function searchArxivPapers(options: SearchOptions): Promise<{totalResults: number, papers: any[]}> {
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
    const cacheKey = JSON.stringify({ query, maxResults, author, categories, dateFrom, dateTo, sortBy, sortOrder });
    const cached = searchCache.get(cacheKey);
    if (cached) {
      console.log(`使用搜索缓存: ${cacheKey}`);
      return cached;
    }

    const include: { field: string; value: string }[] = [
      { field: "all", value: query }
    ];

    if (author) {
      include.push({ field: "author", value: author });
    }

    if (categories && categories.length > 0) {
      include.push({ field: "subject_category", value: categories.join(" OR ") });
    }

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

    const sortParam = sortBy ? `&sortBy=${sortBy}` : '&sortBy=relevance';
    const orderParam = sortOrder ? `&sortOrder=${sortOrder}` : '&sortOrder=descending';

    const fieldMap: Record<string, string> = { all: 'all', author: 'au', subject_category: 'cat' };
    const queryString = include.map(tag => {
      const field = fieldMap[tag.field] || tag.field;
      // 对多词查询加双引号以启用精确短语匹配
      const value = tag.value.includes(' ') ? `%22${encodeURIComponent(tag.value)}%22` : tag.value;
      return `${field}:${value}`;
    }).join('+AND+') + dateFilter;

    const apiUrl = `https://export.arxiv.org/api/query?search_query=${queryString}&start=0&max_results=${maxResults}${sortParam}${orderParam}`;

    // arXiv API 限流重试（最多3次，间隔递增）
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await axios.get(apiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArXiv-Paper-MCP/1.0)' },
          timeout: 30000,
        });
        break;
      } catch (err: any) {
        if (err?.response?.status === 429 && attempt < 3) {
          const delay = attempt * 3000;
          console.log(`arXiv API 限流，${delay}ms 后重试（第 ${attempt} 次）...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      throw new Error('arXiv API 请求失败：无响应');
    }

    const dom = new JSDOM(response.data, { contentType: 'application/xml' });
    const doc = dom.window.document;

    // opensearch:totalResults 带命名空间前缀，需用完整标签名
    const totalResultsEl = doc.getElementsByTagName('opensearch:totalResults').item(0);
    const totalResults = parseInt(totalResultsEl?.textContent || '0', 10);
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

    const result = { totalResults, papers };
    searchCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("搜索 arXiv 论文时出错:", error);
    throw new Error(`搜索失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
