// Live details in the cluster section. Everything here is measured from this
// visit or read from the pod that served it; each piece is optional, and any
// failure leaves the static page as it was.

// Cloudflare reports its edge as an airport-style code. The common ones get a
// city name; any other code is shown as it is.
const COLOS: Record<string, string> = {
  ZRH: 'Zurich', GVA: 'Geneva', BSL: 'Basel', FRA: 'Frankfurt', MUC: 'Munich', DUS: 'Dusseldorf',
  HAM: 'Hamburg', TXL: 'Berlin', BER: 'Berlin', STR: 'Stuttgart', VIE: 'Vienna', MIL: 'Milan',
  LIN: 'Milan', FCO: 'Rome', CDG: 'Paris', MRS: 'Marseille', LYS: 'Lyon', AMS: 'Amsterdam',
  BRU: 'Brussels', LHR: 'London', LON: 'London', MAN: 'Manchester', DUB: 'Dublin', MAD: 'Madrid',
  BCN: 'Barcelona', LIS: 'Lisbon', CPH: 'Copenhagen', ARN: 'Stockholm', OSL: 'Oslo', HEL: 'Helsinki',
  WAW: 'Warsaw', PRG: 'Prague', BUD: 'Budapest', ATH: 'Athens', IST: 'Istanbul', SOF: 'Sofia',
  OTP: 'Bucharest', KBP: 'Kyiv', JFK: 'New York', EWR: 'Newark', IAD: 'Washington', ORD: 'Chicago',
  ATL: 'Atlanta', MIA: 'Miami', DFW: 'Dallas', DEN: 'Denver', SEA: 'Seattle', SFO: 'San Francisco',
  LAX: 'Los Angeles', SJC: 'San Jose', YYZ: 'Toronto', YUL: 'Montreal', YVR: 'Vancouver', GRU: 'Sao Paulo',
  EZE: 'Buenos Aires', SIN: 'Singapore', HKG: 'Hong Kong', NRT: 'Tokyo', KIX: 'Osaka', ICN: 'Seoul',
  TPE: 'Taipei', BOM: 'Mumbai', DEL: 'Delhi', MAA: 'Chennai', DXB: 'Dubai', TLV: 'Tel Aviv',
  JNB: 'Johannesburg', CPT: 'Cape Town', SYD: 'Sydney', MEL: 'Melbourne', AKL: 'Auckland',
};

const SAMPLES = 24;
const INTERVAL = 3000;

const cellOf = (root: ParentNode, key: string) => root.querySelector<HTMLElement>(`[data-live="${key}"]`);
const reveal = (el: HTMLElement | null) => el?.closest<HTMLElement>('[data-live-cell]')?.removeAttribute('hidden');

export function initClusterLive(): void {
  const section = document.getElementById('cluster');
  if (!section) return;

  traceFirstByte();
  const colo = traceEdge();
  builtAge();
  lightPath();
  const panel = section.querySelector<HTMLElement>('[data-live-panel]');
  if (panel) pollPod(panel, section, colo);
}

// "This visit: first byte after 42 ms."
function traceFirstByte(): void {
  const meta = document.querySelector<HTMLElement>('[data-trace-meta]');
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const firstByte = nav && nav.responseStart > 0 ? Math.round(nav.responseStart) : undefined;
  if (meta && firstByte) {
    meta.textContent = `This visit: first byte after ${firstByte} ms.`;
    meta.hidden = false;
  }
}

// Cloudflare answers /cdn-cgi/trace on every proxied site with the edge
// location ("colo=ZRH"). Resolves to the code, or undefined without one.
function traceEdge(): Promise<string | undefined> {
  const edge = document.querySelector<HTMLElement>('[data-hop="Cloudflare"]');
  return fetch('/cdn-cgi/trace')
    .then((r) => (r.ok ? r.text() : ''))
    .then((body) => {
      const colo = /^colo=([A-Z]{3})$/m.exec(body)?.[1];
      if (edge && colo) edge.textContent = `Cloudflare ${colo}`;
      return colo;
    })
    .catch(() => undefined);
}

// "built 3 hours ago": the build time is baked in; the age is worked out
// here, so the line stays true without a rebuild.
function builtAge(): void {
  const built = document.querySelector<HTMLTimeElement>('[data-built-ago]');
  if (!built) return;
  const minutes = (Date.now() - Date.parse(built.dateTime)) / 60000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    minutes < 60 ? [Math.round(minutes), 'minute'] : minutes < 1440 ? [Math.round(minutes / 60), 'hour'] : [Math.round(minutes / 1440), 'day'];
  if (minutes >= 0) built.textContent = rtf.format(-Math.max(value, 1), unit);
}

// The live path lights up hop by hop the first time it scrolls into view.
function lightPath(): void {
  const live = document.querySelector('.chain.live');
  if (!live) return;
  live.classList.add('dim');
  new IntersectionObserver(
    (entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        live.classList.replace('dim', 'lit');
        obs.disconnect();
      }
    },
    { threshold: 0.6 },
  ).observe(live);
}

// While the section is on screen and the tab is in front, ask the pod who it
// is every few seconds and time the answer.
function pollPod(panel: HTMLElement, section: HTMLElement, coloPromise: Promise<string | undefined>): void {
  const rtts: number[] = [];
  let inView = false;
  let timer = 0;
  let shown = false;
  let failures = 0;
  let busy = false;

  coloPromise.then((code) => {
    const el = cellOf(panel, 'edge');
    if (!code || !el) return;
    const city = COLOS[code];
    el.textContent = city ? `${city} (${code})` : code;
    reveal(el);
  });

  const sample = async () => {
    if (busy) return;
    busy = true;
    try {
      const t0 = performance.now();
      const res = await fetch('/live.json', { cache: 'no-store' });
      const rtt = performance.now() - t0;
      const data = res.ok ? ((await res.json()) as { pod?: unknown }) : undefined;
      if (!data || typeof data.pod !== 'string' || !/^[a-z0-9.-]{1,80}$/.test(data.pod)) throw new Error('no pod');
      rtts.push(rtt);
      if (rtts.length > SAMPLES) rtts.shift();
      const pod = cellOf(panel, 'pod');
      if (pod) pod.textContent = data.pod;
      draw(panel, rtts);
      // Optional: the pod's own nginx counters.
      await counters(panel).catch(() => {});
      failures = 0;
      panel.classList.remove('stale');
      if (!shown) {
        shown = true;
        panel.hidden = false;
      }
      panel.classList.remove('beat');
      void panel.offsetWidth;
      panel.classList.add('beat');
    } catch {
      failures += 1;
      if (shown) panel.classList.add('stale');
      // Never answered, or lost for good: stop asking.
      if (!shown || failures >= 3) stop(true);
    } finally {
      busy = false;
    }
  };

  const stop = (forever = false) => {
    clearInterval(timer);
    timer = 0;
    if (forever) {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    }
  };
  const update = () => {
    const run = inView && document.visibilityState === 'visible';
    if (run && !timer) {
      void sample();
      timer = window.setInterval(sample, INTERVAL);
    } else if (!run && timer) {
      stop();
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      update();
    },
    { rootMargin: '80px 0px' },
  );
  observer.observe(section);
  document.addEventListener('visibilitychange', update);
}

// stub_status prints, for example:
//   Active connections: 2
//   server accepts handled requests
//    120 120 340
//   Reading: 0 Writing: 1 Waiting: 1
async function counters(panel: HTMLElement): Promise<void> {
  const res = await fetch('/live/nginx', { cache: 'no-store' });
  if (!res.ok) return;
  const body = await res.text();
  const active = /Active connections:\s*(\d+)/.exec(body)?.[1];
  const total = /^\s*\d+\s+\d+\s+(\d+)\s*$/m.exec(body)?.[1];
  const served = cellOf(panel, 'served');
  const conns = cellOf(panel, 'conns');
  if (total && served) {
    served.textContent = new Intl.NumberFormat('en').format(Number(total));
    reveal(served);
  }
  if (active && conns) {
    conns.textContent = active;
    reveal(conns);
  }
}

function draw(panel: HTMLElement, rtts: number[]): void {
  const sorted = [...rtts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const last = rtts[rtts.length - 1] ?? 0;
  const label = cellOf(panel, 'rtt');
  if (label) label.textContent = `${Math.round(last)} ms`;
  const sub = cellOf(panel, 'rtt-median');
  if (sub) sub.textContent = rtts.length > 2 ? `median ${Math.round(median)} ms over ${rtts.length} checks` : 'first checks';
  const svg = panel.querySelector<SVGSVGElement>('[data-live-spark]');
  const line = svg?.querySelector<SVGPolylineElement>('polyline');
  const dot = svg?.querySelector<SVGCircleElement>('circle');
  if (!svg || !line) return;
  // Draw in the SVG's real pixel size, so the line keeps its proportions and
  // the dot stays round at any width.
  const box = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const base = svg.querySelector('line');
  base?.setAttribute('x2', String(w));
  base?.setAttribute('y1', String(h - 1));
  base?.setAttribute('y2', String(h - 1));
  const lo = Math.min(...rtts);
  const hi = Math.max(...rtts);
  // A little headroom around the range, never narrower than 20 ms, so small
  // jitter does not look like a storm.
  const span = Math.max(20, hi - lo) * 1.3;
  const floor = Math.max(0, (lo + hi) / 2 - span / 2);
  const step = (w - 8) / (SAMPLES - 1);
  // Oldest sample at the left; the line grows to the right and, once the
  // window is full, scrolls.
  const pts = rtts.map((v, i) => {
    const x = 4 + i * step;
    return [x, h - 5 - ((v - floor) / span) * (h - 10)] as const;
  });
  line.setAttribute('points', pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
  const end = pts[pts.length - 1];
  if (dot && end) {
    dot.setAttribute('cx', String(end[0]));
    dot.setAttribute('cy', end[1].toFixed(1));
  }
}
