// Client for sim.worker.ts: one instance per figure, the worker created on the first run and thrown
// away on cancel, so a job that is still looping cannot hold the page. Re-running cancels the run before.
export type Progress = (p: number, partial?: unknown) => void;

export class Jobs {
  private w: Worker | null = null;
  private id = 0;
  private pending: { id: number; resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: Progress } | null = null;

  get busy(): boolean { return this.pending !== null; }

  run<R>(kind: string, params: unknown, onProgress?: Progress): Promise<R> {
    this.cancel();
    const id = ++this.id;
    return new Promise<R>((resolve, reject) => {
      this.pending = { id, resolve, reject, onProgress };
      this.worker().postMessage({ id, kind, params });
    });
  }

  /** Stops whatever is running; its promise rejects with a Cancelled error. */
  cancel(): void {
    if (this.w) { this.w.terminate(); this.w = null; }
    const p = this.pending; this.pending = null;
    p?.reject(new Cancelled());
  }

  private worker(): Worker {
    if (this.w) return this.w;
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; p?: number; partial?: unknown; done?: boolean; result?: unknown; error?: string }>) => {
      const m = e.data, p = this.pending;
      if (!p || m.id !== p.id) return;
      if (m.error) { this.pending = null; p.reject(new Error(m.error)); return; }
      if (m.done) { this.pending = null; p.resolve(m.result); return; }
      p.onProgress?.(m.p ?? 0, m.partial);
    };
    w.onerror = (e) => { const p = this.pending; this.pending = null; p?.reject(new Error(e.message)); };
    this.w = w;
    return w;
  }
}

export class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }
