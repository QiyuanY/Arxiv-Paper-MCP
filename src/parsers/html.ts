import axios from "axios";
import { JSDOM } from "jsdom";

export async function getArxivHtmlContent(arxivId: string): Promise<string | null> {
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

    if (response.status === 200 && response.headers['content-type']?.includes('text/html')) {
      const html = response.data;

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

export function extractTextFromHtml(html: string): string {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const scripts = document.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());

    let mainContent = document.querySelector('.ltx_page_main') ||
                     document.querySelector('.ltx_document') ||
                     document.querySelector('body');

    if (!mainContent) {
      throw new Error('无法找到主要内容区域');
    }

    let text = mainContent.textContent || '';
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
