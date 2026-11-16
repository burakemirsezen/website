// All page content lives here. Every statement comes from the CV; keep it that
// way when editing.

export const person = {
  name: 'Burak Emir Sezen',
  location: 'Zurich, Switzerland',
  summary:
    'Software engineer and computer science student at ETH Zurich. I build and run web platforms used by thousands of students and more than 100 companies, and deployment tooling for language models on GPU\u00a0clusters.',
  // TODO: placeholder. Replace with the dedicated mailbox once it exists.
  email: 'hello@bsezen.com',
  github: 'https://github.com/burakemirsezen',
  linkedin: 'https://www.linkedin.com/in/burak-emir-sezen',
  // Shown under the photo in the hero.
  portraitCaption: 'On the Polyterrasse at ETH Zurich.',
  // Public URL of this site's repository, without a trailing slash. Empty
  // until the repository is public; once set, the footer's commit hash links
  // to that commit.
  source: '',
};

// When the "Right now" list was last checked. Change it whenever the list
// changes. `iso` is year and month, for the <time> element.
export const nowUpdated = { label: 'Nov 2026', iso: '2026-11' };

// Shown beside the name.
export const now = [
  { what: 'Software engineer', where: 'VIS, the CS student association at ETH', since: 'since 2025' },
  { what: 'Teaching assistant, systems programming', where: 'ETH Zurich', since: 'since 2025' },
  { what: 'MSc in Computer Science', where: 'ETH Zurich', since: 'since 2026' },
];

// The two platforms from VIS, shown large.
export const featured = {
  communitySolutions: {
    name: 'Community Solutions',
    url: 'https://exams.vis.ethz.ch',
    urlLabel: 'exams.vis.ethz.ch',
    // Public GitHub mirror of the VIS GitLab repository.
    source: 'https://github.com/VIS-ETH/community-solutions',
    lead: 'The exam platform of ETH computer science students: past exams, community answers, comments, and\u00a0summaries.',
    points: [
      'I develop and maintain it as part of the VIS engineering\u00a0team.',
      'Serves thousands of students across several universities.',
      'Added backend tests and moved shared code into libraries used by other VIS\u00a0services.',
    ],
    imageAlt:
      'Community Solutions home page, signed in: a grid of courses such as Advanced Algorithms and Advanced Machine Learning with their exam and document counts.',
    courseImageAlt:
      'Community Solutions course page for Algorithmen und Datenstrukturen: past exams by semester, each with its lecturers, a count, and a solution tag.',
  },
  visit: {
    name: 'Visit',
    url: 'https://visit.vis.ethz.ch',
    urlLabel: 'visit.vis.ethz.ch',
    // Public GitHub mirror of the VIS GitLab repository.
    source: 'https://github.com/VIS-ETH/visit3',
    imageAlt:
      'Visit bookings overview for VIS staff, with test data: a total in Swiss francs, and a table of booth zones with bookings, free booths, prices and services.',
    lead: 'The company portal for the Kontaktparty, the VIS job fair: companies register, book their booths, and add services. In production, used by more than 100\u00a0companies.',
    points: [
      'I designed and built it, from frontend to\u00a0database.',
      'Runs on the VIS infrastructure that I also help\u00a0administer.',
    ],
  },
};

// Facts about the home cluster, all taken from its GitOps repository.
export const cluster = {
  lead: 'This page is served from a two-node Kubernetes cluster in my flat. Everything on it is declared in one git repository, and a merge to main is a\u00a0deploy.',
  // `home: true` marks the steps that run on the cluster itself.
  request: [
    { step: 'You' },
    { step: 'Cloudflare' },
    { step: 'Tunnel', home: true },
    { step: 'Traefik', home: true },
    { step: 'This page', home: true },
  ] as { step: string; home?: boolean }[],
  deploy: [
    { step: 'git push' },
    { step: 'CI render and diff' },
    { step: 'Argo CD', home: true },
    { step: 'K3s, two nodes', home: true },
  ] as { step: string; home?: boolean }[],
  facts: [
    { term: 'Compute', text: 'Two K3s nodes as virtual machines on\u00a0Proxmox.' },
    { term: 'Deploys', text: 'Argo CD syncs the main branch. Manifests are Jsonnet, rendered with\u00a0Tanka.' },
    { term: 'Workloads', text: 'More than 20 applications, among them Immich for photos, Calibre-Web Automated for books, SearXNG, Gatus, a Minecraft server, and this\u00a0website.' },
    { term: 'Storage', text: 'Longhorn keeps two replicas of every volume, one per\u00a0node.' },
    { term: 'Access', text: 'Public traffic enters through a Cloudflare tunnel. Admin interfaces sit behind single\u00a0sign-on.' },
    { term: 'Secrets', text: 'Sealed Secrets only. CI fails if a plaintext secret is\u00a0rendered.' },
    { term: 'Updates', text: 'Renovate opens the pull requests, and CI posts the rendered diff on each\u00a0one.' },
    { term: 'Backups', text: 'Nightly volume, file, and virtual machine backups to a mirrored disk\u00a0pair.' },
  ],
};

// Shown last, below everything work-related. Add entries here over time.
//
// Everything marked `placeholder: true` is filler and is drawn as a dashed
// slot on the page. To fill a photo: put the file in src/assets, import it in
// src/pages/index.astro, and add it to the `photos` map there under the
// photo's `id`. To fill text: replace it and delete the `placeholder` flag.
export interface RecordTrack {
  title: string;
  url: string;
  /** Track length in seconds, used to pace the tonearm across the side. */
  duration: number;
  /** Which side of the LP this track is on ('A' or 'B'). */
  side?: 'A' | 'B';
}

export const music: {
  lead: string;
  // `roomOnly`: shown in the desktop room (and to screen readers) but not in
  // the phone layout, which only lists gear that has a photo.
  photos: { id: string; title: string; text: string; placeholder?: boolean; roomOnly?: boolean }[];
  gearTitle: string;
  recordsTitle: string;
  records: {
    id: string;
    title: string;
    artist: string;
    tracks?: RecordTrack[];
    audio?: string;
    url: string;
    placeholder?: boolean;
  }[];
} = {
  lead: 'Outside work I play the guitar and listen to records. The gear in this room is all\u00a0mine.',
  photos: [
    {
      id: 'guitar',
      title: 'The guitar',
      text: 'Yamaha Pacifica 112V in yellow natural satin.',
    },
    {
      id: 'amp',
      title: 'The amp',
      text: 'Boss Katana Mini.',
    },
    {
      id: 'interface',
      title: 'The audio interface',
      text: 'Focusrite Scarlett Solo (3rd gen).',
    },
    {
      id: 'turntable',
      title: 'The turntable',
      text: 'Audio-Technica AT-LP60XBT in black.',
    },
    {
      id: 'speakers',
      title: 'The speakers',
      text: 'Edifier R1280DB in wood.',
      roomOnly: true,
    },
  ],
  gearTitle: 'My setup',
  recordsTitle: 'Favourite records',
  records: [
    {
      id: 'record-1',
      title: 'Koi No Yokan',
      artist: 'Deftones',
      url: 'https://open.spotify.com/album/4PIVdqvL1Rc7T7Vfsr8n8Q',
      tracks: [
        { title: 'Swerve City', url: '/records/koi-no-yokan/01-swerve-city.mp3', duration: 165.02, side: 'A' },
        { title: 'Romantic Dreams', url: '/records/koi-no-yokan/02-romantic-dreams.mp3', duration: 278.15, side: 'A' },
        { title: 'Leathers', url: '/records/koi-no-yokan/03-leathers.mp3', duration: 248.92, side: 'A' },
        { title: 'Poltergeist', url: '/records/koi-no-yokan/04-poltergeist.mp3', duration: 211.46, side: 'A' },
        { title: 'Entombed', url: '/records/koi-no-yokan/05-entombed.mp3', duration: 299.29, side: 'A' },
        { title: 'Graphic Nature', url: '/records/koi-no-yokan/06-graphic-nature.mp3', duration: 271.57, side: 'A' },
        { title: 'Tempest', url: '/records/koi-no-yokan/07-tempest.mp3', duration: 365.53, side: 'B' },
        { title: 'Gauze', url: '/records/koi-no-yokan/08-gauze.mp3', duration: 281.44, side: 'B' },
        { title: 'Rosemary', url: '/records/koi-no-yokan/09-rosemary.mp3', duration: 413.39, side: 'B' },
        { title: 'Goon Squad', url: '/records/koi-no-yokan/10-goon-squad.mp3', duration: 340.04, side: 'B' },
        { title: 'What Happened to You?', url: '/records/koi-no-yokan/11-what-happened-to-you.mp3', duration: 233.74, side: 'B' },
      ],
    },
    {
      id: 'record-2',
      title: 'Ten',
      artist: 'Pearl Jam',
      url: 'https://open.spotify.com/album/5B4PYA7wNN4WdEXdIJu58a',
      tracks: [
        { title: 'Once', url: '/records/ten/01-once.mp3', duration: 231.42, side: 'A' },
        { title: 'Even Flow', url: '/records/ten/02-even-flow.mp3', duration: 293.69, side: 'A' },
        { title: 'Alive', url: '/records/ten/03-alive.mp3', duration: 341.24, side: 'A' },
        { title: 'Why Go', url: '/records/ten/04-why-go.mp3', duration: 199.97, side: 'A' },
        { title: 'Black', url: '/records/ten/05-black.mp3', duration: 343.72, side: 'A' },
        { title: 'Jeremy', url: '/records/ten/06-jeremy.mp3', duration: 319.29, side: 'A' },
        { title: 'Oceans', url: '/records/ten/07-oceans.mp3', duration: 161.91, side: 'B' },
        { title: 'Porch', url: '/records/ten/08-porch.mp3', duration: 210.6, side: 'B' },
        { title: 'Garden', url: '/records/ten/09-garden.mp3', duration: 299.02, side: 'B' },
        { title: 'Deep', url: '/records/ten/10-deep.mp3', duration: 258.32, side: 'B' },
        { title: 'Release', url: '/records/ten/11-release.mp3', duration: 546.12, side: 'B' },
      ],
    },
    {
      id: 'record-3',
      title: 'Rumours',
      artist: 'Fleetwood Mac',
      url: 'https://open.spotify.com/album/1bt6q2SruMsBtcerNVtpZB',
      tracks: [
        { title: 'Second Hand News', url: '/records/rumours/01-second-hand-news.mp3', duration: 166.16, side: 'A' },
        { title: 'Dreams', url: '/records/rumours/02-dreams.mp3', duration: 260.34, side: 'A' },
        { title: 'Never Going Back Again', url: '/records/rumours/03-never-going-back-again.mp3', duration: 127.5, side: 'A' },
        { title: 'Don’t Stop', url: '/records/rumours/04-dont-stop.mp3', duration: 190.28, side: 'A' },
        { title: 'Go Your Own Way', url: '/records/rumours/05-go-your-own-way.mp3', duration: 221.7, side: 'A' },
        { title: 'Songbird', url: '/records/rumours/06-songbird.mp3', duration: 203.15, side: 'A' },
        { title: 'The Chain', url: '/records/rumours/07-the-chain.mp3', duration: 267.83, side: 'B' },
        { title: 'You Make Loving Fun', url: '/records/rumours/08-you-make-loving-fun.mp3', duration: 214.31, side: 'B' },
        { title: 'I Don’t Want to Know', url: '/records/rumours/09-i-dont-want-to-know.mp3', duration: 195.84, side: 'B' },
        { title: 'Oh Daddy', url: '/records/rumours/10-oh-daddy.mp3', duration: 236.49, side: 'B' },
        { title: 'Gold Dust Woman', url: '/records/rumours/11-gold-dust-woman.mp3', duration: 308.45, side: 'B' },
      ],
    },
    {
      id: 'record-4',
      title: 'Superunknown',
      artist: 'Soundgarden',
      url: 'https://open.spotify.com/album/4AvI4sIYIYE1fIbLLGN7tb',
      tracks: [
        { title: 'Let Me Drown', url: '/records/superunknown/01-let-me-drown.mp3', duration: 232.88, side: 'A' },
        { title: 'My Wave', url: '/records/superunknown/02-my-wave.mp3', duration: 311.69, side: 'A' },
        { title: 'Fell on Black Days', url: '/records/superunknown/03-fell-on-black-days.mp3', duration: 282.62, side: 'A' },
        { title: 'Mailman', url: '/records/superunknown/04-mailman.mp3', duration: 265.46, side: 'A' },
        { title: 'Superunknown', url: '/records/superunknown/05-superunknown.mp3', duration: 306.29, side: 'A' },
        { title: 'Head Down', url: '/records/superunknown/06-head-down.mp3', duration: 368.9, side: 'A' },
        { title: 'Black Hole Sun', url: '/records/superunknown/07-black-hole-sun.mp3', duration: 317.96, side: 'A' },
        { title: 'Spoonman', url: '/records/superunknown/08-spoonman.mp3', duration: 246.33, side: 'A' },
        { title: 'Limo Wreck', url: '/records/superunknown/09-limo-wreck.mp3', duration: 347.22, side: 'B' },
        { title: 'The Day I Tried to Live', url: '/records/superunknown/10-the-day-i-tried-to-live.mp3', duration: 319.48, side: 'B' },
        { title: 'Kickstand', url: '/records/superunknown/11-kickstand.mp3', duration: 94.25, side: 'B' },
        { title: 'Fresh Tendrils', url: '/records/superunknown/12-fresh-tendrils.mp3', duration: 256.05, side: 'B' },
        { title: '4th of July', url: '/records/superunknown/13-4th-of-july.mp3', duration: 308.14, side: 'B' },
        { title: 'Half', url: '/records/superunknown/14-half.mp3', duration: 134.09, side: 'B' },
        { title: 'Like Suicide', url: '/records/superunknown/15-like-suicide.mp3', duration: 431.65, side: 'B' },
        { title: 'She Likes Surprises', url: '/records/superunknown/16-she-likes-surprises.mp3', duration: 196.73, side: 'B' },
      ],
    },
  ],
};

export interface Link {
  label: string;
  url: string;
}

export interface Role {
  title: string;
  org: string;
  period: string;
  note?: string;
  points: string[];
  links?: Link[];
}

export const work: Role[] = [
  {
    title: 'Software Engineer',
    org: 'VIS, the computer science student association at ETH Zurich',
    period: 'Jan 2025 – present',
    points: [
      // Visit and Community Solutions are described in `featured`, shown above.
      'Built Visit and maintain Community Solutions, the two platforms shown\u00a0above.',
      'Administer the VIS production infrastructure, maintain its web services, and resolve operational\u00a0issues.',
    ],
  },
  {
    title: 'Teaching Assistant',
    org: 'ETH Zurich',
    period: 'Sep 2025 – present',
    points: [
      'Systems Programming and Computer Architecture (SPCA): teach C, x86 assembly, and how programs meet the\u00a0hardware, in a course of about 200\u00a0students.',
      'Digital Design and Computer Architecture (DDCA): guide students through FPGA labs that build up from simple adders to a 32-bit\u00a0processor.',
    ],
  },
  {
    title: 'Software Engineer',
    org: 'Swiss AI',
    period: '2026',
    note: 'Bachelor’s thesis collaboration',
    points: [
      'Developed deployment and load-testing tools for large language models, so performance on GPU\u00a0clusters can be evaluated automatically.',
      'Integrated GPU monitoring and automated tests into the shared deployment platform.',
    ],
    links: [{ label: 'swiss-ai/model-launch', url: 'https://github.com/swiss-ai/model-launch' }],
  },
];

export interface Project {
  name: string;
  context: string;
  points: string[];
  links?: Link[];
}

export const projects: Project[] = [
  {
    name: 'Language model performance',
    context: 'Bachelor’s thesis, ETH Zurich',
    points: [
      'Designed controlled experiments on how expert architecture affects language-model latency and throughput on multi-node GPU\u00a0systems.',
      'Showed that active compute alone does not predict latency trends across the tested model\u00a0families.',
    ],
    links: [
      { label: 'Code and results', url: 'https://github.com/burakemirsezen/moe-inference-thesis-artifacts' },
    ],
  },
  {
    name: 'Open-source contributions',
    context: 'Merged upstream pull requests',
    // Summarises my merged pull requests; the links below are the examples.
    points: ['Bug fixes and a new configuration option in self-hosted software, for\u00a0example:'],
    links: [
      { label: 'Calibre-Web Automated', url: 'https://github.com/crocodilestick/Calibre-Web-Automated' },
      { label: 'Seerr', url: 'https://github.com/seerr-team/seerr' },
      { label: 'SearXNG', url: 'https://github.com/searxng/searxng' },
    ],
  },
];

export const education = [
  { degree: 'MSc in Computer Science', school: 'ETH Zurich', period: 'Sep 2026 – Jun 2028 (expected)' },
  { degree: 'BSc in Computer Science', school: 'ETH Zurich', period: 'Sep 2023 – Sep 2026', note: 'GPA 5.25 / 6.00' },
];

export const skills = [
  { group: 'Languages', items: 'Python, C, C++, TypeScript, JavaScript, SQL' },
  { group: 'Applications and backend', items: 'React, Electron, FastAPI, Django, PostgreSQL, SQLite, Keycloak' },
  { group: 'Infrastructure', items: 'Linux, Kubernetes, Docker, Proxmox, Argo CD, Git, SLURM, Prometheus' },
  { group: 'ML systems', items: 'vLLM, SGLang, DCGM, Nsight Systems' },
  { group: 'Spoken languages', items: 'Turkish (native), English (fluent), German (fluent)' },
];
