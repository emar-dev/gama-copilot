import { normalizeGaml } from './normalize';

describe('normalizeGaml', () => {
  it('corrige `color::green` en `color: #green` dans un draw', () => {
    expect(normalizeGaml('draw circle(10) color::green;')).toBe('draw circle(10) color: #green;');
  });

  it('ajoute le # manquant à une couleur nommée', () => {
    expect(normalizeGaml('draw square(2) color: red;')).toBe('draw square(2) color: #red;');
  });

  it('laisse intacte une couleur déjà correcte', () => {
    expect(normalizeGaml('draw circle(1.0) color: #blue;')).toBe('draw circle(1.0) color: #blue;');
  });

  it('ne touche pas rgb(...) ni les variables', () => {
    expect(normalizeGaml('draw circle(1) color: rgb(255,0,0);')).toBe(
      'draw circle(1) color: rgb(255,0,0);',
    );
    expect(normalizeGaml('draw circle(1) color: maCouleur;')).toBe(
      'draw circle(1) color: maCouleur;',
    );
  });

  it('ne casse pas une map `with: [color::green]` (::légitime)', () => {
    const line = 'create Prey number: 5 with: [shape::circle(10), color::green];';
    expect(normalizeGaml(line)).toBe(line);
  });

  it('corrige `empty? x` et `not empty?(x)`', () => {
    expect(normalizeGaml('if (not empty? targets) {')).toBe('if (not empty(targets)) {');
    expect(normalizeGaml('bool b <- empty?(liste);')).toBe('bool b <- empty(liste);');
  });

  it('corrige `count:` en `number:` à la création', () => {
    expect(normalizeGaml('create People count: 10;')).toBe('create People number: 10;');
  });

  it('corrige `ask cible die;`', () => {
    expect(normalizeGaml('ask one_of_prey die;')).toBe('ask one_of_prey { do die; }');
  });

  it('préserve un modèle déjà valide', () => {
    const ok = [
      'model Good',
      'species P {',
      '    aspect default { draw circle(1.0) color: #red; }',
      '}',
    ].join('\n');
    expect(normalizeGaml(ok)).toBe(ok);
  });
});
