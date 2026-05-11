declare module "pdf-parse" {
  export class PDFParse {
    constructor(options: { data: Buffer } | { url: string });
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  }
}
