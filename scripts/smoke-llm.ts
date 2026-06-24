import { ChatOllama } from '@langchain/ollama';

async function main() {
  const model = new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'llama3',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    temperature: 0,
  });

  const res = await model.invoke('Reponds en un mot: capitale de la France?');
  console.log('LLM OK ->', res.content);
}

main().catch((err) => {
  console.error('LLM FAIL ->', err);
  process.exit(1);
});
