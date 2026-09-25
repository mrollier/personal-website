// Runs every self-check in turn; each file throws on its first failed assertion. Run: npm test
import './check-llna.ts';
import './check-net.ts';
import './check-life.ts';
console.log('all checks passed');
