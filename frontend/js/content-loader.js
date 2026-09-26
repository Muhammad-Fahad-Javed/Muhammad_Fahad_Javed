/* ============================================================================
   CMS content loader.

   This file is loaded BEFORE js/main.js. It fetches /api/public/content and,
   if successful, rewrites the DOM of each CMS-managed section using the same
   CSS classes as the original hand-written markup (so every animation,
   IntersectionObserver, and style rule in main.js/style.css keeps working
   unchanged). If the request fails or times out, it does nothing and the
   static HTML that shipped with the page (already seeded to match) is shown
   instead — the page never renders empty.

   main.js is appended to the document only AFTER this finishes, so its
   querySelectorAll() calls always see the final, CMS-populated DOM.
   ========================================================================= */
(function () {
  'use strict';

  var ENDPOINT = '/api/public/content';
  var TIMEOUT_MS = 3000;

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        setTimeout(function () { resolve(null); }, ms);
      }),
    ]);
  }

  function reveal(el, delayClass) {
    if (delayClass) el.classList.add(delayClass);
    return el;
  }

  // ---- HERO (typed roles) ----------------------------------------------
  function applyHero(hero) {
    if (!hero) return;
    try {
      var roles = Array.isArray(hero.typedRoles) ? hero.typedRoles.filter(Boolean) : [];
      if (roles.length) window.__TYPED_ROLES__ = roles;
    } catch (e) { /* keep default */ }
  }

  // ---- ABOUT --------------------------------------------------------------
  function applyAbout(about, profile) {
    if (!about) return;
    var wrap = document.querySelector('.hero-about-text');
    if (!wrap) return;

    var greeting = wrap.querySelector('.greeting');
    if (greeting && about.greeting) greeting.textContent = about.greeting;

    var heading = wrap.querySelector('h2');
    if (heading && about.heading) {
      heading.innerHTML = esc(about.heading);
    }

    var paragraphs = Array.isArray(about.paragraphs) ? about.paragraphs : [];
    if (paragraphs.length) {
      var existingPs = wrap.querySelectorAll('p');
      existingPs.forEach(function (p) { p.remove(); });
      var tagsDiv = wrap.querySelector('.hero-about-tags');
      paragraphs.forEach(function (html) {
        var p = document.createElement('p');
        p.innerHTML = html;
        wrap.insertBefore(p, tagsDiv);
      });
    }

    var tags = Array.isArray(about.tags) ? about.tags : [];
    var tagsWrap = wrap.querySelector('.hero-about-tags');
    if (tagsWrap && tags.length) {
      tagsWrap.innerHTML = tags.map(function (t, i) {
        var cls = i === 0 ? ' class="tag-primary"' : '';
        return '<span' + cls + '><i class="' + esc(t.icon || 'fas fa-star') + '" aria-hidden="true"></i> ' + esc(t.label) + '</span>';
      }).join('');
    }

    var avatarImg = document.querySelector('.hero-avatar img');
    if (avatarImg && about.image) avatarImg.src = about.image;

    if (profile && profile.resumeUrl) {
      var cvLink = wrap.querySelector('a.btn-ghost');
      if (cvLink && /CV/i.test(cvLink.textContent)) {
        cvLink.setAttribute('href', profile.resumeUrl);
        cvLink.removeAttribute('onclick');
      }
    }
  }

  // ---- SKILLS ---------------------------------------------------------------
  function applySkills(skills) {
    if (!Array.isArray(skills) || !skills.length) return;

    // Radial meter: up to 5 featured skills.
    var radial = document.getElementById('radialMeter');
    var featured = skills.filter(function (s) { return s.featured; }).slice(0, 5);
    if (radial && featured.length) {
      radial.innerHTML = featured.map(function (s) {
        var pct = Math.max(0, Math.min(100, s.level || 0));
        var offset = (30 * 2 * Math.PI * (1 - pct / 100)).toFixed(1);
        return '<div class="radial-item"><div class="ring-wrap"><svg viewBox="0 0 64 64">' +
          '<circle class="bg-circle" cx="32" cy="32" r="30"/>' +
          '<circle class="progress-circle" cx="32" cy="32" r="30" style="--offset:' + offset + ';"/>' +
          '</svg><span class="center-label">' + pct + '%</span></div>' +
          '<span class="ring-icon"><i class="' + esc(s.icon || 'fas fa-star') + '" aria-hidden="true"></i></span>' +
          '<span class="ring-label">' + esc(s.name) + '</span></div>';
      }).join('');
    }

    // Category bars.
    var barsWrap = document.querySelector('.skill-bars-premium');
    if (barsWrap) {
      var byCategory = {};
      var order = [];
      skills.forEach(function (s) {
        var cat = s.category || 'Other';
        if (!byCategory[cat]) { byCategory[cat] = []; order.push(cat); }
        byCategory[cat].push(s);
      });
      barsWrap.innerHTML = order.map(function (cat) {
        var items = byCategory[cat];
        var rows = items.map(function (s) {
          var pct = Math.max(0, Math.min(100, s.level || 0));
          return '<div class="skill-row"><div class="skill-info"><span class="skill-name">' +
            '<i class="fas fa-check-circle" aria-hidden="true"></i> ' + esc(s.name) + '</span>' +
            '<span class="skill-pct">' + pct + '%</span></div>' +
            '<div class="skill-bar-track"><div class="skill-bar-fill" data-w="' + pct + '"></div></div></div>';
        }).join('');
        var icon = (items[0] && items[0].icon) || 'fas fa-layer-group';
        return '<div class="skill-category animated-border">' +
          '<div class="cat-header"><div class="cat-icon"><i class="' + esc(icon) + '" aria-hidden="true"></i></div>' +
          '<span class="cat-name">' + esc(cat) + '</span><span class="cat-count">' + items.length + '</span></div>' +
          rows + '</div>';
      }).join('');
    }

    // Tickers (two rows, same list, reversed for the second).
    var t1 = document.getElementById('ticker1');
    var t2 = document.getElementById('ticker2');
    var items = skills.map(function (s) {
      return '<span class="ticker-item"><i class="' + esc(s.icon || 'fas fa-check') + '" aria-hidden="true"></i> ' + esc(s.name) + '</span>';
    });
    if (t1 && items.length) t1.innerHTML = items.join('');
    if (t2 && items.length) t2.innerHTML = items.slice().reverse().join('');
  }

  // ---- Generic card grid renderer (projects/certs/experience/etc.) --------
  function renderGrid(gridId, items, renderItem) {
    var grid = document.getElementById(gridId);
    if (!grid || !Array.isArray(items) || !items.length) return;
    grid.innerHTML = items.map(function (item, i) {
      var delay = 'reveal-delay-' + ((i % 5) + 1);
      var hiddenClass = i >= 4 ? ' grid-hidden' : '';
      return renderItem(item, i, delay, hiddenClass);
    }).join('');
  }

  function imgOrPlaceholder(src, alt, iconClass, label) {
    if (!src) {
      return '<div class="img-placeholder"><i class="' + esc(iconClass) + '" aria-hidden="true"></i>' +
        '<span class="placeholder-label">' + esc(label) + '</span></div>';
    }
    return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async" width="600" height="375" ' +
      "onerror=\"this.parentElement.innerHTML='<div class=img-placeholder><i class=\\'" + esc(iconClass) + "\\'></i><span class=placeholder-label>" + esc(label) + "</span></div>'\">";
  }

  function applyProjects(projects) {
    renderGrid('projectsGrid', projects, function (p, i, delay, hidden) {
      var techs = (Array.isArray(p.technologies) ? p.technologies : [])
        .map(function (t, idx) { return '<span' + (idx === 0 ? ' class="accent-tag"' : '') + '>' + esc(t) + '</span>'; })
        .join('');
      return '<div class="project-card animated-border reveal ' + delay + hidden + '" data-index="' + i + '">' +
        '<div class="proj-img">' + imgOrPlaceholder(p.image, p.title, 'fas fa-diagram-project', p.title) + '</div>' +
        '<h3>' + esc(p.title) + '</h3><p>' + (p.shortDesc || '') + '</p>' +
        '<div class="proj-tags">' + techs + '</div>' +
        (p.githubUrl ? '<a href="' + esc(p.githubUrl) + '" target="_blank" rel="noopener noreferrer" class="proj-link"><i class="fab fa-github" aria-hidden="true"></i> View on GitHub</a>' : '') +
        (p.liveUrl ? '<a href="' + esc(p.liveUrl) + '" target="_blank" rel="noopener noreferrer" class="proj-link"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> Live Demo</a>' : '') +
        '</div>';
    });
  }

  function applyCertificates(certs) {
    renderGrid('certificatesGrid', certs, function (c, i, delay, hidden) {
      return '<div class="cert-card animated-border reveal ' + delay + hidden + '" data-index="' + i + '">' +
        '<div class="cert-img">' + imgOrPlaceholder(c.image, c.name, 'fas fa-award', c.name) + '</div>' +
        '<div class="cert-name">' + esc(c.name) + '</div>' +
        '<div class="cert-org">' + esc(c.organization) + '</div>' +
        '<span class="cert-date">' + esc(c.issueDate) + '</span>' +
        (c.credentialUrl ? '<a href="' + esc(c.credentialUrl) + '" target="_blank" rel="noopener noreferrer" class="proj-link"><i class="fas fa-external-link-alt" aria-hidden="true"></i> View Credential</a>' : '') +
        '</div>';
    });
  }

  function applyExperience(items) {
    renderGrid('experienceGrid', items, function (e, i, delay) {
      var techs = (Array.isArray(e.technologies) ? e.technologies : [])
        .map(function (t, idx) { return '<span' + (idx === 0 ? ' class="accent-tag"' : '') + '>' + esc(t) + '</span>'; })
        .join('');
      return '<div class="exp-card animated-border reveal ' + delay + '" data-index="' + i + '">' +
        '<div class="exp-header"><div class="exp-img">' + imgOrPlaceholder(e.logo, e.company, 'fas fa-briefcase', e.company) + '</div>' +
        '<div><div class="exp-title">' + esc(e.position) + '</div><div class="exp-company">' + esc(e.company) + '</div>' +
        '<div class="exp-date">' + esc(e.startDate) + ' – ' + esc(e.current ? 'Present' : e.endDate) + '</div></div></div>' +
        '<p class="exp-desc">' + esc(e.description) + '</p>' +
        '<div class="exp-tags">' + techs + '</div></div>';
    });
  }

  function applyEducation(items) {
    var grid = document.querySelector('.edu-grid');
    if (!grid || !Array.isArray(items) || !items.length) return;
    grid.innerHTML = items.map(function (e, i) {
      var delay = 'reveal-delay-' + ((i % 5) + 1);
      return '<div class="edu-card animated-border reveal ' + delay + '">' +
        '<div class="edu-img">' + imgOrPlaceholder(e.logo, e.institution, 'fas fa-university', e.institution) + '</div>' +
        '<h4>' + esc(e.degree) + '</h4><div class="edu-inst">' + esc(e.institution) + '</div>' +
        '<span class="edu-year">' + esc(e.startDate) + ' – ' + esc(e.endDate) + '</span></div>';
    }).join('');
  }

  function applyServices(items) {
    renderGrid('servicesGrid', items, function (s, i, delay, hidden) {
      return '<div class="service-card animated-border reveal ' + delay + hidden + '" data-index="' + i + '">' +
        '<div class="service-img">' + imgOrPlaceholder(s.image, s.name, s.icon || 'fas fa-concierge-bell', s.name) + '</div>' +
        '<h3>' + esc(s.name) + '</h3><p>' + esc(s.description) + '</p>' +
        (s.priceLabel ? '<span class="service-tag">' + esc(s.priceLabel) + '</span>' : '') + '</div>';
    });
  }

  function applyAchievements(items) {
    var grid = document.querySelector('.achievement-grid');
    if (!grid || !Array.isArray(items) || !items.length) return;
    grid.innerHTML = items.map(function (a) {
      return '<div class="achievement-card"><span class="ach-number" data-count="' + (a.number || 0) + '">0' +
        '<span class="ach-suffix">' + esc(a.suffix || '+') + '</span></span>' +
        '<span class="ach-label">' + esc(a.title) + '</span>' +
        '<div class="ach-icon"><i class="' + esc(a.icon || 'fas fa-trophy') + '" aria-hidden="true"></i></div></div>';
    }).join('');
  }

  function applyTestimonials(items) {
    var grid = document.querySelector('.testimonial-grid');
    if (!grid || !Array.isArray(items) || !items.length) return;
    grid.innerHTML = items.map(function (t) {
      var stars = '';
      for (var i = 0; i < 5; i++) {
        stars += '<i class="fas fa-star" aria-hidden="true" style="' + (i < (t.rating || 5) ? '' : 'opacity:.25;') + '"></i>';
      }
      return '<div class="testimonial-card animated-border"><div class="tc-stars">' + stars + '</div>' +
        '<p class="tc-text">"' + esc(t.text) + '"</p>' +
        '<div class="tc-author"><div class="tc-avatar">' +
        (t.image ? '<img src="' + esc(t.image) + '" alt="' + esc(t.name) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : '<i class="fas fa-user" aria-hidden="true"></i>') +
        '</div><div><div class="tc-name">' + esc(t.name) + '</div>' +
        '<div class="tc-role">' + esc(t.role) + (t.company ? ', ' + esc(t.company) : '') + '</div></div></div></div>';
    }).join('');
  }

  function applySocialAndContact(social, profile) {
    // Footer social icons.
    var footerSocial = document.querySelector('.footer-social');
    if (footerSocial && Array.isArray(social) && social.length) {
      footerSocial.innerHTML = social.map(function (s) {
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(s.platform) + '">' +
          '<i class="' + esc(s.icon || 'fas fa-link') + '" aria-hidden="true"></i></a>';
      }).join('');
    }

    if (!profile) return;

    // Contact section info items (GitHub/LinkedIn/WhatsApp/Location).
    var ciItems = document.querySelectorAll('#contact .ci-item');
    var github = (social || []).find(function (s) { return /github/i.test(s.platform); });
    var linkedin = (social || []).find(function (s) { return /linkedin/i.test(s.platform); });
    if (ciItems[0] && github) ciItems[0].querySelector('span').textContent = github.label || github.url;
    if (ciItems[1] && linkedin) ciItems[1].querySelector('span').textContent = linkedin.label || linkedin.url;
    if (ciItems[2] && profile.whatsapp) ciItems[2].querySelector('span').textContent = profile.whatsapp;
    if (ciItems[3] && profile.location) ciItems[3].querySelector('span').textContent = profile.location;

    var emailLink = document.querySelector('#contact a[href^="mailto:"]');
    if (emailLink && profile.email) emailLink.setAttribute('href', 'mailto:' + profile.email);

    var resumeLink = document.querySelector('#contact a[href$=".pdf"], #contact a[download]');
    if (resumeLink && profile.resumeUrl) resumeLink.setAttribute('href', profile.resumeUrl);
  }

  function applySeo(seo) {
    if (!seo) return;
    if (seo.siteTitle) document.title = seo.siteTitle;
    var setMeta = function (selector, attr, value) {
      if (!value) return;
      var el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', 'content', seo.metaDescription);
    setMeta('meta[property="og:title"]', 'content', seo.ogTitle);
    setMeta('meta[property="og:description"]', 'content', seo.ogDescription);
    setMeta('meta[property="og:image"]', 'content', seo.ogImage);
    setMeta('meta[name="twitter:title"]', 'content', seo.ogTitle);
    setMeta('meta[name="twitter:description"]', 'content', seo.ogDescription);
    setMeta('meta[name="twitter:image"]', 'content', seo.ogImage);
    setMeta('link[rel="canonical"]', 'href', seo.canonicalUrl);
  }

  function loadMainScript() {
    var s = document.createElement('script');
    s.src = 'js/main.js';
    document.body.appendChild(s);
  }

  function init() {
    withTimeout(
      fetch(ENDPOINT, { headers: { Accept: 'application/json' } }).then(function (r) {
        return r.ok ? r.json() : null;
      }).catch(function () { return null; }),
      TIMEOUT_MS
    ).then(function (data) {
      if (data) {
        try {
          applyHero(data.hero);
          applyAbout(data.about, data.profile);
          applySkills(data.skills);
          applyProjects(data.projects);
          applyCertificates(data.certificates);
          applyExperience(data.experience);
          applyEducation(data.education);
          applyServices(data.services);
          applyAchievements(data.achievements);
          applyTestimonials(data.testimonials);
          applySocialAndContact(data['social-links'], data.profile);
          applySeo(data.seo);
        } catch (err) {
          console.error('Content hydration error (falling back to static content):', err);
        }
      }
      loadMainScript();
    });
  }

  init();
})();
