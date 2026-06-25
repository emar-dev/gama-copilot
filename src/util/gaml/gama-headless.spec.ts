import { extractExperimentName, gamaHeadlessPath } from './gama-headless';

describe('extractExperimentName', () => {
  it('finds the experiment name', () => {
    const code = 'model T\nexperiment MySim type: gui { }';
    expect(extractExperimentName(code)).toBe('MySim');
  });

  it('returns undefined when no experiment', () => {
    expect(extractExperimentName('model T\nspecies A { }')).toBeUndefined();
  });

  it('returns the first experiment when several exist', () => {
    const code = 'experiment First type: gui {}\nexperiment Second type: batch {}';
    expect(extractExperimentName(code)).toBe('First');
  });
});

describe('gamaHeadlessPath', () => {
  const original = process.env.GAMA_HEADLESS;
  afterEach(() => {
    if (original === undefined) delete process.env.GAMA_HEADLESS;
    else process.env.GAMA_HEADLESS = original;
  });

  it('returns null when the configured path does not exist', () => {
    process.env.GAMA_HEADLESS = 'Z:\\nope\\gama-headless.bat';
    expect(gamaHeadlessPath()).toBeNull();
  });
});
