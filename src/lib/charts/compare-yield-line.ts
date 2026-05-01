import {
  Chart,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip,
  type Chart as ChartJs,
} from 'chart.js';

let registered = false;

function ensureRegistry() {
  if (registered) return;
  Chart.register(ScatterController, LineElement, PointElement, LinearScale, Tooltip, Legend);
  registered = true;
}

export interface CompareYieldDatasetPayload {
  label: string;
  borderColor: string;
  /** X = ms since epoch */
  points: Array<{ x: number; y: number }>;
}

export interface CompareYieldMountPayload {
  canvasId: string;
  datasets: CompareYieldDatasetPayload[];
}

/** Destroy any existing Chart on this canvas, then render a multi-line trailing-yield comparison. */
export function mountCompareYieldChartFromPayload(payload: CompareYieldMountPayload): ChartJs | undefined {
  ensureRegistry();

  const canvas = document.getElementById(payload.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) return undefined;

  const existing = Chart.getChart(canvas);
  existing?.destroy();

    const datasets = payload.datasets
    .filter((d) => d.points.length >= 2)
    .map((d) => ({
      type: 'scatter' as const,
      label: d.label,
      data: d.points,
      borderColor: d.borderColor,
      backgroundColor: d.borderColor,
      borderWidth: 2,
      showLine: true,
      tension: 0.2,
      pointRadius: 2,
      pointHoverRadius: 4,
    }));

  if (!datasets.length) return undefined;

  return new Chart(canvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x',
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
          },
        },
        tooltip: {
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
              const raw = typeof item.raw === 'object' && item.raw && 'y' in item.raw ? (item.raw as { y?: number }).y : item.parsed.y;
              const y = typeof raw === 'number' ? raw : Number(raw);
              if (!Number.isFinite(y)) return item.dataset.label ?? '';
              const pct = y.toFixed(2);
              return `${item.dataset.label ?? ''}: ${pct}%`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            maxTicksLimit: 8,
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
          title: { display: true, text: 'Ex-date', color: '#64748b', font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'TTM dividend yield (~%)',
            color: '#64748b',
            font: { size: 11 },
          },
          ticks: {
            callback(v) {
              return `${Number(v).toFixed(1)}%`;
            },
          },
        },
      },
    },
  });
}
