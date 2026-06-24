import { RagService } from '../src/ai/rag.service';
import { AiService } from '../src/ai/ai.service';

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();

  const ai = new AiService(rag);

  const question = process.env.Q ?? 'Comment définir une species en GAML ? Donne un court exemple.';
  console.log('Q:', question, '\n');

  const start = Date.now();
  const res = await ai.chat(question);
  console.log('ANSWER:\n', res.answer);
  console.log('\nSOURCES:', JSON.stringify(res.sources));
  console.log(`\n(${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

main().catch((err) => {
  console.error('CHAT SMOKE FAIL ->', err);
  process.exit(1);
});
