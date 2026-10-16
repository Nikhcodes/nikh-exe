/* NIKH.EXE default content.
 * This is what the site shows for a page until you save that page in the admin panel
 * (Admin → Pages). After that, the saved version from the database wins.
 * "Reset to default" in the admin brings back what is written here.
 * Image fields hold a media-library id (null = none). Text is plain text, never HTML.
 */
window.NIKH_DEFAULTS = {
  home: {
    name: 'Nikhiel Lingard',
    avatarLetter: 'N',
    avatar: null,
    avatarHover: null,
    status: 'Up late. Probably debugging something.',
    nowListening: 'Not set yet. Edit it in Admin → Pages → Home.',
    nowListeningLink: '',
    nowListeningCover: null,
    tape: 'WELCOME, STRANGER',
    headline: "Hey, I'm Nikh.",
    blurb: 'IT Operator by day, student and builder by night. Based in Suriname. Into music, anime, horror and backend systems.',
    into: ['Rock', 'Kompa', 'Zouk', 'Hunter x Hunter', 'Stardew Valley', 'Horror films', 'Football', 'Spring Boot', 'Cowboy Bebop'],
    updates: [
      { date: 'Oct 2026', text: 'Rebuilt this site as a real personal corner of the internet.' },
      { date: 'Oct 2026', text: 'Studying backend: Spring Security and PostgreSQL.' }
    ],
    picks: ['Cowboy Bebop', 'GTO', 'Initial D-style drifting anime', 'Inuyasha', 'Hunter x Hunter', 'Dragon Ball Super', "Assassin's Creed",
      'Zelda: Breath of the Wild', 'Stardew Valley', 'Super Mario Odyssey', 'Sleeping Dogs', 'The Truman Show', 'Halloween'],
    note: '',
    showCounter: true,
    awayTitle: 'psst... come back',
    lateNight: "It's past midnight. Go to sleep. (So should I.)"
  },
  music: {
    title: 'What I listen to',
    intro: 'Not just jazz. Genres and artists below are mine; the notes are waiting for me to fill in.',
    crates: [
      { name: 'Caribbean', color: '#a8442b', items: [
        { title: "Kassav'", label: 'Zouk', note: 'Add your favorite album or track + why.', cover: null, link: '' },
        { title: 'Gyptian', label: 'Dancehall', note: 'Add your favorite album or track + why.', cover: null, link: '' },
        { title: 'Beres Hammond', label: 'Reggae', note: 'Add your favorite album or track + why.', cover: null, link: '' },
        { title: 'Kompa', label: 'Any and all', note: 'Which groups? Add them here.', cover: null, link: '' }] },
      { name: 'Latin', color: '#7a2a63', items: [
        { title: 'Elvis Crespo', label: 'Salsa / merengue', note: 'Add your favorite album or track + why.', cover: null, link: '' },
        { title: 'Bachata', label: 'Genre', note: 'Which artists? Add them here.', cover: null, link: '' },
        { title: 'Merengue', label: 'Genre', note: 'Which artists? Add them here.', cover: null, link: '' }] },
      { name: 'Loud guitars', color: '#2b3a5c', items: [
        { title: 'My Chemical Romance', label: 'Alt rock', note: 'Add your favorite album or track + why.', cover: null, link: '' },
        { title: 'Green Day', label: 'Alt rock', note: 'Add your favorite album or track + why.', cover: null, link: '' }] },
      { name: 'Hip-hop', color: '#5a4a1a', items: [
        { title: 'MF DOOM', label: 'Favorite artist ever', note: 'Add your favorite album or track + why.', cover: null, link: '' }] },
      { name: 'Stage & score', color: '#4a1620', items: [
        { title: 'The Phantom of the Opera', label: 'Opera / musical', note: 'Add your favorite version or number + why.', cover: null, link: '' },
        { title: 'Classical', label: 'Genre', note: 'Which composers? Add them here.', cover: null, link: '' }] },
      { name: 'After midnight', color: '#1c4a4a', items: [
        { title: 'Jazz', label: 'Genre', note: 'Add your favorite artists + why. Bebop is the mood reference.', cover: null, link: '' }] }
    ]
  },
  links: {
    intro: 'Where I spend my internet time, and the people I keep thinking about.',
    links: [
      { name: 'Pinterest', url: 'https://www.pinterest.com', note: 'Where my taste goes to collect.' },
      { name: 'Spotify', url: 'https://open.spotify.com', note: 'Music, obviously.' },
      { name: 'GitHub', url: 'https://github.com', note: 'Obvious. My stuff lives at NikhCodes.' },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', note: 'Still funny. Still saves me.' },
      { name: 'Claude', url: 'https://claude.ai', note: 'Favorite, no questions asked.' },
      { name: 'Gemini', url: 'https://gemini.google.com', note: 'The other favorite, no questions asked.' }
    ],
    heroes: [
      { name: 'MF DOOM', category: 'Music', note: 'Favorite ever.', image: null, img: 'assets/heroes/doom.webp', alt: 'The metal DOOM mask with a halo', w: 520, h: 520 },
      { name: 'Paolo Maldini', category: 'Football', note: 'Idol growing up.', image: null, img: 'assets/heroes/maldini.webp', alt: 'Paolo Maldini pointing, in an AC Milan shirt', w: 520, h: 468 },
      { name: 'Ratonhnhaké:ton', category: 'Video Games', note: 'Character I remember from growing up.', image: null, img: 'assets/heroes/connor.webp', alt: 'Connor Kenway mid-fight with a tomahawk', w: 520, h: 520 },
      { name: 'Michael Myers', category: 'Horror', note: 'Fav Horror Character.', image: null, img: 'assets/heroes/myers.webp', alt: 'The pale Michael Myers mask in the dark', w: 284, h: 520 }
    ]
  },
  projects: {
    intro: "Real projects, honestly described. Some are products, some are experiments, and one is still homework.",
    projects: [
      { name: 'RigSight', tagline: 'Flagship backend project', art: 'rig', image: null,
        description: 'A simulated industrial monitoring platform. The question: how does a backend behave when input is a steady stream of equipment data instead of CRUD requests? It explores threshold monitoring, state transitions and alert deduplication, with JWT auth and role-based access.',
        stack: 'Java 21 · Spring Boot · Spring Security · JWT · Hibernate · PostgreSQL · Flyway · Docker',
        links: [{ label: 'Source', url: 'https://github.com/NikhCodes/rigsight' }] },
      { name: 'Microjobs.sr', tagline: 'Full-stack product for Suriname', art: 'mj', image: null,
        description: 'A local-first micro-jobs and talent marketplace. People build profiles, showcase skills, post jobs, apply and message each other. Covers session auth with bcrypt, role-aware admin, the job and application lifecycle, and relational modeling.',
        stack: 'Next.js · React · TypeScript · Tailwind · Prisma · PostgreSQL (Neon) · Vercel',
        links: [{ label: 'Live app', url: 'https://microjobs-sr.vercel.app/' }, { label: 'Source', url: 'https://github.com/Nikhcodes/microjobs.sr' }] },
      { name: 'AGAS', tagline: 'Academic group accountability system', art: 'led', image: null,
        description: 'Built around trust boundaries: a three-role authorization model, hashed passwords and an append-only audit log, with JSONB metadata, UUID keys and soft deletion. No public demo or repository.',
        stack: 'Node.js · Express · PostgreSQL · JWT · bcrypt · Helmet · Joi', links: [] },
      { name: 'NikhOS', tagline: 'Student workspace / PWA', art: 'os', image: null,
        description: 'A grade and assignment tracker that feels like a native app: installable and usable offline.',
        stack: 'React · Vite · Tailwind CSS · Framer Motion',
        links: [{ label: 'Live app', url: 'https://nikh-os-red.vercel.app' }, { label: 'Source', url: 'https://github.com/NikhCodes/NikhOS' }] },
      { name: 'Pose Cam', tagline: 'Computer vision experiment', art: 'cam', image: null,
        description: 'Real-time hand gesture detection using landmark geometry instead of a trained classifier, to understand the math under the library calls.',
        stack: 'Python · MediaPipe · OpenCV · NumPy',
        links: [{ label: 'Source', url: 'https://github.com/NikhCodes/face-tracker' }] }
    ]
  },
  journal: {
    intro: "Things I'm learning, things I think, and the occasional rant. Newest first.",
    entries: [
      { date: 'Oct 2026', title: 'Welcome to the website', tags: ['meta'],
        body: 'I had a normal portfolio. It was fine. It also sounded like every other developer on the internet. So I tore it up and built the kind of website people used to make: weird, personal and slightly too long.\n\nThe projects are still here. They just share the house with the music now.' },
      { date: 'Oct 2026', title: 'Auth is not a login form', tags: ['backend', 'security'],
        body: 'A login form takes an afternoon. The hard part is everything after it: how long a session lives, where a token is stored, how passwords are hashed, and what each role is actually allowed to do once it gets in.\n\nThat\'s why I like building it. Every shortcut shows up later as a bug or a hole.' },
      { date: 'Oct 2026', title: 'Ops brain, dev hands', tags: ['ops', 'backend'],
        body: 'Working in IT operations changed how I read code. I look at a feature and ask what happens when it fails, who finds out, and how fast. Happy paths are easy. Failure paths are where a system shows its character.' },
      { date: 'Oct 2026', title: "What I'm learning right now", tags: ['learning'],
        body: '- Spring Security and PostgreSQL, properly\n- The OWASP Top 10, and how to design auth\n- Caching strategies\n- Next up: Docker, Nginx and deployment\n\nNo framework collecting. One system at a time.' }
    ]
  },
  about: {
    tape: 'THE LIQUOR-FREE INTERVIEW',
    title: 'Who even is this guy',
    lede: 'By day I keep banking systems running. By night I build things that nobody asked for, usually with more care than the situation strictly requires.',
    paragraphs: [
      "I'm Nikhiel, but everyone calls me Nikh. I live in Suriname and work as an IT Operator at a fintech banking environment, which means I spend a lot of time making sure things work, and an even more suspicious amount of time wondering what happens when they stop working. I can't tell you the details, because banks get weird about that, but it has shaped how I think about software.",
      "I'm also studying BSc IT / Software Engineering at UNASAT, heading toward backend work. Java, Spring Boot, PostgreSQL, authentication, security. I like the parts of an app that users never see and absolutely notice when they're wrong.",
      "I'm not a ten-year veteran, and I'm not going to pretend. I'm early in my career, learning properly, and building real things along the way. My rule: I don't collect frameworks. I'd rather understand one system all the way down than skim ten tutorials.",
      "Outside the screen, I'm the guy with music on, an anime half-watched and a horror movie queued up. Yes, those can all happen in the same evening. This site is the proof."
    ],
    factsTitle: 'FIELD NOTES',
    facts: [
      { label: 'Day job', value: 'IT Operator, fintech banking' },
      { label: 'School', value: 'BSc IT / Software Eng., UNASAT' },
      { label: 'Heading toward', value: 'Backend engineering' },
      { label: 'Base', value: 'Suriname' },
      { label: 'Soundtrack', value: 'Kompa, zouk, salsa, reggae, alt rock, opera, jazz' },
      { label: 'Screens', value: 'Bebop, GTO, Hunter x Hunter, Inuyasha, Dragon Ball Super' },
      { label: 'Controllers', value: "Zelda, Stardew, Assassin's Creed, Mario Odyssey" },
      { label: 'Horror', value: "Yes. Halloween is a comfort film. Don't ask." }
    ],
    faq: [
      { q: 'Frequently asked, by nobody', a: 'Why a personal site instead of a normal portfolio? Because I wanted a place that feels like mine, with the projects in one room of it.' },
      { q: 'Do you do jazz only?', a: 'No. Jazz is the late-night shelf. The rest of the collection gets loud and goes to a party.' },
      { q: 'Open to work?', a: "Open to interesting things. Email me and we'll see." }
    ]
  },
  contact: {
    title: 'Say hello.',
    intro: 'Got something to build? Found a song I need to hear? Have a strong opinion about a movie? My inbox is open.',
    line2: "I'm always up for interesting projects, good conversations, and meeting people who care about what they make.",
    stamp: 'NO CORPORATE SMALL TALK REQUIRED',
    email: 'nikhiel.lingard.dev@gmail.com',
    note: 'Email is the best way to reach me. I do eventually emerge from my editor.',
    github: 'https://github.com/NikhCodes',
    linkedin: 'https://www.linkedin.com/in/nikhiel-lingard/',
    site: 'https://nikh-exe-git-main-nikhcodes-projects.vercel.app/#/',
    sign: 'BUILT IN SURINAME. REPLIES SENT WHEN HUMANLY POSSIBLE.'
  },
  footer: {
    text: 'Built after hours in Suriname.'
  }
};
