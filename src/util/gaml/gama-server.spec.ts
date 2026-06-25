import { parseErrors, GamaServerClient } from './gama-server';

describe('parseErrors', () => {
  it('renvoie un tableau vide pour null/undefined', () => {
    expect(parseErrors(null)).toEqual([]);
    expect(parseErrors(undefined)).toEqual([]);
  });

  it('garde une liste de chaînes (cas gama-server validate)', () => {
    const content = [
      "Symbol 'reflex' seems to be incomplete or misplaced",
      "Unexpected symbol 'aspect'",
    ];
    expect(parseErrors(content)).toEqual(content);
  });

  it('extrait .message des objets erreur', () => {
    const content = [{ message: 'erreur A', line: 12 }, { message: 'erreur B' }];
    expect(parseErrors(content)).toEqual(['erreur A', 'erreur B']);
  });

  it('déplie un objet { errors: [...] } (GamaCompilationFailedException)', () => {
    const content = {
      exception: 'GamaCompilationFailedException',
      message: 'compilation errors',
      errors: ['e1', { message: 'e2' }],
    };
    expect(parseErrors(content)).toEqual(['e1', 'e2']);
  });

  it('retombe sur message si pas de errors', () => {
    expect(parseErrors({ message: 'boom' })).toEqual(['boom']);
  });

  it('gère une chaîne brute', () => {
    expect(parseErrors('texte')).toEqual(['texte']);
  });
});

describe('GamaServerClient', () => {
  it('expose isAvailable() (booléen, selon présence de GAMA headless)', () => {
    const client = new GamaServerClient();
    expect(typeof client.isAvailable()).toBe('boolean');
  });

  it('retourne available=false si GAMA est absent (port libre, pas de bat)', async () => {
    const original = process.env.GAMA_HEADLESS;
    process.env.GAMA_HEADLESS = 'C:\\chemin\\inexistant\\gama-headless.bat';
    try {
      const client = new GamaServerClient(59999);
      const res = await client.validate('model A');
      expect(res.available).toBe(false);
      expect(res.compiled).toBe(false);
    } finally {
      if (original === undefined) delete process.env.GAMA_HEADLESS;
      else process.env.GAMA_HEADLESS = original;
    }
  });
});
