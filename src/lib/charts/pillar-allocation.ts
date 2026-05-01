import {
  ArcElement,
  Chart,
  DoughnutController,
  Legend,
  Tooltip,
  type Chart as ChartJs,
} from 'chart.js';

let registered = false;

function ensureRegistry() {
  if (registered) return;
  Chart.register(ArcElement, DoughnutController, Tooltip, Legend);
  registered = true;
}

/** Doughnut: pillar allocation as % (values should sum to ~100). */
export function renderPillarAllocationDoughnut(
  canvas: HTMLCanvasElement,
  labels: string[],
  data: number[],
  colors: string[],
): ChartJs | undefined {
  ensureRegistry();

  Chart.getChart(canvas)?.destroy();

  const filtered = labels
    .map((label, i) => ({ label, v: Number(data[i]), color: colors[i] ?? '#94a3b8' }))
    .filter((x) => x.v > 0);

  if (!filtered.length) return undefined;

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: filtered.map((x) => x.label),
      datasets: [
        {
          data: filtered.map((x) => x.v),
          backgroundColor: filtered.map((x) => x.color),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw as number;
              return `${ctx.label}: ${v.toFixed(1)}%`;
            },
          },
        },
      },
      cutout: '54%',
    },
  });
}
