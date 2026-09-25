// An offscreen bitmap of W × H cells written one pixel at a time and then drawn scaled into a box:
// the cheap way to show a spacetime diagram, a big grid or a node × time pattern without a fillRect
// per cell. Reuses its buffer; `flush` after writing, `blit` when painting. Needs the DOM.
import type { Box } from './figure';
import type { RGB } from './palette';

export class Raster {
  readonly W: number;
  readonly H: number;
  private readonly c: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly d: Uint8ClampedArray;

  constructor(W: number, H: number) {
    this.W = W; this.H = H;
    this.c = document.createElement('canvas'); this.c.width = W; this.c.height = H;
    this.ctx = this.c.getContext('2d')!;
    this.img = this.ctx.createImageData(W, H); this.d = this.img.data;
  }

  /** One cell by index, opaque. */
  set(i: number, rgb: RGB): void {
    const k = i << 2; this.d[k] = rgb[0]; this.d[k + 1] = rgb[1]; this.d[k + 2] = rgb[2]; this.d[k + 3] = 255;
  }

  /** One cell, with alpha. */
  setA(i: number, rgb: RGB, a: number): void {
    const k = i << 2; this.d[k] = rgb[0]; this.d[k + 1] = rgb[1]; this.d[k + 2] = rgb[2]; this.d[k + 3] = a;
  }

  /** A whole row from a binary array: `on` where the value is non-zero, `off` elsewhere. */
  setRow(y: number, v: ArrayLike<number>, on: RGB, off: RGB, from = 0): void {
    for (let x = 0; x < this.W; x++) this.set(y * this.W + x, v[from + x] ? on : off);
  }

  fill(rgb: RGB): void { for (let i = 0; i < this.W * this.H; i++) this.set(i, rgb); }

  flush(): void { this.ctx.putImageData(this.img, 0, 0); }

  /** Draw scaled into the box, crisp cells unless `smooth`. */
  blit(ctx: CanvasRenderingContext2D, box: Box, smooth = false): void {
    ctx.save(); ctx.imageSmoothingEnabled = smooth;
    ctx.drawImage(this.c, box.x, box.y, box.w, box.h);
    ctx.restore();
  }
}
