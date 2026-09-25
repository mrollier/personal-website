// Dense linear algebra for small matrices, enough for Ch. 4: the eigenvalues of a symmetric matrix by
// Householder reduction to tridiagonal form followed by the implicit QL algorithm, and a QR factorisation
// by modified Gram–Schmidt for Benettin's method. Row-major Float64Arrays. Pure, no DOM, safe in a worker.

/** Eigenvalues of the symmetric n × n matrix A, ascending; with `vectors`, the eigenvectors as the columns of the returned matrix. */
export function symEigen(A: Float64Array, n: number, vectors = false): { values: Float64Array; vectors?: Float64Array } {
  const z = Float64Array.from(A), d = new Float64Array(n), e = new Float64Array(n);
  tred2(z, n, d, e, vectors);
  tqli(d, e, n, vectors ? z : null);
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b]);
  const values = Float64Array.from(idx, (i) => d[i]);
  if (!vectors) return { values };
  const V = new Float64Array(n * n);
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) V[r * n + c] = z[r * n + idx[c]];
  return { values, vectors: V };
}

/** Householder reduction of a symmetric matrix to tridiagonal form (Numerical Recipes tred2, 0-based). On return d holds the
 * diagonal and e the sub-diagonal (e[0] = 0); with `wantV`, a holds the orthogonal transformation. */
function tred2(a: Float64Array, n: number, d: Float64Array, e: Float64Array, wantV: boolean): void {
  for (let i = n - 1; i > 0; i--) {
    const l = i - 1; let h = 0, scale = 0;
    if (l > 0) {
      for (let k = 0; k <= l; k++) scale += Math.abs(a[i * n + k]);
      if (scale === 0) e[i] = a[i * n + l];
      else {
        for (let k = 0; k <= l; k++) { a[i * n + k] /= scale; h += a[i * n + k] * a[i * n + k]; }
        let f = a[i * n + l]; const g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
        e[i] = scale * g; h -= f * g; a[i * n + l] = f - g; f = 0;
        for (let j = 0; j <= l; j++) {
          if (wantV) a[j * n + i] = a[i * n + j] / h;
          let g2 = 0;
          for (let k = 0; k <= j; k++) g2 += a[j * n + k] * a[i * n + k];
          for (let k = j + 1; k <= l; k++) g2 += a[k * n + j] * a[i * n + k];
          e[j] = g2 / h; f += e[j] * a[i * n + j];
        }
        const hh = f / (h + h);
        for (let j = 0; j <= l; j++) {
          const f2 = a[i * n + j], g2 = e[j] - hh * f2; e[j] = g2;
          for (let k = 0; k <= j; k++) a[j * n + k] -= f2 * e[k] + g2 * a[i * n + k];
        }
      }
    } else e[i] = a[i * n + l];
    d[i] = h;
  }
  d[0] = 0; e[0] = 0;
  for (let i = 0; i < n; i++) {
    if (wantV) {
      if (d[i] !== 0) {
        for (let j = 0; j < i; j++) {
          let g = 0;
          for (let k = 0; k < i; k++) g += a[i * n + k] * a[k * n + j];
          for (let k = 0; k < i; k++) a[k * n + j] -= g * a[k * n + i];
        }
      }
      d[i] = a[i * n + i]; a[i * n + i] = 1;
      for (let j = 0; j < i; j++) a[j * n + i] = a[i * n + j] = 0;
    } else d[i] = a[i * n + i];
  }
}

/** Implicit QL with shifts on a tridiagonal matrix (Numerical Recipes tqli, 0-based); z accumulates the eigenvectors when given. */
function tqli(d: Float64Array, e: Float64Array, n: number, z: Float64Array | null): void {
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  for (let l = 0; l < n; l++) {
    let iter = 0, m: number;
    do {
      for (m = l; m < n - 1; m++) { const dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= Number.EPSILON * dd) break; }
      if (m !== l) {
        if (iter++ === 60) throw new Error('too many iterations in tqli');
        let g = (d[l + 1] - d[l]) / (2 * e[l]), r = Math.hypot(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let s = 1, c = 1, p = 0, i: number;
        for (i = m - 1; i >= l; i--) {
          let f = s * e[i], b = c * e[i];
          e[i + 1] = r = Math.hypot(f, g);
          if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
          s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b; p = s * r; d[i + 1] = g + p; g = c * r - b;
          if (z) for (let k = 0; k < n; k++) { f = z[k * n + i + 1]; z[k * n + i + 1] = s * z[k * n + i] + c * f; z[k * n + i] = c * z[k * n + i] - s * f; }
        }
        if (r === 0 && i >= l) continue;
        d[l] -= p; e[l] = g; e[m] = 0;
      }
    } while (m !== l);
  }
}

/** QR by modified Gram–Schmidt on the columns of the n × n matrix M: Q orthonormal, R upper triangular with the column norms
 * on its diagonal, which is all Benettin's method reads. Columns that vanish get a zero diagonal entry. */
export function qr(M: Float64Array, n: number): { Q: Float64Array; R: Float64Array } {
  const Q = Float64Array.from(M), R = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < j; i++) {
      let dot = 0; for (let k = 0; k < n; k++) dot += Q[k * n + i] * Q[k * n + j];
      R[i * n + j] = dot;
      for (let k = 0; k < n; k++) Q[k * n + j] -= dot * Q[k * n + i];
    }
    let norm = 0; for (let k = 0; k < n; k++) norm += Q[k * n + j] * Q[k * n + j];
    norm = Math.sqrt(norm); R[j * n + j] = norm;
    if (norm > 0) for (let k = 0; k < n; k++) Q[k * n + j] /= norm;
  }
  return { Q, R };
}

/** y = A x for a row-major n × n matrix. */
export function matVec(A: Float64Array, n: number, x: Float64Array, y = new Float64Array(n)): Float64Array {
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < n; k++) s += A[i * n + k] * x[k]; y[i] = s; }
  return y;
}
