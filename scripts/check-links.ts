// Links that leave the site open in a new tab; links on it do not (src/scripts/links.ts).
import assert from 'node:assert/strict';
import { externalLinks as x } from '../src/scripts/links.ts';

assert.equal(x('<a href="https://orcid.org/0000">ORCID</a>'), '<a href="https://orcid.org/0000" target="_blank" rel="noopener noreferrer">ORCID</a>');
assert.equal(x('<a class="b" href="https://github.com/x" rel="me">GitHub</a>'), '<a target="_blank" class="b" href="https://github.com/x" rel="me noopener noreferrer">GitHub</a>');
assert.equal(x('<a href="//huggingface.co/m">m</a>'), '<a href="//huggingface.co/m" target="_blank" rel="noopener noreferrer">m</a>');
for (const same of ['<a href="/demos/">d</a>', '<a href="https://michielrollier.be/demos/thesis/">t</a>', '<a href="https://www.michielrollier.be/">w</a>',
  '<a href="#top">t</a>', '<a href="mailto:a@b.c">m</a>', '<a href="https://doi.org/1" target="_self">d</a>', '<a name="x">'])
  assert.equal(x(same), same, same);
console.log('links ok');
