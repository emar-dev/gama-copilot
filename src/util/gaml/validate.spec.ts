import { validateGaml } from './validate';
import { extractGaml } from './extract';

describe('validateGaml', () => {
  const validModel = `model Test
global {
  init { create Bug number: 3; }
}
species Bug {
  reflex move { location <- location + {1.0, 0.0}; }
  aspect default { draw circle(1.0) color: #red; }
}
experiment Exp type: gui {
  output { display main { species Bug; } }
}`;

  it('accepts a well-formed model', () => {
    const res = validateGaml(validModel);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('flags empty code', () => {
    expect(validateGaml('').valid).toBe(false);
  });

  it('detects unbalanced braces', () => {
    const res = validateGaml('model T\nglobal { init { create A number: 1; }');
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/accolade/);
  });

  it('requires a model header', () => {
    const res = validateGaml('global { }');
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/model/);
  });

  it('does not count braces inside strings or comments', () => {
    const res = validateGaml('model T // accolade } ici\nglobal { string s <- "} {"; }');
    expect(res.valid).toBe(true);
  });

  it('warns when experiment is missing', () => {
    const res = validateGaml('model T\nspecies A { }');
    expect(res.warnings.join(' ')).toMatch(/experiment/);
  });
});

describe('extractGaml', () => {
  it('extracts a fenced gaml block', () => {
    const text = 'Voici le code:\n```gaml\nmodel A\n```\nFin.';
    expect(extractGaml(text)).toBe('model A');
  });

  it('extracts a generic fenced block', () => {
    expect(extractGaml('```\nmodel B\n```')).toBe('model B');
  });

  it('returns trimmed raw text when no fence', () => {
    expect(extractGaml('  model C  ')).toBe('model C');
  });
});
