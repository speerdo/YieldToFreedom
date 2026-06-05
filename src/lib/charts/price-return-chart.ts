import { mountCompareYieldChartFromPayload } from './compare-yield-line';

const PRICE_COLOR = 'rgb(37, 99, 235)';
const ACTIVE_BG_CLASS = 'bg-[var(--bg-card)]';
const ACTIVE_TEXT_CLASS = 'text-[var(--fg)]';
const IDLE_TEXT_CLASS = 'text-[var(--fg-muted)]';
const DISABLED_CURSOR_CLASS = 'cursor-not-allowed';
const ENABLED_CURSOR_CLASS = 'cursor-pointer';
const DISABLED_OPACITY_CLASS = 'opacity-50';

interface PricePoint { x: number; value: number; }
interface PriceHistBody { pricePoints?: PricePoint[]; totalReturnPoints?: PricePoint[]; }
type ChartRange = '1y' | '3y' | '5y' | '10y' | 'max';
type ChartMode = 'price' | 'total-return';

const RANGE_YEARS: Partial<Record<ChartRange, number>> = {
  '1y': 1,
  '3y': 3,
  '5y': 5,
  '10y': 10,
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const RANGE_TOLERANCE_YEARS = 14 / 365.25;

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
  const historyNoteEl = container.querySelector<HTMLElement>('[data-history-note]');

  let mode: ChartMode = 'price';
  let range: ChartRange = 'max';
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

  const availableYears = (points: PricePoint[]): number => {
    if (points.length < 2) return 0;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return Math.max(0, (last.x - first.x) / MS_PER_YEAR);
  };

  const rangeAvailable = (targetRange: ChartRange, years: number): boolean => {
    if (targetRange === 'max' || targetRange === '1y') return true;
    const requiredYears = RANGE_YEARS[targetRange];
    return requiredYears != null && years + RANGE_TOLERANCE_YEARS >= requiredYears;
  };

  const defaultRangeForHistory = (years: number): ChartRange => {
    if (years + RANGE_TOLERANCE_YEARS >= 5) return '5y';
    if (years + RANGE_TOLERANCE_YEARS >= 3) return '3y';
    if (years + RANGE_TOLERANCE_YEARS >= 1) return '1y';
    return 'max';
  };

  const formatHistoryLength = (years: number): string => {
    if (years < 1) {
      const months = Math.max(1, Math.round(years * 12));
      return `${months} month${months === 1 ? '' : 's'}`;
    }
    return `${years.toFixed(years >= 3 ? 0 : 1)} year${years >= 1.5 ? 's' : ''}`;
  };

  const updateRangeAvailability = (years: number): void => {
    for (const btn of rangeBtns) {
      const btnRange = btn.dataset.range as ChartRange | undefined;
      const enabled = btnRange ? rangeAvailable(btnRange, years) : false;
      btn.disabled = !enabled;
      btn.classList.toggle(ENABLED_CURSOR_CLASS, enabled);
      btn.classList.toggle(DISABLED_CURSOR_CLASS, !enabled);
      btn.classList.toggle(DISABLED_OPACITY_CLASS, !enabled);
      btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      if (!enabled && btnRange) {
        btn.title = `${btn.textContent?.trim() || btnRange.toUpperCase()} is unavailable because this ETF has ${formatHistoryLength(years)} of price history.`;
      } else {
        btn.removeAttribute('title');
      }
    }

    const disabledRanges = rangeBtns
      .filter((btn) => btn.disabled)
      .map((btn) => btn.textContent?.trim())
      .filter(Boolean);

    if (historyNoteEl) {
      if (disabledRanges.length > 0) {
        historyNoteEl.hidden = false;
        historyNoteEl.textContent = `This ETF has ${formatHistoryLength(years)} of price history, so unavailable longer ranges are disabled.`;
      } else {
        historyNoteEl.hidden = true;
        historyNoteEl.textContent = '';
      }
    }
  };

  await loadRange();

  if (!pricePoints.length) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  const years = availableYears(pricePoints);
  updateRangeAvailability(years);

  const initialRange = defaultRangeForHistory(years);
  if (initialRange !== range) {
    range = initialRange;
    await loadRange();
    if (!pricePoints.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
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
      displayDensity: 'comfortable',
    });
    if (descEl) {
      descEl.textContent = mode === 'total-return'
        ? 'Adjusted close total return, indexed from the selected start'
        : 'Adjusted closing price; splits and distributions are normalized';
    }
    for (const btn of [priceBtn, trBtn]) {
      if (!btn) continue;
      const active = btn.dataset.mode === mode;
      btn.classList.toggle(ACTIVE_BG_CLASS, active);
      btn.classList.toggle(ACTIVE_TEXT_CLASS, active);
      btn.classList.toggle('shadow-sm', active);
      btn.classList.toggle(IDLE_TEXT_CLASS, !active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const btn of rangeBtns) {
      const active = btn.dataset.range === range;
      btn.classList.toggle(ACTIVE_BG_CLASS, active);
      btn.classList.toggle(ACTIVE_TEXT_CLASS, active);
      btn.classList.toggle('shadow-sm', active);
      btn.classList.toggle(IDLE_TEXT_CLASS, !active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  for (const btn of rangeBtns) {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.range as ChartRange | undefined;
      if (!next || btn.disabled || next === range) return;
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
