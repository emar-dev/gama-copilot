import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { extractPdf } from '../util/pdf/extract';
import { cleanText } from '../util/pdf/cleaner';
import { chunkText, searchChunks} from 'src/util/chunking/chunck';

@Injectable()
export class AiService {
  private model = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
  });

  async ask(question: string) {
    const response = await this.model.invoke(question);
    return response.content;
  }

//     async ask(question: string) {
//     const response = await fetch('http://localhost:11434/api/generate', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         model: 'llama3',
//         prompt: question,
//         stream: false,
//       }),
//     });

//     const data = await response.json();
//     return data.response;
//   }
  async getPDFText(path: string) {
    const result = await extractPdf(path);
    const text = cleanText(result);
    const chunks = chunkText(text);
    const relevantChunks= searchChunks(chunks, text, 3);
    return relevantChunks.map(c => c.text).join('\n\n');
  }
}