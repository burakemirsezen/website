// All page content lives here. Every statement comes from the CV; keep it that
// way when editing.

export const person = {
  name: 'Burak Emir Sezen',
  location: 'Zurich, Switzerland',
  summary:
    'Software engineer. I build software and keep it running: web platforms used by thousands of students and more than 100 companies, deployment tooling for language models on GPU clusters, and the Kubernetes cluster in my flat that serves this page.',
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
    lead: 'The exam platform of ETH computer science students: past exams, community answers, comments, and summaries.',
    points: [
      'I develop and maintain it as part of the VIS engineering team.',
      'Serves thousands of students across several universities.',
      'Added backend tests and moved shared code into libraries used by other VIS services.',
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
    imageAlt:
      'Visit bookings overview for VIS staff, with test data: a total in Swiss francs, and a table of booth zones with bookings, free booths, prices and services.',
    lead: 'The company-relations platform of VIS, in production and used by more than 100 companies.',
    points: [
      'Designed and built by me across frontend, backend, and database.',
      'Runs on the VIS infrastructure that I also help administer.',
    ],
  },
};

// Facts about the home cluster, all taken from its GitOps repository.
export const cluster = {
  lead: 'This page is served from a two-node Kubernetes cluster in my flat. Everything on it is declared in one git repository, and a merge to main is a deploy.',
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
    { term: 'Compute', text: 'Two K3s nodes as virtual machines on Proxmox.' },
    { term: 'Deploys', text: 'Argo CD syncs the main branch. Manifests are Jsonnet, rendered with Tanka.' },
    { term: 'Workloads', text: 'More than 20 applications, among them Immich for photos, Calibre-Web Automated for books, SearXNG, Gatus, a Minecraft server, and this website.' },
    { term: 'Storage', text: 'Longhorn keeps two replicas of every volume, one per node.' },
    { term: 'Access', text: 'Public traffic enters through a Cloudflare tunnel. Admin interfaces sit behind single sign-on.' },
    { term: 'Secrets', text: 'Sealed Secrets only. CI fails if a plaintext secret is rendered.' },
    { term: 'Updates', text: 'Renovate opens the pull requests, and CI posts the rendered diff on each one.' },
    { term: 'Backups', text: 'Nightly volume, file, and virtual machine backups to a mirrored disk pair.' },
  ],
};

// Shown last, below everything work-related. Add entries here over time.
//
// Everything marked `placeholder: true` is filler and is drawn as a dashed
// slot on the page. To fill a photo: put the file in src/assets, import it in
// src/pages/index.astro, and add it to the `photos` map there under the
// photo's `id`. To fill text: replace it and delete the `placeholder` flag.
export const music: {
  lead: string;
  photos: { id: string; title: string; text: string; placeholder?: boolean }[];
  gearTitle: string;
  recordsTitle: string;
  records: { id: string; title: string; artist: string; url: string; placeholder?: boolean }[];
} = {
  lead: 'I am learning the guitar, and most evenings end with a record on the turntable.',
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
  ],
  gearTitle: 'The setup',
  recordsTitle: 'Favourite records',
  records: [
    { id: 'record-1', title: 'Koi No Yokan', artist: 'Deftones', url: 'https://open.spotify.com/album/4PIVdqvL1Rc7T7Vfsr8n8Q' },
    { id: 'record-2', title: 'Ten', artist: 'Pearl Jam', url: 'https://open.spotify.com/album/5B4PYA7wNN4WdEXdIJu58a' },
    { id: 'record-3', title: 'Rumours', artist: 'Fleetwood Mac', url: 'https://open.spotify.com/album/1bt6q2SruMsBtcerNVtpZB' },
    { id: 'record-4', title: 'Superunknown', artist: 'Soundgarden', url: 'https://open.spotify.com/album/4AvI4sIYIYE1fIbLLGN7tb' },
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
      'Built Visit and maintain Community Solutions, the two platforms shown above.',
      'Administer the VIS production infrastructure, maintain its web services, and resolve operational issues.',
    ],
  },
  {
    title: 'Teaching Assistant',
    org: 'ETH Zurich',
    period: 'Sep 2025 – present',
    points: [
      'Systems Programming and Computer Architecture (SPCA): teach C, x86 assembly, and how programs meet the hardware, in a course of about 200 students.',
      'Digital Design and Computer Architecture (DDCA): guide students through FPGA labs that build up from simple adders to a 32-bit processor.',
    ],
  },
  {
    title: 'Software Engineer',
    org: 'Swiss AI',
    period: '2026',
    note: 'Bachelor’s thesis collaboration',
    points: [
      'Developed deployment and load-testing tools for large language models, so performance on GPU clusters can be evaluated automatically.',
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
      'Designed controlled experiments on how expert architecture affects language-model latency and throughput on multi-node GPU systems.',
      'Showed that active compute alone does not predict latency trends across the tested model families.',
    ],
    links: [
      { label: 'Code and results', url: 'https://github.com/burakemirsezen/moe-inference-thesis-artifacts' },
    ],
  },
  {
    name: 'Open-source contributions',
    context: 'Calibre-Web Automated, Seerr, SearXNG',
    // Summarises my merged pull requests in these repositories.
    points: ['Merged bug fixes and a configuration option upstream in three self-hosted applications.'],
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
