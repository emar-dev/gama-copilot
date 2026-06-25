/** Descripteur de projet Eclipse reconnu par GAMA (.project). */
export function gamaProjectDescriptor(name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
\t<name>${name}</name>
\t<comment></comment>
\t<projects>
\t</projects>
\t<buildSpec>
\t\t<buildCommand>
\t\t\t<name>msi.gama.application.gamaBuilder</name>
\t\t\t<arguments>
\t\t\t</arguments>
\t\t</buildCommand>
\t</buildSpec>
\t<natures>
\t\t<nature>msi.gama.application.gamaNature</nature>
\t\t<nature>msi.gama.application.testNature</nature>
\t</natures>
</projectDescription>
`;
}

/** Sous-dossiers standard d'un projet GAMA. */
export const PROJECT_DIRS = ['models', 'includes', 'results'] as const;
