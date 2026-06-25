import { BaseMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { extractAgentAnswer, extractToolSteps, parseTextToolCall, findPendingToolCall, isDocQuestion } from './agent.utils';

describe('agent.utils', () => {
  it('extractAgentAnswer retourne le dernier message AI', () => {
    const messages: BaseMessage[] = [
      new AIMessage('première réponse'),
      new ToolMessage({ content: 'ok', tool_call_id: '1' }),
      new AIMessage('réponse finale'),
    ];
    expect(extractAgentAnswer(messages)).toBe('réponse finale');
  });

  it('extractAgentAnswer retourne une chaîne vide si pas de AI', () => {
    expect(extractAgentAnswer([])).toBe('');
  });

  it('extractAgentAnswer ignore un JSON d\'appel d\'outil', () => {
    const messages: BaseMessage[] = [
      new AIMessage('{"name":"search_docs","arguments":{"query":"species"}}'),
      new AIMessage('Une species est un type d\'agent.'),
    ];
    expect(extractAgentAnswer(messages)).toBe("Une species est un type d'agent.");
  });

  it('parseTextToolCall détecte un JSON outil', () => {
    const raw = '{"name":"search_docs","arguments":{"query":"species"}}';
    expect(parseTextToolCall(raw)).toEqual({
      name: 'search_docs',
      arguments: { query: 'species' },
    });
  });

  it('findPendingToolCall détecte un JSON outil dans un AIMessage', () => {
    const messages: BaseMessage[] = [
      new AIMessage('{"name":"search_docs","arguments":{"query":"species"}}'),
    ];
    expect(findPendingToolCall(messages)).toEqual({
      name: 'search_docs',
      arguments: { query: 'species' },
    });
  });

  it('findPendingToolCall détecte tool_calls natifs', () => {
    const messages: BaseMessage[] = [
      new AIMessage({
        content: '',
        tool_calls: [{ id: '1', name: 'search_docs', args: { query: 'GAML' } }],
      }),
    ];
    expect(findPendingToolCall(messages)?.name).toBe('search_docs');
  });

  it('isDocQuestion détecte les questions GAML', () => {
    expect(isDocQuestion("Qu'est-ce qu'une species en GAML ?")).toBe(true);
    expect(isDocQuestion('À quoi sert un bloc experiment ?')).toBe(true);
    expect(isDocQuestion('Crée un projet DemoAgents avec des agents')).toBe(false);
  });

  it('extractToolSteps liste les ToolMessage', () => {
    const messages: BaseMessage[] = [
      new ToolMessage({ content: '{"found":2}', name: 'search_docs', tool_call_id: 'a' }),
      new ToolMessage({ content: 'done', name: 'write_file', tool_call_id: 'b' }),
    ];
    expect(extractToolSteps(messages)).toEqual([
      { tool: 'search_docs', content: '{"found":2}' },
      { tool: 'write_file', content: 'done' },
    ]);
  });
});
