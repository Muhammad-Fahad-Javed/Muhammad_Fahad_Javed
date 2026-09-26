// ============================================================================
// Migration seed.
//
// This transcribes the content that was previously hard-coded in
// frontend/index.html into the database, so that after switching the site
// over to the CMS the public page looks exactly the same as before. It is
// SAFE TO RE-RUN: every write is an upsert, so running it again after you've
// started editing content in the admin dashboard will not create duplicates
// (matched by title/name) and will not touch rows it doesn't recognize.
//
// Run once with:  npm run seed
// ============================================================================
require('dotenv').config();
const prisma = require('../lib/db');
const { hashPassword } = require('../lib/auth');

async function upsertByUniqueField(model, whereField, whereValue, data) {
  const existing = await model.findFirst({ where: { [whereField]: whereValue } });
  if (existing) {
    return model.update({ where: { id: existing.id }, data });
  }
  return model.create({ data: { ...data, [whereField]: whereValue } });
}

async function main() {
  console.log('Seeding database from existing portfolio content...');

  // ---- Admin user (optional convenience: also created by `npm run create-admin`) ----
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD);
    await prisma.adminUser.upsert({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase().trim() },
      update: {},
      create: { email: process.env.ADMIN_EMAIL.toLowerCase().trim(), passwordHash, name: 'Admin' },
    });
    console.log('✅ Admin user ensured.');
  }

  // ---- Profile ----
  await prisma.profile.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      fullName: 'Muhammad Fahad Javed',
      displayName: 'Fahad Javed (FJ)',
      title: 'Software Engineer & Full Stack Developer',
      introShort:
        "Computer Science student at FAST-NUCES, Pakistan, specializing in C++ development, full-stack web development, and AI.",
      email: 'muhammadfahadjaved610@gmail.com',
      phone: '',
      whatsapp: '+923030322786',
      location: 'Multan, Pakistan',
      availability: 'Open to Work',
      profileImage: '/images/og-image.jpg',
      resumeUrl: '/resume.pdf',
    },
  });
  console.log('✅ Profile seeded.');

  // ---- Hero ----
  await prisma.hero.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      heading: 'MUHAMMAD FAHAD JAVED',
      name: 'Muhammad Fahad Javed',
      typedRoles: JSON.stringify(['Software Engineer', 'C++ Developer', 'Full Stack Developer', 'Systems Thinker']),
      subtitle: '',
      description: '',
      ctaText: "Let's Connect",
      ctaUrl: '#contact',
      ctaSecondaryText: 'CV',
      ctaSecondaryUrl: '/resume.pdf',
      heroImage: '',
      statusText: 'Open to Work',
    },
  });
  console.log('✅ Hero seeded.');

  // ---- About ----
  await prisma.about.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      greeting: 'Who I Am',
      heading: 'Software Engineer & Full Stack Developer',
      subheading: 'Muhammad Fahad Javed (FJ)',
      paragraphs: JSON.stringify([
        "I'm <strong>Muhammad Fahad Javed</strong> — known as <strong>Fahad Javed</strong> or <strong>FJ</strong> — a Computer Science student at <strong>FAST – National University of Computer and Emerging Sciences (FAST-NUCES), Multan Campus</strong>, with a passion for software engineering and building technology that solves real world problems.",
        'My programming journey began during my <strong>Intermediate (ICS)</strong> studies, where I discovered the excitement of transforming ideas into practical software using <strong>C++</strong> and <strong>Object-Oriented Programming</strong>. Since then, I have continuously strengthened my skills through hands-on projects, self-directed learning, and a commitment to continuous improvement.',
        'I specialize in <strong>C++</strong>, <strong>full-stack web development</strong>, and designing modern digital solutions. I believe software should do more than function — it should solve meaningful problems, improve everyday experiences, and create lasting value for its users.',
        'I approach every project with a focus on clean architecture, performance, and user experience while constantly exploring new technologies and best practices. Curiosity, consistency, and lifelong learning are the principles that drive my growth as a developer.',
        'Beyond academics, I contribute as a <strong>Developer &amp; Strategist</strong> at <strong>CLOTHERIC</strong>, where I help transform ideas into impactful digital solutions while expanding my expertise in software engineering and product development.',
      ]),
      tags: JSON.stringify([
        { icon: 'fas fa-code', label: 'Software Developer' },
        { icon: 'fas fa-laptop-code', label: 'Full-Stack Development' },
        { icon: 'fas fa-cubes', label: 'C++' },
        { icon: 'fas fa-lightbulb', label: 'Problem Solver' },
        { icon: 'fas fa-rocket', label: 'Product Builder' },
        { icon: 'fas fa-graduation-cap', label: 'Co-Founder' },
      ]),
      image: '/images/og-image.jpg',
    },
  });
  console.log('✅ About seeded.');

  // ---- SEO ----
  await prisma.seoSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      siteTitle: 'Muhammad Fahad Javed — Computer Science Student & Developer Portfolio',
      metaDescription:
        'Muhammad Fahad Javed is a Computer Science student at FAST-NUCES, Pakistan, specializing in C++ development, full-stack web development, and AI. Explore projects, skills, and experience.',
      keywords: '',
      author: 'Muhammad Fahad Javed',
      ogTitle: 'Muhammad Fahad Javed — Computer Science Student & Developer Portfolio',
      ogDescription:
        'Muhammad Fahad Javed is a Computer Science student at FAST-NUCES, Pakistan, specializing in C++ development, full-stack web development, and AI.',
      ogImage: 'https://muhammadfahadjaved.vercel.app/images/og-image.jpg',
      twitterHandle: '@fahadjaved',
      canonicalUrl: 'https://muhammadfahadjaved.vercel.app/',
    },
  });
  console.log('✅ SEO settings seeded.');

  // ---- Site settings ----
  await prisma.siteSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      maintenanceMode: false,
      footerText: '© Muhammad Fahad Javed (FJ) — Built with purpose. Engineered for impact.',
      gaId: 'G-CED0D4DXW3',
      themeColor: '#5A3B22',
    },
  });
  console.log('✅ Site settings seeded.');

  // ---- Social links ----
  const socialLinks = [
    { platform: 'GitHub', url: 'https://github.com/muhammad-fahad-javed', icon: 'fab fa-github', label: 'muhammad-fahad-javed', order: 0 },
    { platform: 'LinkedIn', url: 'https://www.linkedin.com/in/muhammad-fahad-javed', icon: 'fab fa-linkedin-in', label: 'muhammad-fahad-javed', order: 1 },
    { platform: 'WhatsApp', url: 'https://wa.me/923030322786', icon: 'fab fa-whatsapp', label: '+92 303 032 2786', order: 2 },
  ];
  for (const link of socialLinks) {
    await upsertByUniqueField(prisma.socialLink, 'platform', link.platform, link);
  }
  console.log('✅ Social links seeded.');

  // ---- Skills ----
  const skills = [
    ['C++', 'Programming Languages', 'fas fa-code', 92],
    ['Python', 'Programming Languages', 'fab fa-python', 78],
    ['JavaScript', 'Programming Languages', 'fab fa-js', 70],
    ['Java', 'Programming Languages', 'fas fa-code', 55],
    ['OOP Design', 'Systems & OOP', 'fas fa-cubes', 95],
    ['Data Structures', 'Systems & OOP', 'fas fa-sitemap', 88],
    ['Memory Management', 'Systems & OOP', 'fas fa-memory', 85],
    ['Algorithms', 'Systems & OOP', 'fas fa-sitemap', 72],
    ['AI Fundamentals', 'AI & Research', 'fas fa-robot', 45],
    ['ML Basics', 'AI & Research', 'fas fa-robot', 30],
  ];
  for (let i = 0; i < skills.length; i++) {
    const [name, category, icon, level] = skills[i];
    await upsertByUniqueField(prisma.skill, 'name', name, {
      name, category, icon, level, order: i, visible: true,
      featured: ['C++', 'OOP Design', 'Data Structures', 'Memory Management', 'Python'].includes(name),
    });
  }
  console.log('✅ Skills seeded.');

  // ---- Projects ----
  const projects = [
    {
      title: 'Student Management System',
      shortDesc: 'A C++ console application implementing full CRUD operations with multi-level inheritance, polymorphism, and file persistence.',
      image: '/projects/studentmanagemetsystem.png',
      technologies: ['C++', 'OOP'],
      githubUrl: 'https://github.com/Muhammad-Fahad-Javed/student-management-system',
    },
    {
      title: 'Bank Account System',
      shortDesc: 'A polymorphic banking simulation in C++ with Savings/Current accounts, virtual functions, and transaction history.',
      image: '/projects/bandaccountsystem.png',
      technologies: ['C++', 'Polymorphism'],
      githubUrl: 'https://github.com/Muhammad-Fahad-Javed/Bank-Account-System-',
    },
    {
      title: 'Console Ludo Game',
      shortDesc: 'A complete Ludo game in C++ with OOP architecture, dice logic, player turn management, and console rendering.',
      image: '/projects/ludogame.png',
      technologies: ['C++', 'Game Dev'],
      githubUrl: 'https://github.com/Muhammad-Fahad-Javed/Ludo-game',
    },
  ];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    await upsertByUniqueField(prisma.project, 'title', p.title, {
      title: p.title,
      shortDesc: p.shortDesc,
      fullDesc: '',
      image: p.image,
      images: JSON.stringify([]),
      technologies: JSON.stringify(p.technologies),
      category: 'C++',
      githubUrl: p.githubUrl,
      liveUrl: '',
      date: '',
      client: '',
      features: JSON.stringify([]),
      role: '',
      featured: true,
      published: true,
      order: i,
    });
  }
  console.log('✅ Projects seeded.');

  // ---- Certificates ----
  const certificates = [
    ['Foundations of Cybersecurity', 'Google', 'June 2025', '/cert-google-cyber.jpg'],
    ['AWS Generative AI', 'Amazon Web Services', 'March 2026', '/cert-aws-genai.jpg'],
    ['AI Security & Governance', 'Securiti AI', 'January 2026', '/cert-ai-security.jpg'],
    ['Linux & SQL', 'Google', 'January 2026', '/cert-linux-sql.jpg'],
    ['Freelancing', 'DigiSkills Pakistan', 'October 2023', '/cert-freelancing.jpg'],
    ['WordPress Development', 'DigiSkills Pakistan', 'July 2023', '/cert-wordpress.jpg'],
    ['C++ Programming', 'CodeAlpha', 'April 2025', '/cert-cpp-alpha.jpg'],
    ['Network Security', 'Google', 'June 2025', '/cert-network-sec.jpg'],
  ];
  for (let i = 0; i < certificates.length; i++) {
    const [name, organization, issueDate, image] = certificates[i];
    await upsertByUniqueField(prisma.certificate, 'name', name, {
      name, organization, issueDate, image,
      expiryDate: '', credentialId: '', credentialUrl: '', description: '',
      skills: JSON.stringify([]), featured: i < 4, published: true, order: i,
    });
  }
  console.log('✅ Certificates seeded.');

  // ---- Experience ----
  const experience = [
    {
      position: 'Co-Founder', company: 'Clotheric', startDate: '2026', endDate: 'Present', current: true,
      description: "Co-managing a clothing brand with responsibilities in business operations, digital presence, teamwork, and customer engagement while contributing to the brand's growth.",
      technologies: ['Entrepreneurship', 'Business', 'Teamwork'], logo: '/exp-clotheric.png',
    },
    {
      position: 'Personal Software Projects', company: 'Independent Learning', startDate: '2024', endDate: 'Present', current: true,
      description: 'Developed multiple C++ and web development projects to strengthen programming, problem-solving, and software engineering skills.',
      technologies: ['C++', 'OOP', 'Web Development'], logo: '/exp-portfolio.png',
    },
  ];
  for (let i = 0; i < experience.length; i++) {
    const e = experience[i];
    await upsertByUniqueField(prisma.experience, 'position', e.position, {
      ...e,
      responsibilities: JSON.stringify([]),
      technologies: JSON.stringify(e.technologies),
      location: '', order: i, visible: true,
    });
  }
  console.log('✅ Experience seeded.');

  // ---- Education ----
  const education = [
    ['BS Computer Science', 'FAST NUCES, Multan', '2025', '2029 · In Progress', '/edu-fast.jpg'],
    ['Intermediate (ICS)', 'KIPS College', '2022', '2024 · Completed', '/edu-college.jpg'],
    ['Matriculation (Computer Science)', 'Government Model High School', '2021', '2022 · Completed', '/edu-school.jpg'],
  ];
  for (let i = 0; i < education.length; i++) {
    const [degree, institution, startDate, endDate, logo] = education[i];
    await upsertByUniqueField(prisma.education, 'degree', degree, {
      degree, institution, program: '', startDate, endDate, description: '', grade: '', logo,
      location: '', order: i, visible: true,
    });
  }
  console.log('✅ Education seeded.');

  // ---- Services ----
  const services = [
    ['C++ Systems Development', 'Build robust console applications, libraries, and system tools with clean OOP architecture and efficient memory management.', 'fas fa-code', '/service-cpp.jpg', 'from $20'],
    ['Technical Tutoring', 'One-on-one tutoring for C++, OOP, Data Structures, and Algorithms. Clear explanations with practical examples.', 'fas fa-chalkboard-teacher', '/service-tutoring.jpg', '$10/hr'],
    ['Systems Architecture', 'Design scalable, maintainable software architectures. From console apps to full system design with separation of concerns.', 'fas fa-sitemap', '/service-arch.jpg', 'Consulting'],
    ['AI Consulting', 'Advise on integrating AI models into existing systems. Research-focused approach to intelligent system design.', 'fas fa-robot', '/service-ai.jpg', 'Research'],
  ];
  for (let i = 0; i < services.length; i++) {
    const [name, description, icon, image, priceLabel] = services[i];
    await upsertByUniqueField(prisma.service, 'name', name, {
      name, description, icon, image, priceLabel,
      technologies: JSON.stringify([]), features: JSON.stringify([]), order: i, visible: true,
    });
  }
  console.log('✅ Services seeded.');

  // ---- Achievements ----
  const achievements = [
    ['Projects Built', 12, '+', 'fas fa-code'],
    ['Problems Solved', 48, '+', 'fas fa-brain'],
    ['Certificates', 5, '+', 'fas fa-award'],
    ['Years Learning', 3, '+', 'fas fa-clock'],
  ];
  for (let i = 0; i < achievements.length; i++) {
    const [title, number, suffix, icon] = achievements[i];
    await upsertByUniqueField(prisma.achievement, 'title', title, {
      title, number, suffix, icon, description: '', date: '', image: '', organization: '', url: '',
      featured: true, order: i, visible: true,
    });
  }
  console.log('✅ Achievements seeded.');

  // ---- Testimonials ----
  const testimonials = [
    ['Prof. Ahmed', 'CS Faculty, FAST-NUCES', "Fahad's code is exceptionally clean and well-structured. He understands OOP principles deeply and writes maintainable, performant C++ code."],
    ['Ali Raza', 'Co-Founder, Clotheric', "Working with Fahad on Clotheric was a game-changer. His full-stack expertise and product mindset turned our vision into a scalable reality."],
    ['Sara Khan', 'Senior Developer', "Fahad's ability to break down complex problems and build elegant solutions is remarkable. He's a fast learner and a great team player."],
  ];
  for (let i = 0; i < testimonials.length; i++) {
    const [name, role, text] = testimonials[i];
    await upsertByUniqueField(prisma.testimonial, 'name', name, {
      name, role, company: '', image: '', text, rating: 5, url: '', published: true, order: i,
    });
  }
  console.log('✅ Testimonials seeded.');

  console.log('\n🎉 Seed complete. The public site should now look exactly like it did before.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
