export const DIRECTIONS = ['North', 'East', 'South', 'West'];
export function level(n) {
  return n >= 12 ? 'High' : n >= 6 ? 'Medium' : 'Low';
}
export function scenario(rates, duration, seed) {
  let s = seed >>> 0;
  const random = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from(
    {
      length: duration,
    },
    () =>
      rates.map((rate) => {
        const lambda = rate / 60;
        let p = 1,
          k = 0;
        do {
          k++;
          p *= random();
        } while (p > Math.exp(-lambda));
        return k - 1;
      })
  );
}
export class Simulation {
  constructor(mode, arrivals) {
    this.mode = mode;
    this.arrivals = arrivals;
    this.time = 0;
    this.queues = [[], [], [], []];
    this.counts = [0, 0, 0, 0];
    this.processed = [0, 0, 0, 0];
    this.phase = 0;
    this.state = 'green';
    this.remaining = mode === 'fixed' ? 25 : 15;
    this.green = this.remaining;
    this.wait = 0;
    this.queueArea = 0;
    this.maxQueue = 0;
    this.greenHistory = [this.green];
    this.log = [];
    this.departures = [];
    this.lastCounts = [0, 0, 0, 0];
    this.lastCycle = 0;
    this.cycleStart = 0;
    this.cycles = [];
    this.packet = 0;
  }
  step() {
    if (this.time >= this.arrivals.length) return false;
    this.departures = [];
    this.arrivals[this.time].forEach((n, i) => {
      this.counts[i] += n;
      for (let j = 0; j < n; j++)
        this.queues[i].push({
          arrived: this.time,
          wait: 0,
        });
    });
    // Software pipeline: ideal detectors -> virtual ESP32 -> lossless Wi-Fi -> in-browser cloud.
    this.lastCounts = this.queues.map((q) => q.length);
    this.packet++;
    this.levels = this.lastCounts.map(level);
    if (
      this.state === 'green' &&
      this.time % 2 === 0 &&
      this.queues[this.phase].length
    ) {
      const v = this.queues[this.phase].shift();
      this.wait += v.wait;
      this.processed[this.phase]++;
      this.departures.push(this.phase);
    }
    this.queues.forEach((q) => q.forEach((v) => v.wait++));
    const total = this.queues.reduce((n, q) => n + q.length, 0);
    this.queueArea += total;
    this.maxQueue = Math.max(this.maxQueue, total);
    this.redElapsed = (this.redElapsed || [0, 0, 0, 0]).map((n, i) =>
      this.phase === i && this.state === 'green' ? 0 : n + 1
    );
    this.remaining--;
    this.time++;
    if (this.remaining === 0) {
      if (this.state === 'green') {
        this.state = 'amber';
        this.remaining = 3;
      } else if (this.state === 'amber') {
        this.state = 'clearance';
        this.remaining = 2;
      } else {
        this.phase = (this.phase + 1) % 4;
        if (this.phase === 0) {
          this.lastCycle = this.time - this.cycleStart;
          this.cycles.push(this.lastCycle);
          this.cycleStart = this.time;
        }
        this.state = 'green';
        const n = this.queues[this.phase].length;
        this.green =
          this.mode === 'fixed' ? 25 : n >= 12 ? 40 : n >= 6 ? 25 : 15;
        this.remaining = this.green;
        this.greenHistory.push(this.green);
        this.log.push({
          time: this.time,
          approach: DIRECTIONS[this.phase],
          count: n,
          level: level(n),
          green: this.green,
          reason:
            this.mode === 'fixed'
              ? 'Fixed allocation'
              : n >= 12
              ? 'High queue: extend to 40 s'
              : n >= 6
              ? 'Medium queue: defined 25 s'
              : 'Low queue: defined 15 s',
        });
      }
    }
    return true;
  }
  metrics() {
    const processed = this.processed.reduce((a, b) => a + b, 0),
      arrived = this.counts.reduce((a, b) => a + b, 0),
      queued = this.queues.reduce((a, q) => a + q.length, 0),
      pendingWait = this.queues.reduce(
        (a, q) => a + q.reduce((b, v) => b + v.wait, 0),
        0
      );
    return {
      mode: this.mode,
      time: this.time,
      arrived,
      processed,
      queued,
      avgWait: arrived ? (this.wait + pendingWait) / arrived : 0,
      departedWait: processed ? this.wait / processed : 0,
      avgQueue: this.time ? this.queueArea / this.time : 0,
      maxQueue: this.maxQueue,
      flow: this.time ? (processed * 60) / this.time : 0,
      avgGreen:
        this.greenHistory.reduce((a, b) => a + b, 0) / this.greenHistory.length,
      avgCycle: this.cycles.length
        ? this.cycles.reduce((a, b) => a + b, 0) / this.cycles.length
        : 0,
    };
  }
}
export function run(mode, arrivals) {
  const s = new Simulation(mode, arrivals);
  while (s.step());
  return s;
}
