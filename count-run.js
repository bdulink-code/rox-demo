const RUN_KEY = 'bar001-a7d6046e8be5:rox:count-run:v1';

export function loadRun(counts) {
  try {
    const run = JSON.parse(localStorage.getItem(RUN_KEY));
    if (run && (run.afterId === null || counts.some(count => count.id === run.afterId))) return run;
  } catch {
    // The shelf still works when the browser disallows storage.
  }
  return null;
}

export function saveRun(run) {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch {}
}

export function runProgress(run, counts, products) {
  if (!run) return { done: new Set(), next: null };
  const baseline = counts.findIndex(count => count.id === run.afterId);
  const done = new Set(counts.slice(baseline + 1).map(count => count.productId));
  return { done, next: products.find(product => !done.has(product.id)) ?? null };
}
