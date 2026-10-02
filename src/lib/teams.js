// Single source for the team list shown in the navbar dropdown, the footer and
// the Home "find your team" rows. `name` is the short label used everywhere
// except each page's own h1 (Research keeps "Microgreen Microwaves").
export const TEAMS = [
  {
    to: '/research',
    name: 'Microgreens',
    what: "Designing, building, and qualifying a microgreen growth chamber for NASA's LEAF initiative.",
    work: 'Grow microgreens and build the chamber that feeds astronauts.',
  },
  {
    to: '/sa2tp',
    name: 'SA²TP',
    what: 'The Student Analog Astronaut Training Program: three weeks of fitness, flight, scuba, and NASA facility visits.',
    work: 'Train as an analog astronaut.',
  },
  {
    to: '/astrousa',
    name: 'ASTRO-USA',
    what: "An analog research station on Purdue's campus: a self-sustaining, closed-loop habitat for long-duration mission simulation.",
    work: 'Design habitat systems, from architecture to hydroponics and life support.',
  },
  {
    to: '/ares',
    name: 'ARES',
    what: 'A wearable CO₂ and biophysical sensing headset that detects the pocket of rebreathed air that forms in front of the face.',
    work: 'Build wearable sensors and study how breath moves.',
  },
  {
    to: '/software',
    name: 'Software',
    what: 'VR space suit interfaces, lunar navigation, and space logistics design with AI, built for NASA SUITS.',
    work: 'Write software for spacesuits and missions.',
  },
  {
    to: '/business',
    name: 'Business & Operations',
    what: 'The team behind every trip, partnership, and sponsorship, including research trips to Biosphere 2 and Kennedy Space Center.',
    work: 'Plan trips, find sponsors, and keep missions funded.',
  },
  {
    to: '/outreach',
    name: 'Outreach',
    what: '3+ events per semester with speakers from NASA, SpaceX, SETI, and Blue Origin.',
    work: 'Host speakers and run campus events.',
  },
];

export const TEAMS_PATHS = TEAMS.map(t => t.to);
