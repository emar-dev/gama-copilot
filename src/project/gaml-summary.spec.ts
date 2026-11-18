import { summarizeGaml } from './gaml-summary';

const HOSPITAL = `
model hopital

// Effectifs de départ
global {
  int nb_patients <- 120;
  int nb_doctors <- 24;
  float arrival_rate <- 0.3;
  geometry shape <- square(200);
  init {
    create patient number: nb_patients;
    create doctor number: nb_doctors;
    create nurse number: 36;
  }
}

species patient skills: [moving] {
  bool is_waiting <- true;
  float waiting_time <- 0.0;
  reflex wander when: is_waiting { do wander; }
  reflex wait { waiting_time <- waiting_time + 1; }
  aspect default { draw circle(1) color: #blue; }
}

species doctor parent: staff skills: [moving, communicating] {
  int capacity <- 4;
  action treat(patient p) { ask p { is_waiting <- false; } }
  aspect base { draw square(2) color: #red; }
}

species nurse { }

grid ward width: 10 height: 5 { }

experiment "Gestion hospitalière" type: gui {
  parameter "Patients" var: nb_patients min: 10 max: 500;
  parameter "Médecins" var: nb_doctors;
  output {
    display carte { species patient; species doctor; }
  }
}

experiment batch_run type: batch { }
`;

describe('summarizeGaml', () => {
  const summary = summarizeGaml(HOSPITAL);

  it('lit le nom du modèle et les variables globales', () => {
    expect(summary.model).toBe('hopital');
    expect(summary.globals.map((g) => g.name)).toEqual([
      'nb_patients',
      'nb_doctors',
      'arrival_rate',
      'shape',
    ]);
    expect(summary.globals[0]).toEqual({
      type: 'int',
      name: 'nb_patients',
      initial: '120',
    });
  });

  it('lit les espèces, leurs compétences, attributs, réflexes et effectifs', () => {
    expect(summary.species.map((s) => s.name)).toEqual([
      'patient',
      'doctor',
      'nurse',
      'ward',
    ]);
    const [patient, doctor, nurse, ward] = summary.species;
    expect(patient.skills).toEqual(['moving']);
    expect(patient.attributes.map((a) => a.name)).toEqual([
      'is_waiting',
      'waiting_time',
    ]);
    expect(patient.reflexes).toEqual(['wander', 'wait']);
    expect(patient.aspects).toEqual(['default']);
    expect(patient.initialCount).toBe(120);

    expect(doctor.parent).toBe('staff');
    expect(doctor.skills).toEqual(['moving', 'communicating']);
    expect(doctor.actions).toEqual(['treat']);
    expect(doctor.initialCount).toBe(24);

    expect(nurse.initialCount).toBe(36);
    expect(ward.kind).toBe('grid');
    expect(ward.initialCount).toBe(50);
  });

  it('lit les expériences, leur type, paramètres et affichages', () => {
    expect(summary.experiments).toEqual([
      {
        name: 'Gestion hospitalière',
        type: 'gui',
        parameters: [
          { label: 'Patients', variable: 'nb_patients' },
          { label: 'Médecins', variable: 'nb_doctors' },
        ],
        displays: ['carte'],
      },
      { name: 'batch_run', type: 'batch', parameters: [], displays: [] },
    ]);
  });

  it('ignore ce qui est en commentaire ou dans une chaîne', () => {
    const s = summarizeGaml(
      'model m\n// species fantome { }\n/* species autre { } */\nglobal { string t <- "species piege { }"; }\nspecies vraie { }\n',
    );
    expect(s.species.map((x) => x.name)).toEqual(['vraie']);
  });

  it('tolère un modèle vide ou incomplet', () => {
    expect(summarizeGaml('')).toEqual({
      model: null,
      lines: 1,
      globals: [],
      species: [],
      experiments: [],
    });
    expect(summarizeGaml('model x\nspecies a {').species[0].name).toBe('a');
  });
});
