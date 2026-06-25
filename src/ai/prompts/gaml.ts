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
  '',
  'Pièges fréquents à ÉVITER (erreurs de compilation classiques) :',
  '- Création : `create MaSpecies number: N;`  (JAMAIS `count:`).',
  '- Faire mourir un agent : `ask cible { do die; }`  (JAMAIS `ask cible die;`).',
  '- Appeler une action sur un autre agent : `ask cible { do monAction; }`.',
  '- Déclare CHAQUE variable avec son type avant usage : `int n <- 0;` `float e <- 1.0;`.',
  '- N’utilise pas `enum`, ni `case ... =>`, ni la syntaxe Java/classes.',
  '- Conditions : `if (cond) { ... } else { ... }`. Aléatoire : `rnd(min, max)` ou `flip(proba)`.',
  '- Couleurs : TOUJOURS `color: #red` (dièse obligatoire) ou `color: rgb(255,0,0)`.',
  '  Le double deux-points `::` N’EXISTE PAS pour une facette : écris `color: #green`, JAMAIS `color::green`.',
  '  `::` ne sert QUE dans une map (`["a"::1]`). Une facette s’écrit toujours `nom: valeur`.',
  '- À la création, ne mets PAS de `with: [shape::..., color::...]` : déclare plutôt les attributs',
  '  dans la species, puis fixe-les dans un `init` ou via l’aspect.',
  '- Affichage : `aspect default { draw circle(1.0) color: #red; }` et dans output `display d { species MaSpecies; }`.',
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

// Exemple VALIDÉ (compile dans GAMA) montrant les bons motifs d'interaction
// entre agents : recherche de voisins, sélection, action sur une autre espèce.
const GAML_INTERACTION_EXAMPLE = `model Interaction

global {
    init {
        create Prey number: 20;
        create Predator number: 5;
    }
}

species Prey {
    reflex move {
        location <- location + {rnd(-1.0, 1.0), rnd(-1.0, 1.0)};
    }
    aspect default {
        draw circle(1.0) color: #green;
    }
}

species Predator {
    float energy <- 10.0;
    reflex move {
        location <- location + {rnd(-1.0, 1.0), rnd(-1.0, 1.0)};
    }
    reflex hunt {
        list<Prey> nearby <- Prey at_distance 2.0;   // voisins d'une autre espèce
        if (not empty(nearby)) {
            Prey target <- one_of(nearby);           // en choisir un
            ask target { do die; }                   // agir sur l'autre agent
            energy <- energy + 1.0;                  // mettre à jour SON propre attribut
        }
    }
    aspect default {
        draw triangle(1.5) color: #red;
    }
}

experiment InteractionExp type: gui {
    output {
        display main {
            species Prey;
            species Predator;
        }
    }
}`;

export function buildGamlRepairPrompt(
  description: string,
  previousCode: string,
  feedback: string,
): string {
  const errors = feedback.trim()
    ? feedback
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `- ${line}`)
        .join('\n')
    : '- (compilation échouée, sans détail)';
  return [
    "Le modèle GAML suivant N'A PAS COMPILÉ dans GAMA.",
    '```gaml',
    previousCode,
    '```',
    '',
    'ERREURS DE COMPILATION renvoyées par GAMA (corrige-les TOUTES) :',
    errors,
    '',
    `DEMANDE INITIALE : ${description}`,
    '',
    'Corrige chacune de ces erreurs précisément. Reste simple : déclare toute variable utilisée,',
    'n’emploie que des mots-clés GAML standard, et évite les constructions exotiques.',
    'Réponds avec UN SEUL bloc ```gaml contenant le modèle complet corrigé.',
  ].join('\n');
}

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
    'Exemple de référence pour les INTERACTIONS entre agents (il compile dans GAMA) :',
    '```gaml',
    GAML_INTERACTION_EXAMPLE,
    '```',
    'Inspire-toi de ces motifs : `Espece at_distance d` pour les voisins, `one_of(liste)`',
    'pour en choisir un, `ask cible { do die; }` pour agir sur un autre agent. N’invente pas',
    '`ask X with (...)` ni `agent die;` : ce ne sont PAS du GAML valide.',
    '',
    `DEMANDE : ${description}`,
    '',
    'Génère maintenant le modèle GAML complet correspondant à la demande.',
  ].join('\n');
}
