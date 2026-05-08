declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: object;
    metadata: object;
    text: string;
    version: string;
  }
  function pdf(dataBuffer: Buffer): Promise<PDFData>;
  export = pdf;
}
