import { arxivClient } from "../utils/arxiv.js";
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

    const sortParam = sortBy ? `&sortBy=${sortBy}` : '';
    const orderParam = sortOrder ? `&sortOrder=${sortOrder}` : '';

    // 如果有自定义排序或日期参数，使用原始 URL 调用 arXiv API
    if (sortParam || orderParam || dateFilter) {
      const fieldMap: Record<string, string> = { all: 'all', author: 'au', subject_category: 'cat' };
      const queryString = include.map(tag => {
        const field = fieldMap[tag.field] || tag.field;
        // 对多词查询加双引号以启用精确短语匹配
        const value = tag.value.includes(' ') ? `%22${encodeURIComponent(tag.value)}%22` : tag.value;
        return `${field}:${value}`;
      }).join('+AND+') + dateFilter;

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

      const result = { totalResults, papers };
      searchCache.set(cacheKey, result);
      return result;
    }

    // 使用 @agentic/arxiv 库的标准搜索
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

    const result = { totalResults: results.totalResults, papers };
    searchCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("搜索 arXiv 论文时出错:", error);
    throw new Error(`搜索失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
