import Chart from 'chart.js/auto';

let apoyosChart: Chart | null = null;

export function renderApoyosVsPagosChart(totalApoyos: number, totalPagos: number): void {
  const canvas = document.getElementById('apoyos-vs-pagos-chart') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  if (apoyosChart) {
    apoyosChart.destroy();
  }

  apoyosChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Flujo Financiero'],
      datasets: [
        {
          label: 'Total Apoyos Otorgados',
          data: [totalApoyos],
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
        {
          label: 'Total Pagos Recibidos',
          data: [totalPagos],
          backgroundColor: 'rgba(22, 163, 74, 0.7)',
          borderColor: 'rgba(22, 163, 74, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => '$' + Number(value).toLocaleString(),
          },
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}
