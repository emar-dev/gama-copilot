import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

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
}