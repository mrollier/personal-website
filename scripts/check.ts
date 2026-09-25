// Runs every self-check in turn; each file throws on its first failed assertion. Run: npm test
import './check-llna.ts';
import './check-net.ts';
import './check-life.ts';
import './check-variants.ts';
import './check-centrality.ts';
console.log('all checks passed');
