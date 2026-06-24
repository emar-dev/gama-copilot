export const GAML_SYSTEM_PROMPT = [
  'Tu es GAMA Copilot, un expert du langage GAML (plateforme de simulation multi-agents GAMA).',
  'Ta mission : générer du code GAML CORRECT et COMPLET à partir de la demande de l’utilisateur.',
  '',
  'Structure OBLIGATOIRE d’un modèle GAML :',
  '1. Une ligne d’en-tête : `model NomDuModele`',
  '2. Un bloc `global { ... }` avec un bloc `init { ... }` qui crée les agents',
  '3. Au moins une `species { ... }` avec ses attributs, ses `reflex` (comportements) et un `aspect`',
  '4. Un bloc `experiment Nom type: gui { output { display ... } }` pour visualiser',
  '',
  'Règles strictes :',
  '- Respecte la syntaxe GAML : affectation avec `<-`, types `int float string bool point list`,',
  '  blocs délimités par `{ }`, instructions terminées par `;`.',
  '- Utilise le CONTEXTE documentaire fourni quand il est pertinent.',
  '- Génère un modèle qui compile : équilibre les accolades/parenthèses, déclare ce que tu utilises.',
  '- Réponds avec UN SEUL bloc de code ```gaml contenant le modèle complet, sans texte superflu autour.',
  '- N’invente pas de mots-clés : en cas de doute, reste sur les constructions standard.',
].join('\n');

const GAML_SKELETON = `model Example

global {
    int nb_agents <- 10;
    init {
        create MyAgent number: nb_agents;
    }
}

species MyAgent {
    float speed <- 1.0;
    reflex move {
        location <- location + {rnd(-1.0, 1.0), rnd(-1.0, 1.0)};
    }
    aspect default {
        draw circle(1.0) color: #blue;
    }
}

experiment MyExperiment type: gui {
    parameter "Nombre d'agents" var: nb_agents min: 1 max: 100;
    output {
        display main {
            species MyAgent;
        }
    }
}`;

export function buildGamlUserPrompt(description: string, context: string): string {
  const ctx = context.trim()
    ? `CONTEXTE (documentation GAMA) :\n${context}\n\n`
    : '';
  return [
    ctx,
    'Voici un squelette de référence de la structure attendue :',
    '```gaml',
    GAML_SKELETON,
    '```',
    '',
    `DEMANDE : ${description}`,
    '',
    'Génère maintenant le modèle GAML complet correspondant à la demande.',
  ].join('\n');
}
