import {
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type Chart as ChartJs,
} from 'chart.js';

let registered = false;

function ensureRegistry() {
  if (registered) return;
  Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);
  registered = true;
}

export interface CompareYieldDatasetPayload {
  label: string;
  borderColor: string;
  /** X = ms since epoch */
  points: Array<{ x: number; y: number }>;
}

/** indexed: 100=start (compare page); price: raw $ close; pct: % from 0; yield: trailing yield % */
export type ChartYMode = 'indexed' | 'yield' | 'price' | 'pct';

export interface CompareYieldMountPayload {
  canvasId: string;
  datasets: CompareYieldDatasetPayload[];
  /** 'indexed' = price/TR chart (100 = start); 'yield' = trailing yield % */
  yMode?: ChartYMode;
  displayDensity?: 'default' | 'comfortable';
}

export interface MountResult {
  chart: ChartJs | undefined;
  /** Tickers dropped because they had no chart data */
  excluded: string[];
}

/** Destroy any existing Chart on this canvas, then render a multi-line comparison. */
export function mountCompareYieldChartFromPayload(payload: CompareYieldMountPayload): MountResult {
  ensureRegistry();

  const yMode = payload.yMode ?? 'indexed';
  const comfortable = payload.displayDensity === 'comfortable';
  const tickFontSize = comfortable ? 13 : 11;
  const tooltipTitleSize = comfortable ? 13 : 12;
  const tooltipBodySize = comfortable ? 14 : 12;
  const tickPadding = comfortable ? 8 : 4;

  const canvas = document.getElementById(payload.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) return { chart: undefined, excluded: [] };

  const existing = Chart.getChart(canvas);
  existing?.destroy();

  const excluded: string[] = [];
  const datasets = payload.datasets
    .filter((d) => {
      if (d.points.length < 1) { excluded.push(d.label); return false; }
      return true;
    })
    .map((d) => ({
      label: d.label,
      data: d.points,
      borderColor: d.borderColor,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: d.borderColor,
      fill: false,
    }));

  if (!datasets.length) return { chart: undefined, excluded };

  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
        axis: 'x',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          padding: comfortable ? 14 : 12,
          titleFont: { size: tooltipTitleSize, weight: 'bold' },
          bodyFont: { size: tooltipBodySize, weight: 'bold' },
          bodySpacing: comfortable ? 6 : 4,
          callbacks: {
            title(items) {
              const x = items[0]?.parsed.x;
              if (typeof x !== 'number') return '';
              try {
                return new Date(x).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
              } catch {
                return String(x);
              }
            },
            label(item) {
              const raw = typeof item.raw === 'object' && item.raw && 'y' in item.raw
                ? (item.raw as { y?: number }).y
                : item.parsed.y;
              const y = typeof raw === 'number' ? raw : Number(raw);
              if (!Number.isFinite(y)) return item.dataset.label ?? '';
              const label = item.dataset.label ?? '';
              if (yMode === 'indexed') {
                const gain = y - 100;
                const sign = gain >= 0 ? '+' : '';
                return `${label}: ${y.toFixed(1)}  (${sign}${gain.toFixed(1)}%)`;
              }
              if (yMode === 'price') return `${label}: $${y.toFixed(2)}`;
              if (yMode === 'pct') {
                const sign = y >= 0 ? '+' : '';
                return `${label}: ${sign}${y.toFixed(2)}%`;
              }
              return `${label}: ${y.toFixed(2)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          grid: { color: 'rgba(148, 163, 184, 0.15)' },
          border: { display: false },
          ticks: {
            maxTicksLimit: 8,
            color: '#94a3b8',
            font: { size: tickFontSize, weight: 'normal' },
            padding: tickPadding,
            callback(v) {
              const n = Number(v);
              if (!Number.isFinite(n)) return '';
              try {
                return new Date(n).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
              } catch {
                return '';
              }
            },
          },
        },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(148, 163, 184, 0.15)' },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: tickFontSize, weight: 'bold' },
            padding: tickPadding,
            callback(v) {
              const n = Number(v);
              if (yMode === 'indexed') return `${n.toFixed(0)}`;
              if (yMode === 'price') return `$${n.toFixed(2)}`;
              if (yMode === 'pct') return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
              return `${n.toFixed(1)}%`;
            },
          },
        },
      },
    },
  });

  return { chart, excluded };
}
