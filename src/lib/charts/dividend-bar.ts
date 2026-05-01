import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

let registered = false;

function ensureRegistry() {
  if (registered) return;
  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
  registered = true;
}

interface Payload {
  labels: string[];
  amounts: number[];
  canvasId: string;
}

export function mountDividendChartsFromDom(): void {
  ensureRegistry();
  for (const el of document.querySelectorAll('[data-ytf-dividend-chart]')) {
    const raw = el.getAttribute('data-ytf-dividend-chart');
    if (!raw) continue;
    let payload: Payload;
    try {
      payload = JSON.parse(raw) as Payload;
    } catch {
      continue;
    }
    const canvas = document.getElementById(payload.canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    if (Chart.getChart(canvas)) continue;
    if (!payload.labels.length || !payload.amounts.length) continue;

    void new Chart(canvas, {
      type: 'bar',
      data: {
        labels: payload.labels,
        datasets: [
          {
            label: 'Dividend / share ($)',
            data: payload.amounts,
            backgroundColor: 'rgba(37, 99, 235, 0.72)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              maxRotation: 60,
              autoSkip: true,
              maxTicksLimit: 24,
            },
          },
          y: { beginAtZero: true },
        },
      },
    });
  }
}
