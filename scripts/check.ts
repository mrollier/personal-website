// Runs every self-check in turn; each file throws on its first failed assertion. Run: npm test
import './check-llna.ts';
import './check-net.ts';
import './check-life.ts';
import './check-variants.ts';
import './check-centrality.ts';
import './check-genotype.ts';
import './check-sync.ts';
import './check-consensus.ts';
import './check-tep.ts';
import './check-cnn.ts';
import './check-linalg.ts';
import './check-lyapunov.ts';
import './check-mosaic.ts';
console.log('all checks passed');
