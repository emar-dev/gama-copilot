import { validateWithGamaServer, shutdownGamaServer } from '../src/util/gaml/gama-server';

const GOOD = `model Good

global {
    init {
        create People number: 10;
    }
}

species People {
    reflex move {
        location <- location + {rnd(-1.0, 1.0), rnd(-1.0, 1.0)};
    }
    aspect default {
        draw circle(1.0) color: #red;
    }
}

experiment GoodExp type: gui {
    output {
        display main {
            species People;
        }
    }
}`;

const BAD = `model Bad

global {
    init {
        create People number: 10;
    }
}

species People {
    reflex hunt {
        list<People> targets <- people in neighbors(2);
        if (not empty? targets) {
            ask one-of targets { do die; }
        }
    }
    aspect default {
        draw circle(1.0) color: red;
    }
}

experiment BadExp type: gui {
    output { display main { species People; } }
}`;

async function main() {
  console.log('--- GOOD model ---');
  const good = await validateWithGamaServer(GOOD);
  console.log(JSON.stringify(good, null, 2));

  console.log('\n--- BAD model ---');
  const bad = await validateWithGamaServer(BAD);
  console.log(JSON.stringify(bad, null, 2));
}

main()
  .catch((err) => {
    console.error('VALIDATE SMOKE FAIL ->', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownGamaServer();
    process.exit(process.exitCode ?? 0);
  });
