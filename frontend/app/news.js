// News & highlights content.
// PLACEHOLDER: these stories and videos come from the Eventfy v4 design
// prototype and are not real. The backend has no news API yet — replace
// them with real recaps (or wire this to an endpoint) before launch.
// `related` is matched against upcoming event titles to show a "Coming up" card.

export const NEWS = [
  { id: 1, tag: 'Recap', title: 'DevFest Algiers 2025: the talks everyone was still debating at lunch', d: '2025-10-14', read: '6 min', related: 'DevFest',
    excerpt: 'From on-device AI to the quiet comeback of server-rendered apps, here is what stood out across twenty sessions and a very full main hall.',
    body: ['The morning keynote set the tone: build for the phones people actually have. Speakers returned again and again to offline-first design, small models running on-device and apps that stay fast on patchy 4G.', 'The afternoon codelabs were the surprise hit. Every seat in the Flutter and Firebase rooms was taken within minutes, and organizers have promised twice the lab capacity this year.', 'Registration for DevFest Algiers 2026 is now open, and the free passes are going fast.'] },
  { id: 2, tag: 'Announcement', title: 'DevFest Algiers 2026 adds four new speakers to the lineup', d: '2026-09-18', read: '3 min', related: 'DevFest',
    excerpt: 'Talks on platform engineering, WebGPU, AI evaluation and accessibility join the October programme.',
    body: ['The organizing team confirmed four more sessions this week, rounding out a programme that now covers web, cloud, mobile and AI tracks.', 'Hybrid attendees will be able to join every main-stage talk live, with Q&A open to both rooms.'] },
  { id: 3, tag: 'Recap', title: 'AI Hackathon Spring: 38 teams, 48 hours, one very tired jury', d: '2026-04-22', read: '5 min', related: 'Hackathon',
    excerpt: 'An offline-first clinic assistant took the top prize. Here is how the winning team scoped, built and demoed it.',
    body: ['The winners spent the first six hours not writing any code. Instead they interviewed two nurses on the phone and cut their feature list in half.', 'Their demo ran entirely on a mid-range Android phone in airplane mode, which the jury called the most honest demo of the weekend.', 'The autumn edition runs this month with GPUs, mentors and meals included.'] },
  { id: 4, tag: 'Community', title: 'How the Algiers React meetup grew from 12 to 80 regulars', d: '2026-09-10', read: '4 min', related: 'React',
    excerpt: 'Short talks, a strict start time and pizza that actually arrives. The organizers share what worked.',
    body: ['The first session had twelve people and one projector cable that did not fit. Two years later, the meetup fills Sylabs every month.', 'The rule that made the difference: every talk is at most twenty minutes, and at least one speaker per night is giving their first talk.'] },
  { id: 5, tag: 'Recap', title: 'GDG Cloud Day: three takeaways on running Kubernetes cheaply', d: '2026-06-17', read: '4 min', related: 'Kubernetes',
    excerpt: 'Right-size first, autoscale second, and stop paying for idle staging clusters overnight.',
    body: ['The most-quoted slide of the day was a single bar chart: one team cut its cloud bill by 40% simply by shutting staging clusters down at night.', 'If you want to go hands-on, the Kubernetes in Production workshop this month has a handful of seats left.'] },
  { id: 6, tag: 'Announcement', title: 'Cyberparc hosts its first public CTF night in October', d: '2026-09-05', read: '2 min', related: 'CTF',
    excerpt: 'Web, crypto and reverse-engineering challenges for every level, solo or in pairs.',
    body: ['Cyberparc Sidi Abdellah opens its doors for an evening capture-the-flag competition. Beginners get a guided track, and experienced players can go straight to the hard board.'] },
];

export const HIGHLIGHTS = [
  { title: 'Opening keynote: building for the phones people actually have', event: 'DevFest Algiers 2025', dur: '12:40', art: 1 },
  { title: 'Winning demo: the offline-first clinic assistant', event: 'AI Hackathon Spring', dur: '4:15', art: 3 },
  { title: 'Live-debugging a failing cluster on stage', event: 'GDG Cloud Day', dur: '18:02', art: 5 },
  { title: 'Six lightning talks in thirty minutes', event: 'React Meetup #8', dur: '29:30', art: 4 },
];

// [tag background, tag text, stripe A, stripe B]
export const TAG_COLORS = {
  Recap: ['#ede9fe', '#6d28d9', '#ede9fe', '#f5f3ff'],
  Announcement: ['#ffedd5', '#c2410c', '#ffedd5', '#fff7ed'],
  Community: ['#dcfce7', '#15803d', '#dcfce7', '#f0fdf4'],
};
