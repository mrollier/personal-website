// Self-check for src/scripts/linalg.ts. Run: npm test
import assert from 'node:assert/strict';
import { symEigen, qr, matVec } from '../src/scripts/linalg.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// The ring C₁₆: eigenvalues 2cos(2πj/16); the complete graph K₆: 5 once and −1 five times; the path P₃: −√2, 0, √2.
const n = 16, ring = new Float64Array(n * n);
for (let i = 0; i < n; i++) { ring[i * n + (i + 1) % n] = 1; ring[((i + 1) % n) * n + i] = 1; }
const want = Array.from({ length: n }, (_, j) => 2 * Math.cos((2 * Math.PI * j) / n)).sort((a, b) => a - b);
const got = symEigen(ring, n).values; for (let j = 0; j < n; j++) near(got[j], want[j], 1e-9);
const k6 = new Float64Array(36).fill(1); for (let i = 0; i < 6; i++) k6[i * 6 + i] = 0;
const ev6 = symEigen(k6, 6).values; near(ev6[5], 5); for (let i = 0; i < 5; i++) near(ev6[i], -1);
const p3 = Float64Array.from([0, 1, 0, 1, 0, 1, 0, 1, 0]), ev3 = symEigen(p3, 3, true);
near(ev3.values[0], -Math.SQRT2); near(ev3.values[1], 0); near(ev3.values[2], Math.SQRT2);
// Eigenvectors: A v = λ v and orthonormal.
const V = ev3.vectors!;
for (let c = 0; c < 3; c++) { const v = Float64Array.from({ length: 3 }, (_, r) => V[r * 3 + c]), Av = matVec(p3, 3, v); for (let r = 0; r < 3; r++) near(Av[r], ev3.values[c] * v[r], 1e-9); }
for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { let dot = 0; for (let r = 0; r < 3; r++) dot += V[r * 3 + a] * V[r * 3 + b]; near(dot, a === b ? 1 : 0, 1e-9); }
// A random symmetric 40 × 40 matrix: trace equals the sum of eigenvalues, and A V = V Λ.
let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const m = 40, A = new Float64Array(m * m);
for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { const v = rnd() - 0.5; A[i * m + j] = v; A[j * m + i] = v; }
const eg = symEigen(A, m, true); let tr = 0, sum = 0; for (let i = 0; i < m; i++) { tr += A[i * m + i]; sum += eg.values[i]; } near(tr, sum, 1e-9);
for (let c = 0; c < m; c += 7) { const v = Float64Array.from({ length: m }, (_, r) => eg.vectors![r * m + c]), Av = matVec(A, m, v); for (let r = 0; r < m; r++) near(Av[r], eg.values[c] * v[r], 1e-8); }
// QR: Q orthonormal, Q R = M, R upper triangular with positive diagonal.
const M = new Float64Array(m * m); for (let i = 0; i < m * m; i++) M[i] = rnd() - 0.5;
const { Q, R } = qr(M, m);
for (let a = 0; a < m; a += 5) for (let b = 0; b < m; b += 5) { let dot = 0; for (let r = 0; r < m; r++) dot += Q[r * m + a] * Q[r * m + b]; near(dot, a === b ? 1 : 0, 1e-9); }
for (let i = 0; i < m; i++) { assert.ok(R[i * m + i] > 0); for (let j = 0; j < i; j++) assert.equal(R[i * m + j], 0); }
for (let i = 0; i < m; i += 3) for (let j = 0; j < m; j += 3) { let v = 0; for (let k = 0; k < m; k++) v += Q[i * m + k] * R[k * m + j]; near(v, M[i * m + j], 1e-9); }

console.log('linalg ok');
