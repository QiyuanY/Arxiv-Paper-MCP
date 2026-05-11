import axios from "axios";
import { JSDOM } from "jsdom";

export async function getRecentPapers(category: string = 'cs.AI', maxResults: number = 10): Promise<{
  papers: Array<{
    id: string;
    title: string;
    authors: string[];
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
      url: string;
    }> = [];

    const dts = document.querySelectorAll('dt');
    const dds = document.querySelectorAll('dd');
    const count = Math.min(dts.length, dds.length);

    for (let i = 0; i < count; i++) {
      const dt = dts[i];
      const dd = dds[i];

      const idLink = dt.querySelector('a[href^="/abs/"]');
      if (!idLink) continue;
      const href = idLink.getAttribute('href') || '';
      const id = href.replace('/abs/', '');
      if (!id) continue;

      const titleEl = dd.querySelector('.list-title');
      const title = titleEl
        ? titleEl.textContent!.replace('Title:', '').trim()
        : '';

      const authorsEl = dd.querySelector('.list-authors');
      const authors: string[] = [];
      if (authorsEl) {
        const authorLinks = authorsEl.querySelectorAll('a');
        authorLinks.forEach((a: HTMLAnchorElement) => {
          const name = a.textContent!.trim();
          if (name) authors.push(name);
        });
      }

      papers.push({
        id,
        title,
        authors,
        url: `https://arxiv.org/abs/${id}`,
      });
    }

    console.log(`成功解析 ${papers.length} 篇 ${category} 最新论文`);
    return { papers: papers.slice(0, maxResults) };
  } catch (error) {
    console.error(`获取 ${category} 最新论文时出错:`, error);
    throw new Error(`获取最新论文失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
