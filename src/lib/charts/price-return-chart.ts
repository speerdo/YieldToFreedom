import { mountCompareYieldChartFromPayload } from './compare-yield-line';

const PRICE_COLOR = 'rgb(37, 99, 235)';

interface PricePoint { x: number; value: number; }
interface PriceHistBody { pricePoints?: PricePoint[]; totalReturnPoints?: PricePoint[]; }
type ChartRange = '1y' | '3y' | '5y' | '10y' | 'max';

export function mountPriceReturnChartsFromDom(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-ytf-price-return-chart]')) {
    const ticker = el.getAttribute('data-ytf-price-return-chart');
    if (!ticker) continue;
    void initPriceReturnChart(el, ticker);
  }
}

async function initPriceReturnChart(container: HTMLElement, ticker: string): Promise<void> {
  const canvasId = container.getAttribute('data-canvas-id') ?? '';
  const loadingEl = container.querySelector<HTMLElement>('[data-loading]');
  const emptyEl = container.querySelector<HTMLElement>('[data-empty]');
  const priceBtn = container.querySelector<HTMLButtonElement>('[data-mode="price"]');
  const trBtn = container.querySelector<HTMLButtonElement>('[data-mode="total-return"]');
  const rangeBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-range]'));
  const descEl = container.querySelector<HTMLElement>('[data-chart-desc]');

  let mode: 'price' | 'total-return' = 'price';
  let range: ChartRange = '5y';
  let pricePoints: PricePoint[] = [];
  let totalReturnPoints: PricePoint[] = [];

  const loadRange = async (): Promise<void> => {
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    pricePoints = [];
    totalReturnPoints = [];

    try {
      const res = await fetch(`/api/etfs/${encodeURIComponent(ticker)}/price-history?range=${range}`);
      if (res.ok) {
        const body = (await res.json()) as PriceHistBody;
        pricePoints = body.pricePoints ?? [];
        totalReturnPoints = body.totalReturnPoints ?? [];
      }
    } catch { /* leave empty */ }

    if (loadingEl) loadingEl.hidden = true;
  };

  await loadRange();

  if (!pricePoints.length) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  const render = (): void => {
    if (!pricePoints.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    const pts = mode === 'total-return' ? totalReturnPoints : pricePoints;
    mountCompareYieldChartFromPayload({
      canvasId,
      datasets: [{
        label: ticker,
        borderColor: PRICE_COLOR,
        points: pts.map((p) => ({ x: p.x, y: p.value })),
      }],
      yMode: mode === 'total-return' ? 'pct' : 'price',
    });
    if (descEl) {
      descEl.textContent = mode === 'total-return'
        ? 'Adjusted close total return, indexed from the selected start'
        : 'Adjusted closing price; splits and distributions are normalized';
    }
    for (const btn of [priceBtn, trBtn]) {
      if (!btn) continue;
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('bg-white', active);
      btn.classList.toggle('text-slate-900', active);
      btn.classList.toggle('shadow-sm', active);
      btn.classList.toggle('text-slate-500', !active);
    }
    for (const btn of rangeBtns) {
      const active = btn.dataset.range === range;
      btn.classList.toggle('bg-white', active);
      btn.classList.toggle('text-slate-900', active);
      btn.classList.toggle('shadow-sm', active);
      btn.classList.toggle('text-slate-500', !active);
    }
  };

  for (const btn of rangeBtns) {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.range as ChartRange | undefined;
      if (!next || next === range) return;
      range = next;
      await loadRange();
      if (!pricePoints.length) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      render();
    });
  }

  priceBtn?.addEventListener('click', () => { mode = 'price'; render(); });
  trBtn?.addEventListener('click', () => { mode = 'total-return'; render(); });

  render();
}
