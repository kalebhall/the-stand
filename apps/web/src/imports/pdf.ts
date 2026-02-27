import pdfParse from 'pdf-parse';

export async function extractPdfText(fileData: ArrayBuffer): Promise<string> {
  try {
    const buffer = Buffer.from(fileData);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract text from PDF: ${message}`);
  }
}