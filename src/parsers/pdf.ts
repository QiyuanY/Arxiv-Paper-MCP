import * as fs from "fs";
import * as path from "path";
import { PDFParse } from "pdf-parse";
import { tmpdir } from "os";
import axios from "axios";

export async function downloadTempPdf(pdfUrl: string): Promise<string> {
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

export async function extractPdfText(pdfPath: string): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    const text = result.text.replace(/\s+/g, ' ').trim();
    if (text.length < 100) {
      throw new Error("PDF 文本提取失败或内容过少");
    }
    return text;
  } catch (error) {
    console.error("PDF 解析失败:", error);
    throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}
