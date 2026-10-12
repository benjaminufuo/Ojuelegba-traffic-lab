import { DIRECTIONS, Simulation, scenario, run, level } from './engine.js';
const $ = (id) => document.getElementById(id);
let rates = [18, 7, 14, 5],
  mode = 'responsive',
  sim,
  playing = false,
  acc = 0,
  last = 0,
  results = null,
  moving = [],
  redElapsed = [0, 0, 0, 0];
const nodes = [
  ['▤', 'Vehicles', 'Arrival generator'],
  ['◉', 'IoT sensors', 'Queue detection'],
  ['▣', 'ESP32', 'Virtual collector'],
  ['⌁', 'Wi-Fi', 'Logical transport'],
  ['☁', 'Cloud server', 'Browser processor'],
  ['▥', 'Traffic analysis', 'Queue classification'],
  ['◇', 'Decision algorithm', '15 / 25 / 40 s'],
  ['⊞', 'Controller', 'Safe phase sequence'],
  ['●', 'Traffic lights', 'Vehicle release'],
];
$('pipeline').innerHTML = nodes
  .map(
    (n) =>
      `<div class="node"><span>${n[0]}</span><strong>${n[1]}</strong><small>${n[2]}</small></div>`
  )
  .join('');
$('sliders').innerHTML = DIRECTIONS.map(
  (d, i) =>
    `<label class="slider-label" for="d${i}"><span><i>${d[0]}</i>${d}</span><output id="v${i}">${rates[i]}</output></label><input id="d${i}" type="range" min="0" max="30" value="${rates[i]}" aria-label="${d} arrival demand in vehicles per minute">`
).join('');
function arrivals() {
  return scenario(rates, +$('duration').value, Number($('seed').value) >>> 0);
}
function reset(clearResults = false) {
  playing = false;
  acc = 0;
  moving = [];
  redElapsed = [0, 0, 0, 0];
  sim = new Simulation(mode, arrivals());
  if (clearResults) {
    results = null;
    $('results').innerHTML =
      '<div class="empty"><h3>Scenario updated</h3><p>Compare again to record results for these inputs.</p></div>';
    $('resultscenario').textContent =
      'Run both controllers with the current scenario and seed.';
  }
  render();
}
function setMode(m) {
  mode = m;
  $('fixed').classList.toggle('selected', m === 'fixed');
  $('responsive').classList.toggle('selected', m === 'responsive');
  $('fixed').setAttribute('aria-pressed', m === 'fixed');
  $('responsive').setAttribute('aria-pressed', m === 'responsive');
  $('modehint').textContent =
    m === 'fixed'
      ? 'Every approach receives a fixed 25-second green.'
      : 'Green time adapts to detected queue length.';
  reset();
}
DIRECTIONS.forEach(
  (_, i) =>
    ($('d' + i).oninput = (e) => {
      rates[i] = +e.target.value;
      $('v' + i).value = rates[i];
      reset(true);
    })
);
$('duration').onchange = () => reset(true);
$('seed').onchange = () => {
  const n = Number($('seed').value);
  $('seed').value = Number.isFinite(n)
    ? Math.min(4294967295, Math.max(0, Math.floor(n)))
    : 42;
  reset(true);
};
$('fixed').onclick = () => setMode('fixed');
$('responsive').onclick = () => setMode('responsive');
$('reset').onclick = () => reset();
$('start').onclick = () => {
  if (sim.time === sim.arrivals.length) reset();
  playing = true;
  render();
};
$('pause').onclick = () => {
  playing = false;
  render();
};
$('run').onclick = () => {
  playing = false;
  while (sim.step());
  moving = [];
  render();
};
function tick() {
  if (!sim.step()) {
    playing = false;
    return;
  }
  redElapsed = redElapsed.map((n, i) =>
    sim.phase === i && sim.state === 'green' ? 0 : n + 1
  );
  sim.departures.forEach((i) =>
    moving.push({
      i,
      start: performance.now(),
    })
  );
  if (sim.time === sim.arrivals.length) playing = false;
  render();
}
function time(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(
    n % 60
  ).padStart(2, '0')}`;
}
function render() {
  const m = sim.metrics();
  $('status').textContent =
    sim.time === sim.arrivals.length
      ? 'COMPLETE'
      : playing
      ? 'RUNNING'
      : sim.time
      ? 'PAUSED'
      : 'READY';
  $('start').textContent =
    sim.time === sim.arrivals.length
      ? '▶ Start again'
      : sim.time
      ? '▶ Resume'
      : '▶ Start simulation';
  $('clock').textContent = `${time(sim.time)} / ${time(sim.arrivals.length)}`;
  $('phase').textContent =
    sim.state === 'clearance'
      ? 'All-red clearance'
      : `${DIRECTIONS[sim.phase]} · ${sim.state}`;
  $('remaining').textContent = sim.remaining + ' s';
  $('modebadge').textContent =
    mode === 'fixed' ? 'Fixed-time control' : 'IoT-responsive control';
  $('metrics').innerHTML = [
    ['Average waiting time', m.avgWait.toFixed(1), 'seconds / arrival'],
    ['Current queue', m.queued, 'vehicles'],
    ['Vehicles processed', m.processed, `${m.flow.toFixed(1)} vehicles / min`],
  ]
    .map(
      (a) =>
        `<div class="metric"><span>${a[0]}</span><strong>${a[1]} <small>${a[2]}</small></strong></div>`
    )
    .join('');
  $('approaches').innerHTML = DIRECTIONS.map((d, i) => {
    const q = sim.queues[i].length,
      l = level(q),
      signal = sim.phase === i ? sim.state : 'red';
    return `<div class="reading"><div class="reading-top"><strong>${d}</strong><span class="level ${l}">${l}</span></div><p>${
      sim.counts[i]
    } detected · ${q} queued · ${sim.processed[i]} passed</p><p>${
      signal === 'green'
        ? `Green · ${sim.remaining} s left`
        : signal === 'amber'
        ? `Amber · ${sim.remaining} s left`
        : `Red · ${(sim.redElapsed || redElapsed)[i]} s elapsed`
    }</p></div>`;
  }).join('');
  $('packet').textContent = sim.packet + ' simulated packets';
  const log = sim.log.at(-1);
  $('decision').textContent = log
    ? `${time(log.time)} · ${log.approach}: ${
        log.count
      } vehicles (${log.level.toLowerCase()}) → ${log.reason}.`
    : sim.time
    ? `Read [${sim.lastCounts.join(', ')}] vehicles · ${
        mode === 'fixed'
          ? 'fixed 25 s allocation'
          : 'initial 15 s green; next phase uses queue classification'
      }.`
    : 'Waiting for the first vehicle-count reading.';
}
function compare() {
  const a = arrivals(),
    f = run('fixed', a),
    r = run('responsive', a);
  results = {
    fixed: f.metrics(),
    responsive: r.metrics(),
    rates: [...rates],
    seed: +$('seed').value,
    duration: a.length,
  };
  const rows = [
    ['Vehicles arrived', 'arrived', ''],
    ['Average waiting time', 'avgWait', ' s'],
    ['Average queue length', 'avgQueue', ' veh'],
    ['Maximum queue length', 'maxQueue', ' veh'],
    ['Final queue length', 'queued', ' veh'],
    ['Vehicles processed', 'processed', ''],
    ['Traffic flow', 'flow', ' veh/min'],
    ['Average allocated green', 'avgGreen', ' s'],
    ['Average completed cycle', 'avgCycle', ' s'],
  ];
  $('resultscenario').textContent = `${a.length / 60} min · Seed ${
    results.seed
  } · N / E / S / W demand: ${rates.join(' / ')} veh/min`;
  let improvement = results.fixed.avgWait
    ? (100 * (results.fixed.avgWait - results.responsive.avgWait)) /
      results.fixed.avgWait
    : 0;
  $(
    'results'
  ).innerHTML = `<div class="tablewrap"><table><thead><tr><th>Performance metric</th><th>Fixed-time</th><th>IoT-responsive</th></tr></thead><tbody>${rows
    .map(
      ([label, key, unit]) =>
        `<tr><td>${label}</td><td>${results.fixed[key].toFixed(
          unit ? 1 : 0
        )}${unit}</td><td>${results.responsive[key].toFixed(
          unit ? 1 : 0
        )}${unit}</td></tr>`
    )
    .join('')}</tbody></table></div><div class="finding">${Math.abs(
    improvement
  ).toFixed(1)}% ${
    improvement >= 0 ? 'lower' : 'higher'
  } average waiting time with responsive control in this scenario. ${
    results.responsive.processed - results.fixed.processed >= 0 ? '+' : ''
  }${
    results.responsive.processed - results.fixed.processed
  } vehicles processed versus fixed-time.</div><div class="result-actions"><button id="export">Download results CSV</button></div>`;
  $('export').onclick = () => {
    const csv = [
      'Metric,Fixed-time,IoT-responsive',
      ...rows.map(
        ([l, k, u]) => `${l},${results.fixed[k]},${results.responsive[k]}`
      ),
      `Seed,${results.seed},${results.seed}`,
      `Duration seconds,${a.length},${a.length}`,
      ...DIRECTIONS.map(
        (d, i) => `${d} demand veh per min,${rates[i]},${rates[i]}`
      ),
    ].join('\n');
    const url = URL.createObjectURL(
        new Blob([csv], {
          type: 'text/csv',
        })
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = 'ojuelegba-comparison.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return results;
}
$('compare').onclick = compare;
const canvas = $('canvas'),
  ctx = canvas.getContext('2d');
function car(x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#0002';
  ctx.fillRect(-8, -15, 18, 32);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-8, -16, 16, 32, 4);
  ctx.fill();
  ctx.fillStyle = '#d3e8e4';
  ctx.fillRect(-6, -9, 12, 6);
  ctx.fillStyle = '#263e3f';
  ctx.fillRect(-6, 6, 12, 5);
  ctx.fillStyle = '#fce6b1';
  ctx.fillRect(-6, -15, 3, 2);
  ctx.fillRect(3, -15, 3, 2);
  ctx.restore();
}
function draw(now) {
  ctx.clearRect(0, 0, 760, 540);
  ctx.fillStyle = '#e5ece3';
  ctx.fillRect(0, 0, 760, 540);
  ctx.fillStyle = '#d5e0d1';
  [
    [30, 30, 220, 130],
    [515, 30, 215, 130],
    [30, 375, 220, 125],
    [515, 375, 215, 125],
  ].forEach((a) => {
    ctx.beginPath();
    ctx.roundRect(...a, 14);
    ctx.fill();
  });
  ctx.fillStyle = '#bbcabc';
  [
    [45, 48, 80, 55],
    [155, 48, 75, 88],
    [535, 48, 95, 88],
    [652, 48, 58, 72],
    [48, 405, 110, 65],
    [180, 400, 45, 83],
    [535, 400, 70, 75],
    [630, 400, 75, 50],
  ].forEach((a) => ctx.fillRect(...a));
  ctx.fillStyle = '#586866';
  ctx.fillRect(284, 0, 192, 540);
  ctx.fillRect(0, 180, 760, 180);
  ctx.fillStyle = '#647471';
  ctx.fillRect(284, 180, 192, 180);
  ctx.strokeStyle = '#dfce8f';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  [
    [380, 0, 380, 180],
    [380, 360, 380, 540],
    [0, 270, 284, 270],
    [476, 270, 760, 270],
  ].forEach((a) => {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[2], a[3]);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.strokeStyle = '#e7ede1';
  ctx.lineWidth = 4;
  [
    [288, 161, 375, 161],
    [385, 379, 472, 379],
    [265, 275, 265, 355],
    [495, 185, 495, 265],
  ].forEach((a) => {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[2], a[3]);
    ctx.stroke();
  });
  ctx.fillStyle = '#dde3d9';
  for (let j = 0; j < 6; j++) {
    ctx.fillRect(291 + j * 30, 169, 18, 7);
    ctx.fillRect(291 + j * 30, 365, 18, 7);
    ctx.fillRect(274, 185 + j * 29, 7, 17);
    ctx.fillRect(479, 185 + j * 29, 7, 17);
  }
  const positions = [
      [332, 140, Math.PI],
      [516, 223, -Math.PI / 2],
      [427, 400, 0],
      [245, 316, Math.PI / 2],
    ],
    colors = ['#e2c575', '#89adba', '#bacac0', '#d99c7f'];
  sim.queues.forEach((q, i) =>
    q.slice(0, 11).forEach((v, j) => {
      let [x, y, a] = positions[i];
      if (i === 0) y -= j * 38;
      if (i === 1) x += j * 38;
      if (i === 2) y += j * 38;
      if (i === 3) x -= j * 38;
      car(x, y, a, colors[(j + i) % 4]);
    })
  );
  moving = moving.filter((v) => now - v.start < 1700);
  moving.forEach((v) => {
    const p = (now - v.start) / 1700;
    let [x, y, a] = positions[v.i];
    const distance = p * 450;
    if (v.i === 0) y += distance;
    if (v.i === 1) x -= distance;
    if (v.i === 2) y -= distance;
    if (v.i === 3) x += distance;
    car(x, y, a, colors[v.i]);
  });
  [
    [265, 130],
    [500, 155],
    [492, 390],
    [250, 365],
  ].forEach(([x, y], i) => {
    ctx.fillStyle = '#253633';
    ctx.beginPath();
    ctx.roundRect(x, y, 19, 49, 5);
    ctx.fill();
    ['red', 'amber', 'green'].forEach((s, j) => {
      ctx.fillStyle =
        (sim.phase === i && sim.state === s) ||
        (s === 'red' && (sim.phase !== i || sim.state === 'clearance'))
          ? ['#f18474', '#f2c564', '#7dde9f'][j]
          : '#455751';
      ctx.beginPath();
      ctx.arc(x + 9.5, y + 9 + j * 15, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}
function frame(now) {
  const dt = last ? Math.min(now - last, 200) : 0;
  last = now;
  if (playing) {
    acc += dt * +$('speed').value;
    while (acc >= 1000 && playing) {
      acc -= 1000;
      tick();
    }
  }
  draw(now);
  requestAnimationFrame(frame);
}
setMode('responsive');
requestAnimationFrame(frame);
if (document.modelContext?.registerTool) {
  for (const tool of [
    {
      name: 'read_simulation',
      description: 'Read the current traffic simulation metrics.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
      },
      execute: () => sim.metrics(),
    },
    {
      name: 'compare_traffic_controls',
      description:
        'Run both controllers on the configured identical traffic scenario and display the comparison.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
      },
      execute: (input) => {
        if (input && Object.keys(input).length)
          throw Error('No parameters accepted');
        return compare();
      },
    },
  ]) {
    try {
      Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {});
    } catch {}
  }
}
