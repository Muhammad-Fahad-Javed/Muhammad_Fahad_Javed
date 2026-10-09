/* ============================================================================
   CMS content loader.

   This file is loaded BEFORE js/main.js. It fetches /api/public/content and,
   if successful, rewrites the DOM of each CMS-managed section using the same
   CSS classes as the original hand-written markup (so every animation,
   IntersectionObserver, and style rule in main.js/style.css keeps working
   unchanged). If the request fails or times out, it does nothing and the
   static HTML that shipped with the page is shown instead.

   main.js is appended to the document only AFTER this finishes, so its
   querySelectorAll() calls always see the final, CMS-populated DOM.
   ========================================================================= */
(function () {
  'use strict';

  var ENDPOINT = '/api/public/content';
  // Worst-case delay before main.js (nav, animations) starts if the CMS is slow.
  // Was 6000ms. A healthy API answers in well under this.
  var TIMEOUT_MS = 1500;
  var CACHE_KEY = 'cms-content-v1';

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

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string') return null;
    hex = hex.trim();
    if (hex.charAt(0) === '#') hex = hex.substring(1);
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    if (hex.length !== 6) return null;
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  // ---- THEME & SITE SETTINGS ---------------------------------------------
  function applySiteSettings(settings) {
    if (!settings) return;
    var root = document.documentElement;

    if (settings.themeColor) {
      root.style.setProperty('--accent', settings.themeColor);
      root.style.setProperty('--accent-hero', settings.themeColor);
      var dim = hexToRgba(settings.themeColor, 0.08);
      var glow = hexToRgba(settings.themeColor, 0.14);
      var bdr = hexToRgba(settings.themeColor, 0.16);
      if (dim) root.style.setProperty('--accent-dim', dim);
      if (glow) {
        root.style.setProperty('--accent-glow', glow);
        root.style.setProperty('--shadow-glow', '0 10px 30px ' + glow);
      }
      if (bdr) root.style.setProperty('--accent-border', bdr);

      var metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute('content', settings.themeColor);
      var metaMs = document.querySelector('meta[name="msapplication-TileColor"]');
      if (metaMs) metaMs.setAttribute('content', settings.themeColor);
    }
    if (settings.primaryColor) {
      root.style.setProperty('--primary', settings.primaryColor);
    }
    if (settings.secondaryColor) {
      root.style.setProperty('--accent-hover', settings.secondaryColor);
    }
    if (settings.bgColor) {
      root.style.setProperty('--bg', settings.bgColor);
      root.style.setProperty('--nav-bg', settings.bgColor);
    }
    if (settings.surfaceColor) {
      root.style.setProperty('--bg-card', settings.surfaceColor);
      root.style.setProperty('--bg-secondary', settings.surfaceColor);
    }
    if (settings.textColor) {
      root.style.setProperty('--text', settings.textColor);
      root.style.setProperty('--heading', settings.textColor);
      var glass = hexToRgba(settings.textColor, 0.03);
      var bdrLight = hexToRgba(settings.textColor, 0.06);
      var gCore = hexToRgba(settings.textColor, 0.04);
      if (glass) root.style.setProperty('--bg-glass', glass);
      if (bdrLight) root.style.setProperty('--border-light', bdrLight);
      if (gCore) root.style.setProperty('--glass-core', gCore);
    }
    if (settings.textSecondaryColor) {
      root.style.setProperty('--text-secondary', settings.textSecondaryColor);
      root.style.setProperty('--nav-text', settings.textSecondaryColor);
    }
    if (settings.borderColor) {
      root.style.setProperty('--border', settings.borderColor);
      root.style.setProperty('--divider', settings.borderColor);
    }

    if (settings.footerText) {
      var copyEl = document.querySelector('.footer-copy');
      if (copyEl) {
        var yr = new Date().getFullYear();
        copyEl.innerHTML = '© ' + yr + ' <strong>' + esc(settings.footerText) + '</strong> — Built with purpose. Engineered for impact.';
      }
    }
  }

  // ---- HERO --------------------------------------------------------------
  function applyHero(hero, profile) {
    if (!hero && !profile) return;
    if (hero) {
      try {
        var roles = Array.isArray(hero.typedRoles) ? hero.typedRoles.filter(Boolean) : [];
        if (roles.length) window.__TYPED_ROLES__ = roles;
      } catch (e) { /* keep default */ }

      if (hero.name) {
        var nameOs = document.querySelector('.name-os');
        if (nameOs) {
          nameOs.innerHTML = esc(hero.name).replace(/\s+/g, '<br>');
        }
      }

      if (hero.statusText) {
        var otwText = document.querySelector('.otw-text');
        if (otwText) otwText.innerHTML = hero.statusText;
      }

      if (hero.ctaText && hero.ctaUrl) {
        var otwBtn = document.querySelector('.otw-btn');
        if (otwBtn) {
          otwBtn.textContent = hero.ctaText;
          otwBtn.setAttribute('href', hero.ctaUrl);
        }
      }
    }
  }

  // ---- ABOUT & PROFILE ---------------------------------------------------
  function applyAbout(about, profile) {
    if (!about && !profile) return;
    var wrap = document.querySelector('.hero-about-text');

    if (about && wrap) {
      var greeting = wrap.querySelector('.greeting');
      if (greeting && about.greeting) greeting.textContent = about.greeting;

      var heading = wrap.querySelector('h2');
      if (heading && about.heading) {
        if (about.heading.indexOf('<') !== -1) {
          heading.innerHTML = about.heading;
        } else if (about.heading.indexOf('&') !== -1) {
          var parts = about.heading.split('&');
          heading.innerHTML = esc(parts[0]) + '<span class="highlight">&amp; ' + esc(parts.slice(1).join('&').trim()) + '</span>';
        } else {
          heading.textContent = about.heading;
        }
      }

      var paragraphs = Array.isArray(about.paragraphs) ? about.paragraphs : [];
      if (paragraphs.length) {
        var existingPs = wrap.querySelectorAll('p');
        existingPs.forEach(function (p) { p.remove(); });
        var tagsDiv = wrap.querySelector('.hero-about-tags');
        paragraphs.forEach(function (html) {
          var p = document.createElement('p');
          p.innerHTML = html == null ? '' : String(html);
          if (tagsDiv) {
            wrap.insertBefore(p, tagsDiv);
          } else {
            wrap.appendChild(p);
          }
        });
      }

      var tags = Array.isArray(about.tags) ? about.tags : [];
      var tagsWrap = wrap.querySelector('.hero-about-tags');
      if (tagsWrap && tags.length) {
        tagsWrap.innerHTML = tags.map(function (t, i) {
          var cls = i === 0 ? ' class="tag-primary"' : '';
          var icon = (typeof t === 'object' && t && t.icon) ? t.icon : 'fas fa-star';
          var label = (typeof t === 'object' && t && t.label) ? t.label : String(t || '');
          return '<span' + cls + '><i class="' + esc(icon) + '" aria-hidden="true"></i> ' + esc(label) + '</span>';
        }).join('');
      }
    }

    var avatarImg = document.querySelector('.hero-avatar img');
    var avatarSrc = (profile && profile.profileImage) || (about && about.image);
    // Older databases were seeded with the 1200x630 social banner as the
    // "profile image". It is not a portrait, so treat it as unset.
    if (avatarSrc && /\/images\/og-image\.jpg$/.test(avatarSrc)) avatarSrc = '';
    if (avatarImg && avatarSrc) {
      var previous = avatarImg.getAttribute('src');
      avatarImg.onerror = function () {
        // Keep the previous working image instead of showing a broken one.
        this.onerror = null;
        if (previous && previous !== avatarSrc) this.src = previous;
        else this.style.visibility = 'hidden';
      };
      avatarImg.src = avatarSrc;
    }
  }

  // ---- CV / RESUME SYNCHRONIZATION ---------------------------------------
  function applyResume(profile) {
    if (!profile || !profile.resumeUrl) return;

    // Cache buster using updatedAt timestamp or current time
    var timestamp = profile.updatedAt ? new Date(profile.updatedAt).getTime() : Date.now();
    var versionedUrl = profile.resumeUrl + (profile.resumeUrl.indexOf('?') === -1 ? '?v=' : '&v=') + timestamp;

    var cvSelectors = [
      '.nav-cv-btn',
      '.hero-about-text a.btn-ghost',
      '#resume a.btn-glow',
      '#resume a.btn-ghost',
      '#contact a.btn-glow',
      'a[download]'
    ];

    cvSelectors.forEach(function(selector) {
      var els = document.querySelectorAll(selector);
      els.forEach(function(el) {
        var text = el.textContent.toLowerCase();
        var href = el.getAttribute('href') || '';
        if (selector === 'a[download]' || text.indexOf('cv') !== -1 || text.indexOf('resume') !== -1 || href.indexOf('.pdf') !== -1 || href.indexOf('javascript:alert') !== -1) {
          el.setAttribute('href', versionedUrl);
          el.removeAttribute('onclick');
        }
      });
    });
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

    // Tickers.
    var t1 = document.getElementById('ticker1');
    var t2 = document.getElementById('ticker2');
    var items = skills.map(function (s) {
      return '<span class="ticker-item"><i class="' + esc(s.icon || 'fas fa-check') + '" aria-hidden="true"></i> ' + esc(s.name) + '</span>';
    });
    if (t1 && items.length) t1.innerHTML = items.join('');
    if (t2 && items.length) t2.innerHTML = items.slice().reverse().join('');
  }

  // ---- Generic card grid renderer -------------------------------------------
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
      "onerror=\"this.onerror=null;this.parentElement.innerHTML='<div class=img-placeholder><i class=\\'" + esc(iconClass) + "\\'></i><span class=placeholder-label>" + esc(label) + "</span></div>'\">";
  }

  function applyProjects(projects) {
    renderGrid('projectsGrid', projects, function (p, i, delay, hidden) {
      var techs = (Array.isArray(p.technologies) ? p.technologies : [])
        .map(function (t, idx) { return '<span' + (idx === 0 ? ' class="accent-tag"' : '') + '>' + esc(t) + '</span>'; })
        .join('');
      return '<div class="project-card animated-border reveal ' + delay + hidden + '" data-index="' + i + '">' +
        '<div class="proj-img">' + imgOrPlaceholder(p.image, p.title, 'fas fa-diagram-project', p.title) + '</div>' +
        '<h3>' + esc(p.title) + '</h3><p>' + esc(p.shortDesc || '') + '</p>' +
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

    // Contact section info items.
    var ciItems = document.querySelectorAll('#contact .ci-item');
    var github = (social || []).find(function (s) { return /github/i.test(s.platform); });
    var linkedin = (social || []).find(function (s) { return /linkedin/i.test(s.platform); });
    if (ciItems[0] && github) {
      var span0 = ciItems[0].querySelector('span');
      if (span0) span0.textContent = github.label || github.url;
    }
    if (ciItems[1] && linkedin) {
      var span1 = ciItems[1].querySelector('span');
      if (span1) span1.textContent = linkedin.label || linkedin.url;
    }
    if (ciItems[2] && profile.whatsapp) {
      var span2 = ciItems[2].querySelector('span');
      if (span2) span2.textContent = profile.whatsapp;
      var waLink = ciItems[2].querySelector('a');
      if (waLink) waLink.setAttribute('href', 'https://wa.me/' + profile.whatsapp.replace(/[^0-9]/g, ''));
    }
    if (ciItems[3] && profile.location) {
      var span3 = ciItems[3].querySelector('span');
      if (span3) span3.textContent = profile.location;
    }

    var emailLinks = document.querySelectorAll('a[href^="mailto:"]');
    if (profile.email) {
      emailLinks.forEach(function(link) {
        link.setAttribute('href', 'mailto:' + profile.email);
      });
    }
  }

  // SEO (title, description, canonical, Open Graph, Twitter) is written into the
  // initial HTML at build time by scripts/inject-seo.js. It is deliberately NOT
  // patched here: crawlers/social bots don't reliably run JS, and a stale
  // database value must never override the HTML they actually read.

  function loadMainScript() {
    if (window.__MAIN_SCRIPT_LOADED__) return;
    window.__MAIN_SCRIPT_LOADED__ = true;
    var s = document.createElement('script');
    s.src = 'js/main.js';
    document.body.appendChild(s);
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }

  function hydrate(data) {
    var safeApply = function (fn, name, arg1, arg2) {
      try { fn(arg1, arg2); } catch (err) { console.error('[CMS Loader] Error in section "' + name + '":', err); }
    };
    safeApply(applySiteSettings, 'siteSettings', data['site-settings']);
    safeApply(applyHero, 'hero', data.hero, data.profile);
    safeApply(applyAbout, 'about', data.about, data.profile);
    safeApply(applyResume, 'resume', data.profile);
    safeApply(applySkills, 'skills', data.skills);
    safeApply(applyProjects, 'projects', data.projects);
    safeApply(applyCertificates, 'certificates', data.certificates);
    safeApply(applyExperience, 'experience', data.experience);
    safeApply(applyEducation, 'education', data.education);
    safeApply(applyServices, 'services', data.services);
    safeApply(applyAchievements, 'achievements', data.achievements);
    safeApply(applyTestimonials, 'testimonials', data.testimonials);
    safeApply(applySocialAndContact, 'socialAndContact', data['social-links'], data.profile);
  }

  function init() {
    var settled = false;      // true once we've decided what to render
    var timedOut = false;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;

    var request = fetch(ENDPOINT, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function (err) { console.warn('[CMS Loader] Fetch failed:', err && err.message); return null; });

    function finish(data, fromCache) {
      if (settled) return;
      settled = true;
      if (data) {
        hydrate(data);
        if (!fromCache) writeCache(data);
      }
      loadMainScript();   // always runs, with or without CMS data
    }

    var timer = setTimeout(function () {
      timedOut = true;
      // Slow/failed CMS: use last known-good content if we have it, else the
      // static HTML that shipped with the page. Never block the site on the CMS.
      finish(readCache(), true);
    }, TIMEOUT_MS);

    request.then(function (data) {
      clearTimeout(timer);
      if (timedOut && data) {
        // Arrived after the page was already interactive. Applying it now would
        // replace nodes main.js has already bound handlers to, so just cache it
        // for the next visit.
        writeCache(data);
        return;
      }
      finish(data || readCache(), !data);
    }).catch(function (err) {
      console.error('[CMS Loader] Unexpected error in init:', err);
      clearTimeout(timer);
      finish(null, true);
    });
  }

  init();
})();
