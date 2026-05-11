import * as fs from "fs";
import { getArxivHtmlContent, extractTextFromHtml } from "../parsers/html.js";
import { downloadTempPdf, extractPdfText } from "../parsers/pdf.js";
import { paperContentCache } from "../utils/cache.js";

export function getArxivPdfUrl(input: string): string {
  try {
    let arxivId: string;

    if (input.startsWith('http://') || input.startsWith('https://')) {
      // 已经是 PDF 链接，直接返回
      if (input.includes('/pdf/')) {
        const normalized = input.replace('http://', 'https://');
        return normalized.endsWith('.pdf') ? normalized : normalized + '.pdf';
      }
      // 从 abs 链接提取 ID
      const urlParts = input.split('/');
      arxivId = urlParts[urlParts.length - 1];
    } else {
      arxivId = input;
    }

    // 去除 ID 中可能残留的版本号后的 .pdf
    arxivId = arxivId.replace(/\.pdf$/, '');

    return `https://arxiv.org/pdf/${arxivId}.pdf`;
  } catch (error) {
    console.error("获取 PDF 链接时出错:", error);
    throw new Error(`获取PDF链接失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function parsePaperContent(input: string, paperInfo?: any): Promise<{content: string, source: 'html' | 'pdf'}> {
  let tempPdfPath: string | null = null;

  try {
    let arxivId: string;
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const urlParts = input.split('/');
      arxivId = urlParts[urlParts.length - 1];
    } else {
      arxivId = input;
    }

    // 检查缓存
    const cleanId = arxivId.replace(/v\d+$/, '');
    const cached = paperContentCache.get(cleanId);
    if (cached) {
      console.log(`使用缓存内容: ${cleanId}`);
      let outputContent = '';
      if (paperInfo) {
        outputContent += `=== 论文信息 ===\n`;
        outputContent += `标题: ${paperInfo.title}\n`;
        outputContent += `arXiv ID: ${arxivId}\n`;
        outputContent += `发布日期: ${paperInfo.published}\n`;
        outputContent += `内容来源: ${cached.source.toUpperCase()} (缓存)\n`;
        if (paperInfo.authors && paperInfo.authors.length > 0) {
          outputContent += `作者: ${paperInfo.authors.map((author: any) => author.name || author).join(', ')}\n`;
        }
        outputContent += `摘要: ${paperInfo.summary}\n`;
        outputContent += `\n=== 论文内容 ===\n\n`;
      } else {
        outputContent += `=== 论文内容 (来源: ${cached.source.toUpperCase()}, 缓存) ===\n\n`;
      }
      outputContent += cached.content;
      return { content: outputContent, source: cached.source };
    }

    console.log("尝试获取 HTML 版本...");
    const htmlContent = await getArxivHtmlContent(arxivId);

    let paperText: string;
    let source: 'html' | 'pdf';

    if (htmlContent) {
      console.log("使用 HTML 版本解析内容");
      paperText = extractTextFromHtml(htmlContent);
      source = 'html';
    } else {
      console.log("HTML 版本不可用，回退到 PDF 版本");
      const pdfUrl = getArxivPdfUrl(input);
      tempPdfPath = await downloadTempPdf(pdfUrl);
      paperText = await extractPdfText(tempPdfPath);
      source = 'pdf';
    }

    // 写入缓存
    paperContentCache.set(cleanId, { content: paperText, source });

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
