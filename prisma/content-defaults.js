// ============================================================================
// Default content for the section types that used to be hardcoded in
// frontend/index.html.
//
// Same shape as a CMS export/import payload, so it can be used three ways:
//   * prisma/seed.js upserts it into a fresh database,
//   * POST /api/admin/import re-applies it to an existing database,
//   * the admin "import" flow accepts it unchanged.
//
// Every value here is a transcription of what the public page already showed,
// so switching the sections over to the CMS does not change the site.
// ============================================================================
'use strict';

const collections = {
  'why-hire': [
    { icon: 'fas fa-puzzle-piece', title: 'Problem Solving', description: 'I break down complex challenges into elegant, scalable solutions. Every problem is an opportunity to build something better.' },
    { icon: 'fas fa-sitemap', title: 'Clean Architecture', description: 'I write code that is maintainable, testable, and well-structured. I follow SOLID principles and design patterns religiously.' },
    { icon: 'fas fa-gauge-high', title: 'Performance Focus', description: 'I optimize for speed, memory efficiency, and responsiveness. I understand the cost of every byte and every cycle.' },
    { icon: 'fas fa-brain', title: 'Fast Learning', description: 'I adapt quickly to new technologies and paradigms. I thrive on continuous learning and exploring the cutting edge.' },
    { icon: 'fas fa-paint-brush', title: 'UI/UX Thinking', description: 'I build with the user in mind. Clean interfaces, thoughtful interactions, and experiences that feel natural and intuitive.' },
    { icon: 'fas fa-users', title: 'Team Collaboration', description: 'I communicate clearly, collaborate effectively, and contribute to a positive team culture. Great software is built together.' },
  ],

  'process-steps': [
    { icon: 'fas fa-magnifying-glass', title: 'Research', description: 'Understand the problem deeply' },
    { icon: 'fas fa-pen-ruler', title: 'Planning', description: 'Design architecture & flow' },
    { icon: 'fas fa-paintbrush', title: 'Design', description: 'UI/UX & system design' },
    { icon: 'fas fa-code', title: 'Develop', description: 'Write clean, testable code' },
    { icon: 'fas fa-vial', title: 'Testing', description: 'Rigorous quality assurance' },
    { icon: 'fas fa-rocket', title: 'Deploy', description: 'Ship with confidence' },
  ],

  faq: [
    { question: 'Who is Muhammad Fahad Javed?', answer: "I'm Muhammad Fahad Javed — also known as Fahad Javed or FJ — a Computer Science student at FAST-NUCES, Multan. I specialize in C++ systems development, OOP, full-stack web development, and building products that solve real problems." },
    { question: 'Are you available for internships?', answer: "Yes! I'm actively looking for internships and entry-level positions where I can apply my skills and grow as an engineer. I'm open to remote, hybrid, and on-site roles." },
    { question: 'What technologies are you currently learning?', answer: "I'm currently exploring AI/ML fundamentals, advanced C++ features, and full-stack web development with React and Node.js. I also contribute to open-source projects in my free time." },
    { question: 'Do you work on open-source projects?', answer: "Absolutely! I believe in giving back to the community. I maintain several C++ libraries and educational projects on GitHub. Check out my repositories to see what I'm building." },
    { question: 'What makes you different from other developers?', answer: "I combine deep systems knowledge with a product mindset. I don't just write code — I think about architecture, user experience, performance, and long-term maintainability. I build things that last." },
  ],

  journey: [
    { year: '2019', title: 'First "Hello World"', description: 'Wrote my first C++ program on a dusty lab machine. That moment sparked a commitment to understanding how computers think.', tagList: ['C++', 'First Code'], image: '/journey-2019.jpg' },
    { year: '2020–2022', title: 'Building First Systems', description: 'Built 5+ console applications from scratch — games, utilities, simulators. Learned pointer arithmetic, memory management, and code discipline.', tagList: ['OOP', 'Pointers'], image: '/journey-2020.jpg' },
    { year: '2025', title: 'FAST-NUCES', description: 'Entered FAST-NUCES with a clear mission: formalize my engineering knowledge through rigorous coursework and brilliant peers.', tagList: ['Algorithms', 'DSA'], image: '/journey-2025.jpg' },
    { year: '2026+', title: 'AI Research & Future', description: 'Diving into AI interpretability, HCI, and intelligent systems. Building technology that understands and augments human decision-making.', tagList: ['AI', 'Research'], image: '/journey-2026.jpg' },
  ],

  blog: [
    { title: 'Why I Build Console Apps in 2026', category: 'Development', excerpt: 'Exploring why console apps remain relevant — focusing on system resource management and low-level debugging.', image: '/blog-console.jpg', date: 'June 2026', readTime: '5 min read', tagList: ['C++', 'Systems'] },
    { title: 'Interpretable AI: Why We Need Explainable Models', category: 'AI Research', excerpt: 'Discussing the black-box nature of AI models and the importance of explainable AI (XAI) in building trustworthy systems.', image: '/blog-ai.jpg', date: 'June 2026', readTime: '6 min read', tagList: ['AI', 'Ethics'] },
    { title: 'Building Clotheric: Lessons from Week One', category: 'Startup', excerpt: 'Product-market fit, user research, and the hard parts of starting a company.', image: '/blog-startup.jpg', date: 'May 2026', readTime: '4 min read', tagList: ['Startup', 'MVP'] },
    { title: 'What FAST-NUCES Taught Me About Engineering', category: 'Academic', excerpt: "University isn't about content — it's about the way of thinking. How formal CS education shapes problem-solving.", image: '/blog-fast.jpg', date: 'April 2026', readTime: '3 min read', tagList: ['FAST', 'Education'] },
  ],

  community: [
    { title: 'Code & Creativity', description: 'YouTube channel with coding tutorials, tech insights, and development content for aspiring engineers.', icon: 'fab fa-youtube', image: '/comm-youtube.jpg', stats: '🎬 12+ videos · 2+ years' },
    { title: 'Open Source', description: 'Active contributor to educational libraries and C++ projects on GitHub. Building tools for the developer community.', icon: 'fas fa-code-branch', image: '/comm-oss.jpg', stats: '📦 8 repositories' },
    { title: 'FAST Mentorship', description: 'Mentoring junior students in programming fundamentals, OOP, and systems design at FAST-NUCES.', icon: 'fas fa-graduation-cap', image: '/comm-mentor.jpg', stats: '🧑‍🏫 10+ mentees' },
    { title: 'Tech Forums', description: 'Helping solve C++ and systems programming issues on Stack Overflow and developer communities.', icon: 'fas fa-stack-overflow', image: '/comm-forum.jpg', stats: '💡 50+ answers' },
  ],

  'beyond-code': [
    { icon: 'fas fa-book-open', title: 'Philosophy & Reading', description: 'I dive into philosophy, cognitive science, and systems thinking. Books like Gödel, Escher, Bach and The Pragmatic Programmer shape how I see the world and build software.', tagline: '📚 30+ books' },
    { icon: 'fas fa-pencil-ruler', title: 'Creative Writing', description: 'I write about technology, philosophy, and the human condition. My articles explore the intersection of code, creativity, and consciousness — because engineering is a form of art.', tagline: '✍️ 12+ articles' },
    { icon: 'fas fa-microchip', title: 'Hardware Tinkering', description: 'I love getting my hands dirty with electronics — from Arduino projects to understanding how memory works at the physical level. Low-level understanding makes me a better systems developer.', tagline: '🔧 5+ projects' },
    { icon: 'fas fa-mountain', title: 'Nature & Photography', description: "I find clarity in nature. Whether it's hiking, exploring new places, or capturing moments through a lens, the outdoors remind me why we build — to connect, explore, and understand.", tagline: '📸 Always exploring' },
    { icon: 'fas fa-gamepad', title: 'Game Design & Play', description: 'I design and play games that challenge the mind — from chess to strategy games to building my own console games. Game design teaches me about systems, feedback loops, and player experience.', tagline: '🎮 3+ games built' },
    { icon: 'fas fa-hand-holding-heart', title: 'Mentorship & Community', description: 'I mentor junior developers and students, run study groups, and contribute to tech communities. Helping others learn is one of the most rewarding parts of my journey.', tagline: '🧑‍🏫 20+ mentees' },
  ],

  'coding-profiles': [
    { platform: 'LeetCode', title: 'Data Structures & Algorithms practice', icon: 'fas fa-code', image: '/leetcode-logo.png', url: '', badge: 'Active', stats: '48 solved · 15-day streak · 3 badges' },
    { platform: 'HackerRank', title: 'Building problem-solving skills in C++ & algorithms', icon: 'fab fa-hackerrank', image: '/hackerrank-logo.png', url: '', badge: 'Active', stats: '32 solved · 5 stars · 3 badges' },
  ],

  clotheric: [
    { icon: 'fas fa-laptop-code', title: 'Platform Architecture', description: 'Scalable full stack architecture designed for growth, with modular components and clean separation of concerns.' },
    { icon: 'fas fa-users-cog', title: 'Product Strategy', description: 'From market research to MVP launch defining product vision, user flows, and go to-market strategy.' },
  ],

  // Section eyebrows and headings. Headings support the **highlight** marker.
  'site-text': [
    { key: 'about.eyebrow', label: 'About — eyebrow', group: 'About', value: 'About Me' },
    { key: 'why-hire.eyebrow', label: 'Why Hire Me — eyebrow', group: 'Why Hire Me', value: 'Why Hire Me' },
    { key: 'why-hire.heading', label: 'Why Hire Me — heading', group: 'Why Hire Me', value: 'What **Fahad Javed** Brings to the Table' },
    { key: 'clotheric.eyebrow', label: 'Clotheric — eyebrow', group: 'Clotheric', value: 'Featured Startup' },
    { key: 'clotheric.heading', label: 'Clotheric — heading', group: 'Clotheric', value: 'Building **Clotheric**' },
    { key: 'education.eyebrow', label: 'Education — eyebrow', group: 'Education', value: 'Academic Journey' },
    { key: 'education.heading', label: 'Education — heading', group: 'Education', value: 'My **Education**' },
    { key: 'skills.eyebrow', label: 'Skills — eyebrow', group: 'Skills', value: 'Expertise' },
    { key: 'skills.heading', label: 'Skills — heading', group: 'Skills', value: 'Skills & **Tech Stack**' },
    { key: 'process.eyebrow', label: 'Process — eyebrow', group: 'Process', value: 'How I Build' },
    { key: 'process.heading', label: 'Process — heading', group: 'Process', value: 'My **Development Process**' },
    { key: 'projects.eyebrow', label: 'Projects — eyebrow', group: 'Projects', value: 'Portfolio' },
    { key: 'projects.heading', label: 'Projects — heading', group: 'Projects', value: 'Featured **Projects**' },
    { key: 'experience.eyebrow', label: 'Experience — eyebrow', group: 'Experience', value: 'Experience' },
    { key: 'experience.heading', label: 'Experience — heading', group: 'Experience', value: 'Experience & **Projects**' },
    { key: 'achievements.eyebrow', label: 'Achievements — eyebrow', group: 'Achievements', value: 'Achievements' },
    { key: 'achievements.heading', label: 'Achievements — heading', group: 'Achievements', value: 'Metrics That **Matter**' },
    { key: 'certificates.eyebrow', label: 'Certificates — eyebrow', group: 'Certificates', value: 'Credentials' },
    { key: 'certificates.heading', label: 'Certificates — heading', group: 'Certificates', value: 'Certificates & **Achievements**' },
    { key: 'services.eyebrow', label: 'Services — eyebrow', group: 'Services', value: 'What I Offer' },
    { key: 'services.heading', label: 'Services — heading', group: 'Services', value: 'Professional **Services**' },
    { key: 'github.eyebrow', label: 'GitHub — eyebrow', group: 'GitHub', value: 'Open Source' },
    { key: 'github.heading', label: 'GitHub — heading', group: 'GitHub', value: 'GitHub **Dashboard**' },
    { key: 'coding.eyebrow', label: 'Coding — eyebrow', group: 'Coding', value: 'Problem Solving' },
    { key: 'coding.heading', label: 'Coding — heading', group: 'Coding', value: 'Coding **Profiles**' },
    { key: 'linkedin.eyebrow', label: 'LinkedIn — eyebrow', group: 'LinkedIn', value: 'Networking' },
    { key: 'linkedin.heading', label: 'LinkedIn — heading', group: 'LinkedIn', value: 'Connect on **LinkedIn**' },
    { key: 'journey.eyebrow', label: 'Journey — eyebrow', group: 'Journey', value: 'My Story' },
    { key: 'journey.heading', label: 'Journey — heading', group: 'Journey', value: 'Personal **Journey**' },
    { key: 'blog.eyebrow', label: 'Blog — eyebrow', group: 'Blog', value: 'Knowledge Sharing' },
    { key: 'blog.heading', label: 'Blog — heading', group: 'Blog', value: 'Blog & **Articles**' },
    { key: 'testimonials.eyebrow', label: 'Testimonials — eyebrow', group: 'Testimonials', value: 'Testimonials' },
    { key: 'testimonials.heading', label: 'Testimonials — heading', group: 'Testimonials', value: 'What People **Say**' },
    { key: 'community.eyebrow', label: 'Community — eyebrow', group: 'Community', value: 'Community & Impact' },
    { key: 'community.heading', label: 'Community — heading', group: 'Community', value: 'Building **Together**' },
    { key: 'resume.eyebrow', label: 'Resume — eyebrow', group: 'Resume', value: 'Resume' },
    { key: 'resume.heading', label: 'Resume — heading', group: 'Resume', value: 'Quick **Overview**' },
    { key: 'faq.eyebrow', label: 'FAQ — eyebrow', group: 'FAQ', value: 'FAQ' },
    { key: 'faq.heading', label: 'FAQ — heading', group: 'FAQ', value: 'Frequently Asked **Questions**' },
    { key: 'beyond-code.eyebrow', label: 'Beyond Code — eyebrow', group: 'Beyond Code', value: 'Beyond Code' },
    { key: 'beyond-code.heading', label: 'Beyond Code — heading', group: 'Beyond Code', value: 'Life **Outside the Terminal**' },
    { key: 'contact.eyebrow', label: 'Contact — eyebrow', group: 'Contact', value: "Let's Talk" },
    { key: 'contact.heading', label: 'Contact — heading', group: 'Contact', value: 'Get In **Touch**' },
  ],
};

const singletons = {
  linkedin: {
    name: 'Muhammad Fahad Javed',
    headline: 'C++ Systems Developer & AI Engineer · FAST-NUCES',
    location: '📍 Multan, Pakistan',
    avatar: '',
    url: 'https://www.linkedin.com/in/muhammad-fahad-javed',
    connections: '500+',
    recommendations: '3',
    posts: '12',
    openToWork: true,
  },
  resume: {
    intro: '',
    educationList: ['BS Computer Science | FAST-NUCES, 2029', 'Intermediate (ICS) | KIPS College, 2024', 'Matriculation | Govt. High School, 2022'],
    coreSkills: ['Languages | C++, Python, JS, Java', 'Concepts | OOP, DSA, Memory Mgmt', 'Tools | Git, Linux, SQL, SFML'],
    buttonText: 'Download PDF',
    buttonUrl: '/resume.pdf',
  },
  github: {
    username: 'muhammad-fahad-javed',
    profileUrl: 'https://github.com/muhammad-fahad-javed',
    bio: 'C++ Systems Developer · AI Engineer',
    location: '📍 Multan, Pakistan',
    showStats: true,
    showContributions: true,
    showRepos: true,
    repoLimit: 6,
  },
};

module.exports = { collections, singletons };
