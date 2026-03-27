import fs from 'fs';
import { PDFParse } from 'pdf-parse';

export async function extractPdf(path: string) {
    // const data = await fetch(path);
    // const arrayBuffer = await data.arrayBuffer();
    // const buffer = Buffer.from(arrayBuffer);
    // const parser = new PDFParse({ data: buffer });
    // const result = await parser.getText();
    // return result.text;
    const buffer = fs.readFileSync(path);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
}