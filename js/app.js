/* 
 * UNIVERSAL ENTERPRISE PARTSCOMPARE & SOURCING INTELLIGENCE PLATFORM
 * Main UI Application Controller & Routing Engine
 * Interfaces with window.PC_API (adapter.js) and window.PC_AI (ai.js)
 */
(function () {
  const API = window.PC_API;
  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $who = document.getElementById('who');
  const $themeToggle = document.getElementById('theme-toggle');

  let me = null;
  let ed = null;   // list editor state
  let cmp = null;  // comparison page state
  let offerForm = null; // catalog offer form state
  let catalogFilter = 'ALL'; // active filter state
  let catalogSupplierFilter = 'ALL'; // active supplier filter state
  let parsedAiRows = []; // parsed AI CSV lines state

  // Dynamic Enterprise Business Profile Cache
  let companyProfile = {
    id: 1,
    business_name: 'AMGC Airconditioning Services',
    business_type: 'Commercial & Industrial HVAC Services',
    location: 'V.V. Soliven Ave. II, Cainta, Rizal, Philippines',
    currency_code: 'PHP',
    currency_symbol: '₱',
    max_quote_age_days: 14,
    mcda_cost_weight: 40,
    mcda_stock_weight: 30,
    mcda_freshness_weight: 20,
    mcda_consolidation_weight: 10
  };

  /* ---------------- Safe Theme Initializer ---------------- */
  try {
    const savedTheme = localStorage.getItem('pc_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    if ($themeToggle) {
      $themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
      $themeToggle.onclick = function () {
        const cur = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        localStorage.setItem('pc_theme', next);
        $themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
      };
    }
  } catch (err) {
    console.error('Theme toggle init error:', err);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (minor, cur) => {
    const currencyStr = cur || (companyProfile && companyProfile.currency_code) || 'PHP';
    return minor == null ? 'Not available'
      : esc(currencyStr) + ' ' + (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const computeVat = (minor) => {
    if (minor == null) return { net: null, vat: null, gross: null };
    const gross = minor;
    const net = Math.round(gross / 1.12);
    const vat = gross - net;
    return { net, vat, gross };
  };
  const fmtDate = (d) => d ? esc(d) : 'Not recorded';
  const fmtTime = (iso) => new Date(iso).toLocaleString();

  const REASONS = {
    MISSING_DATA: 'Missing price, quantity, date or source',
    INACTIVE: 'Offer or part is inactive',
    UNIT_MISMATCH: 'Unit does not match',
    CURRENCY_MISMATCH: 'Currency does not match the policy',
    PRICE_BASIS_MISMATCH: 'Price is not per single piece',
    FUTURE_DATE: 'Checked date is in the future',
    STALE: 'Checked date is older than the freshness limit',
    INSUFFICIENT_QUANTITY: 'Recorded quantity is below the quantity needed',
  };
  const UNRESOLVED = {
    NO_RECORDED_OFFER: 'No offer recorded for this part',
    NO_ELIGIBLE_OFFER: 'No eligible offer from accredited suppliers',
    NO_SELECTION: 'Eligible offers exist. Choose one.',
  };
  const badge = (cls, text) => '<span class="badge ' + cls + '">' + text + '</span>';
  const alertBox = (cls, html, role) => '<div class="alert ' + cls + '"' + (role ? ' role="' + role + '"' : '') + '><div>' + html + '</div></div>';
  const fe = (errors, key, id) => errors && errors[key] ? '<div class="err" id="' + id + '">' + esc(errors[key]) + '</div>' : '';

  function go(hash) { 
    if (location.hash === hash) route(); 
    else location.hash = hash; 
  }

  function isAdminUser() {
    return me && (me.role === 'admin' || me.role === 'administrator');
  }

  /* ---------- MODULE 1: DYNAMIC BRANDING & SHELL ---------- */
  function applyBranding(p) {
    if (!p) return;
    companyProfile = Object.assign({}, companyProfile, p);

    // 1. Update <title>
    document.title = `${esc(companyProfile.business_name)} — PartsCompare Enterprise`;

    // 2. Update Top Bar Brand Banner
    const banner = document.querySelector('.banner');
    if (banner) {
      banner.innerHTML = `${esc(companyProfile.business_name)} &bull; ${esc(companyProfile.business_type)} &bull; Sourcing Intelligence &amp; BOM Comparison`;
    }

    // 3. Update Footer Brand Text & Location (using &bull; for bullet separators)
    const footBrandDesc = document.querySelector('.foot-brand-col p');
    if (footBrandDesc) {
      footBrandDesc.innerHTML = `Universal Bill of Materials Comparison System using curated supplier quotations. Configured for <strong>${esc(companyProfile.business_name)}</strong> &bull; ${esc(companyProfile.location)}.`;
    }

    const footContactLoc = document.getElementById('footerLocationText');
    if (footContactLoc) {
      footContactLoc.textContent = companyProfile.location;
    }

    const footBottom = document.querySelector('.foot-pro-bottom-in span');
    if (footBottom) {
      footBottom.innerHTML = `&copy; 2026 PartsCompare &bull; Project Nexus (CEDT) &bull; ${esc(companyProfile.business_name)}.`;
    }

    // 4. Update Landing Page Hero Pill
    const heroPill = document.getElementById('heroCompanyPill');
    if (heroPill) {
      heroPill.textContent = `${companyProfile.business_name} • ${companyProfile.location}`;
    }
  }

  async function loadInitialCompanyProfile() {
    try {
      if (API.getCompanyProfile) {
        const p = await API.getCompanyProfile();
        if (p) applyBranding(p);
      }
    } catch (e) {
      console.warn('Initial company profile fetch error:', e);
    }
  }

  const SECURITY_QUESTIONS = [
    'What city or municipality were you born in?',
    'What was the name of your first elementary school?',
    'What is your mother\'s maiden name?',
    'What was the name of your first pet?',
    'What is your employee ID badge or favorite HVAC tool?'
  ];

  let fpState = null; // forgot password modal state

  let landing = false;
  function renderShell() {
    document.body.classList.toggle('landing', landing);
    if (!me) {
      const curHash = location.hash || '#/';
      $nav.innerHTML = [
        ['how', 'How it works'],
        ['try', 'Interactive Simulator'],
        ['#/about', 'About System'],
        ['#/faqs', 'FAQs']
      ].map(([t, l]) => t.startsWith('#')
        ? '<a href="' + t + '"' + (curHash === t ? ' aria-current="page"' : '') + '>' + l + '</a>'
        : '<button type="button" class="navbtn" data-action="scroll" data-target="' + t + '">' + l + '</button>'
      ).join('');
      $who.innerHTML = '<a class="btn primary" href="#/login" data-action="open-login" style="font-weight:700;">🔑 Sign In / Staff Portal</a>';
      return;
    }
    const links = [];
    if (me) {
      if (isAdminUser()) {
        links.push(['#/', 'Administration Console']);
      }
      if (me.capabilities && me.capabilities.includes('lists')) {
        links.push(['#/lists', 'Preparer Workspace'], ['#/summaries', 'Saved Summaries']);
      }
      if (me.capabilities && me.capabilities.includes('catalog')) {
        links.push(['#/catalog', 'Offer Catalog']);
      }
    }
    const cur = location.hash || '#/';
    $nav.innerHTML = links.map(([h, t]) => '<a href="' + h + '"' + (cur === h || (h === '#/lists' && cur.startsWith('#/compare')) ? ' aria-current="page"' : '') + '>' + t + '</a>').join('');
    $who.innerHTML = me ? '<span class="pill">' + esc(me.name) + ' (' + esc(me.role) + ')</span><button type="button" class="btn" style="padding:0 10px; font-size:12.5px;" data-action="open-my-security-modal" title="Manage 6-Digit Recovery PIN &amp; Security Question">🛡️ Recovery PIN</button><button type="button" data-action="logout">Sign out</button>' : '';
  }

  function setMain(html, preserveScroll = false) { 
    const prevY = preserveScroll ? (window.pageYOffset || document.documentElement.scrollTop || window.scrollY || 0) : 0;
    landing = false; 
    $app.innerHTML = html; 
    renderShell(); 
    applyBranding(companyProfile);
    if (preserveScroll) {
      window.scrollTo(0, prevY);
      requestAnimationFrame(() => {
        window.scrollTo(0, prevY);
      });
    } else {
      window.scrollTo(0, 0); 
    }
  }

  function loading(msg) { 
    setMain('<div class="card stack"><div class="row" style="align-items:center;gap:12px"><div class="spinner" aria-hidden="true"></div><span>' + esc(msg || 'Loading...') + '</span></div></div>'); 
  }

  function errorPage(e) {
    setMain('<div class="card stack"><h1>Something went wrong</h1>' 
      + alertBox('bad', '<strong>' + esc(e.code || 'ERROR') + '</strong>: ' + esc(e.message || 'An unexpected error occurred.'), 'alert') 
      + '<div><a class="btn" href="#/">Back to start</a></div></div>');
  }

  /* ---------- DEDICATED PAGE: ABOUT US ---------- */
  function pageAbout() {
    removeExistingModal();
    setMain(
      '<div class="page-container">' +
        '<div class="row between" style="align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">' +
          '<a class="btn" href="#/">← Back to Home / Sourcing Platform</a>' +
          '<div class="row" style="gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="btn" data-action="scroll" data-target="try">🎮 Interactive Simulator</button>' +
            '<button type="button" class="btn" data-action="scroll" data-target="how">📖 How It Works</button>' +
            '<a class="btn primary" href="#/login">🔑 Sign In to Portal</a>' +
          '</div>' +
        '</div>' +

        '<div class="page-hero-banner">' +
          '<div>' +
            '<div class="pill" style="margin-bottom:8px;background:rgba(45,212,191,0.15);color:#0D9488;border:1px solid rgba(45,212,191,0.3);font-weight:600">Enterprise Decision-Support System &middot; Project Nexus</div>' +
            '<h1>About PartsCompare &amp; ' + esc(companyProfile.business_name) + '</h1>' +
            '<p class="sub">A universal Bill of Materials comparison system powered by verified supplier quotations, reproducible eligibility rules, and immutable sourcing summaries.</p>' +
          '</div>' +
        '</div>' +

        '<div class="grid2" style="margin-top:20px;">' +
          '<div class="card stack">' +
            '<h2>Enterprise Sourcing Foundation</h2>' +
            '<p class="small" style="line-height:1.7;">' +
              'Tailored for <strong>' + esc(companyProfile.business_name) + '</strong> (' + esc(companyProfile.location) + '), this system eliminates informal unstandardized phone quotes, scattered messaging receipts, and inaccurate spreadsheets. ' +
              'Project Nexus provides exact-part cataloging, configurable freshness thresholds, dynamic Multi-Criteria Decision Analysis (MCDA), and immutable sourcing snapshots.' +
            '</p>' +
            '<div class="row" style="gap:10px;margin-top:8px;">' +
              '<span class="badge ok">✓ Active Business Profile</span>' +
              '<span class="badge gray">' + esc(companyProfile.business_type) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="card stack">' +
            '<h2>Accredited Suppliers</h2>' +
            '<p class="small" style="line-height:1.7;">' +
              'Quotations are curated from verified, accredited supplier depots with recorded check dates and verifiable invoice references:' +
            '</p>' +
            '<ul class="small" style="margin:0;padding-left:18px;line-height:1.6;">' +
              '<li><strong>Everwell Parts &amp; Equipment Corp.:</strong> Direct importer of OEM capacitors, fan motors, and universal control kits.</li>' +
              '<li><strong>C&amp;C Airconditioning Supply:</strong> Major wholesaler of heavy-duty contactors, sealed R410A refrigerants, and thermistors.</li>' +
              '<li><strong>Manco Refrigeration Supply:</strong> Specialized refrigeration depot for commercial HVAC valves and sensor probes.</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +

        '<div class="card stack" style="margin-top:24px;text-align:center;padding:24px;background:var(--card-subtle);">' +
          '<h3 style="margin:0 0 6px;">Ready to evaluate supplier quotations?</h3>' +
          '<p class="small" style="color:var(--mute);margin:0 0 16px;">Test component pricing rules in real-time or sign into your role workspace.</p>' +
          '<div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap;">' +
            '<button type="button" class="btn primary" data-action="scroll" data-target="try">🎮 Launch Interactive Simulator</button>' +
            '<button type="button" class="btn" data-action="scroll" data-target="how">📖 How It Works</button>' +
            '<a class="btn" href="#/faqs">❓ Frequently Asked Questions</a>' +
            '<a class="btn primary" href="#/login">🔑 Sign In to Workspace</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------- DEDICATED PAGE: FAQS ---------- */
  function pageFaqs() {
    removeExistingModal();
    const faqData = [
      {
        q: 'What makes a supplier offer "Eligible" for a Bill of Materials line?',
        a: 'An offer is eligible only when it satisfies all policy criteria: it must match the exact part identifier, possess complete unit pricing and stock data, be dated within the agreed freshness window, and have a recorded quantity equal to or greater than the line requirement.'
      },
      {
        q: 'Why are unresolved parts not counted as zero (₱0.00)?',
        a: 'In engineering procurement, treating an uncosted part as ₱0.00 creates dangerous budget deficits. PartsCompare omits uncosted lines from the subtotal and clearly flags the summary as partial until an accredited supplier is selected.'
      },
      {
        q: 'What is the Quote Validity & Freshness Policy?',
        a: 'Supplier quotes older than the configured age limit (e.g. 14 days) are marked as "Stale" and excluded from automatic selection to prevent cost overruns from market fluctuations.'
      },
      {
        q: 'How is Philippine 12% Value Added Tax (VAT) computed?',
        a: 'PartsCompare supports official BIR 12% VAT auditing. Quotations can be viewed in Dual Mode (showing both VAT-Inclusive and Net of VAT), Gross mode (12% tax included), or Net mode (excl. 12% VAT), with explicit output tax itemization.'
      },
      {
        q: 'How does the Dynamic MCDA Procurement Engine work?',
        a: 'The Multi-Criteria Decision Analysis engine dynamically ranks offers based on 4 configurable enterprise weights: Lowest Unit Cost (default 40%), Stock Buffer Ratio (default 30%), Quote Freshness (default 20%), and Supplier Consolidation (default 10%).'
      },
      {
        q: 'How does Supabase Cloud integration work?',
        a: 'The system synchronizes enterprise profile settings, catalog offers, BOM lists, and frozen summaries to Supabase PostgreSQL (https://xahcgiwwyaskazgbgejh.supabase.co) while maintaining instantaneous local-first caching.'
      },
      {
        q: 'How do I register a new supplier and upload their designated catalog price list?',
        a: '<strong>Step 1: Register Supplier:</strong> In the Administration Console (<code>#/</code>), scroll to <em>Accredited Supplier Network &amp; Vendor Directory</em> and click <code>+ Add Accredited Supplier</code>.<br><strong>Step 2: Attribute Catalog Offers:</strong> In <em>Offer Catalog Workspace</em> (<code>#/catalog</code>), click <code>CSV Template</code> to download the official format. Fill in your prices and place the exact registered supplier name in the <code>source</code> column (or click <code>+ Add New Offer</code> to select them from the dropdown).<br><strong>Step 3: View Designated Catalog:</strong> Use the <code>Filter by Supplier</code> dropdown in the Offer Catalog or click <code>📦 View Catalog</code> on the supplier\'s directory row to isolate and audit that vendor\'s price list.'
      }
    ];

    setMain(
      '<div class="page-container">' +
        '<div class="row between" style="align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">' +
          '<a class="btn" href="#/">← Back to Home / Sourcing Platform</a>' +
          '<div class="row" style="gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="btn" data-action="scroll" data-target="try">🎮 Interactive Simulator</button>' +
            '<button type="button" class="btn" data-action="scroll" data-target="how">📖 How It Works</button>' +
            '<a class="btn primary" href="#/login">🔑 Sign In to Portal</a>' +
          '</div>' +
        '</div>' +

        '<div class="page-hero-banner">' +
          '<h1>Frequently Asked Questions</h1>' +
          '<p class="sub">Auditing standards, eligibility rules, and enterprise governance principles.</p>' +
        '</div>' +
        '<div class="stack" style="gap:14px;margin-top:20px;">' +
          faqData.map(f => '<div class="card stack"><h3 style="font-size:16px;margin:0 0 6px;">' + esc(f.q) + '</h3><p class="small" style="line-height:1.6;color:var(--ink);margin:0;">' + esc(f.a) + '</p></div>').join('') +
        '</div>' +

        '<div class="card stack" style="margin-top:24px;text-align:center;padding:24px;background:var(--card-subtle);">' +
          '<h3 style="margin:0 0 6px;">Have more questions about our sourcing workflow?</h3>' +
          '<p class="small" style="color:var(--mute);margin:0 0 16px;">Test component pricing rules in real-time or contact our administration team.</p>' +
          '<div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap;">' +
            '<button type="button" class="btn primary" data-action="scroll" data-target="try">🎮 Launch Interactive Simulator</button>' +
            '<button type="button" class="btn" data-action="scroll" data-target="how">📖 How It Works</button>' +
            '<a class="btn" href="#/about">🏛️ About Project Nexus</a>' +
            '<a class="btn primary" href="#/login">🔑 Sign In to Workspace</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------- LOGIN SLIDER ---------- */
  function pageLogin(err, username) {
    removeExistingModal();
    setMain(
      '<div class="login-slider-container" id="loginSlider">' +
        '<div class="form-panel signin-panel">' +
          '<div class="form-panel-inner stack">' +
            '<h1 style="font-size: 28px; font-weight: 700;">Sign in</h1>' +
            '<p class="sub" style="margin-bottom: 4px;">Access ' + esc(companyProfile.business_name) + ' BOM comparison lists.</p>' +
            (err ? alertBox('bad', esc(err), 'alert') : '') +
            '<form id="login" class="stack" novalidate style="margin-top: 4px;">' +
              '<div><label for="u">Username</label><input id="u" name="u" autocomplete="username" placeholder="dave_pm, pearl_dba, karen_admin" value="' + esc(username || '') + '" required></div>' +
              '<div>' +
                '<div class="row between" style="align-items:baseline;">' +
                  '<label for="p" style="margin-bottom:4px;">Password</label>' +
                  '<button type="button" class="navbtn-link" data-action="open-forgot-password" style="background:none;border:none;padding:0;height:auto;font-size:12.5px;color:var(--teal);font-weight:600;cursor:pointer;">Forgot password?</button>' +
                '</div>' +
                '<input id="p" name="p" type="password" autocomplete="current-password" placeholder="••••••••" value="demo" required>' +
              '</div>' +
              '<button class="primary" type="submit" style="margin-top: 4px; height: 46px; font-size: 15px;">Sign in</button>' +
              '<button type="button" class="btn mobile-only-auth-btn" id="mobileRequestAccountBtn" style="font-size: 13px; width: 100%;">Request New Account →</button>' +
            '</form>' +
            '<div class="stack" style="margin-top: 14px;">' +
              '<div class="small" style="font-weight: 600;">Or quick-start with authorized staff credentials:</div>' +
              '<div class="row" style="gap: 8px; flex-wrap:wrap;">' +
                '<button type="button" class="btn" style="flex: 1; min-width: 130px; font-size: 12.5px;" data-action="quick-login" data-u="dave_pm">👤 Dave (Preparer)</button>' +
                '<button type="button" class="btn" style="flex: 1; min-width: 130px; font-size: 12.5px;" data-action="quick-login" data-u="pearl_dba">🔧 Pearl (Maintainer)</button>' +
                '<button type="button" class="btn" style="flex: 1; min-width: 130px; font-size: 12.5px;" data-action="quick-login" data-u="karen_admin">⚙️ Karen (Admin)</button>' +
              '</div>' +
            '</div>' +
            '<div style="margin-top: 10px;">' + alertBox('info', 'Default demo password: <span class="mono">demo</span>') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="form-panel signup-panel">' +
          '<div class="form-panel-inner stack" style="gap: 8px;">' +
            '<div>' +
              '<h1 style="font-size: 24px; font-weight: 700; margin: 0 0 2px;">New Account</h1>' +
              '<p class="sub" style="margin: 0;">Request credentials from the system administrator.</p>' +
            '</div>' +
            '<div class="signup-tabs" role="tablist" aria-label="Account Registration Steps">' +
              '<button type="button" class="signup-tab-btn active" id="signup-tab-1" role="tab" aria-selected="true">1. Account Details</button>' +
              '<button type="button" class="signup-tab-btn" id="signup-tab-2" role="tab" aria-selected="false">2. Security PIN &amp; Question</button>' +
            '</div>' +
            '<div id="signup-alert-box"></div>' +
            '<form id="signup-request" class="stack" novalidate style="gap: 8px;">' +
              '<div id="signup-step-1" class="stack" style="gap: 8px;">' +
                '<div><label for="req-name" style="font-size:12.5px; font-weight:600;">Full Name</label><input id="req-name" placeholder="Enter staff name (e.g. Engr. Marco Santos)"></div>' +
                '<div><label for="req-user" style="font-size:12.5px; font-weight:600;">Desired Username</label><input id="req-user" placeholder="Enter desired username (e.g. marco_hvac)"></div>' +
                '<div><label for="req-role" style="font-size:12.5px; font-weight:600;">Requested Role</label>' +
                  '<select id="req-role">' +
                    '<option value="preparer">Preparer / Field Technician (BOM Maker)</option>' +
                    '<option value="maintainer">Catalog Maintainer (Quotes &amp; Suppliers)</option>' +
                  '</select>' +
                '</div>' +
                '<div class="signup-pass-grid">' +
                  '<div><label for="req-pass" style="font-size:12.5px; font-weight:600;">Set Account Password</label><input id="req-pass" type="password" placeholder="Min 4 chars"></div>' +
                  '<div><label for="req-pass-confirm" style="font-size:12.5px; font-weight:600;">Confirm Password</label><input id="req-pass-confirm" type="password" placeholder="Re-type password"></div>' +
                '</div>' +
                '<button class="primary" type="button" id="btn-next-signup-step" style="margin-top: 2px; height: 42px; font-size: 14px;">Next: Security PIN &amp; Question →</button>' +
                '<button type="button" class="btn mobile-only-auth-btn" id="mobileBackToSignIn" style="margin-top: 2px; font-size: 13px; width: 100%;">← Back to Sign In</button>' +
              '</div>' +

              '<div id="signup-step-2" class="stack" style="gap: 8px; display: none;">' +
                '<div class="small" style="padding: 8px 10px; border-radius: 8px; background: rgba(45, 212, 191, 0.1); border: 1px solid rgba(45, 212, 191, 0.28); color: var(--ink); line-height: 1.4;">' +
                  '🛡️ <strong>Anti-Impostor Protection:</strong> Your 6-digit PIN and Security Question verify your identity before any password reset request is accepted.' +
                '</div>' +
                '<div>' +
                  '<label for="req-pin" style="font-size:12.5px; font-weight:600;">6-Digit Security PIN</label>' +
                  '<input id="req-pin" type="password" inputmode="numeric" maxlength="6" class="pin-input-mono" placeholder="••••••">' +
                  '<div class="small" style="color:var(--mute); font-size:11.5px; margin-top:2px;">Exactly 6 digits (0–9). Avoid simple sequences like 123456 or 000000.</div>' +
                '</div>' +
                '<div>' +
                  '<label for="req-sec-q" style="font-size:12.5px; font-weight:600;">Unique Security Question</label>' +
                  '<select id="req-sec-q">' +
                    SECURITY_QUESTIONS.map(q => '<option value="' + esc(q) + '">' + esc(q) + '</option>').join('') +
                  '</select>' +
                '</div>' +
                '<div>' +
                  '<label for="req-sec-a" style="font-size:12.5px; font-weight:600;">Secret Answer</label>' +
                  '<input id="req-sec-a" type="text" placeholder="Enter memorable answer (case-insensitive)">' +
                '</div>' +
                '<div class="row" style="gap: 8px; margin-top: 2px;">' +
                  '<button type="button" class="btn" id="btn-prev-signup-step" style="height: 42px; padding: 0 14px;">← Back</button>' +
                  '<button class="primary" type="submit" id="btn-submit-signup" style="flex: 1; height: 42px; font-size: 14px;">Submit Account Request</button>' +
                '</div>' +
              '</div>' +
            '</form>' +
            '<div style="margin-top: 2px;">' + alertBox('warn', 'Public signup is restricted per enterprise governance. Accounts require administrative setup.') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="overlay-panel-container">' +
          '<div class="overlay-panel">' +
            '<div class="overlay-circuit-bg">' + window.PC_ART.circuit() + '</div>' +
            '<div class="overlay-content overlay-left">' +
              '<div class="overlay-chip-art">' + window.PC_ART.chip('#0B3C43', '#7CD3CF') + '</div>' +
              '<h2>Already registered?</h2>' +
              '<p>Sign in to open and compare component parts lists and supplier offers.</p>' +
              '<button type="button" class="btn ghost" id="signInBtn">Back to Sign in</button>' +
            '</div>' +
            '<div class="overlay-content overlay-right">' +
              '<div class="overlay-chip-art">' + window.PC_ART.chip('#0B3C43', '#7CD3CF') + '</div>' +
              '<h2>' + esc(companyProfile.business_name) + '</h2>' +
              '<p>Need access or new account credentials? Submit an authorized staff provisioning request.</p>' +
              '<button type="button" class="btn ghost" id="signUpBtn">Request Account</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    const container = document.getElementById('loginSlider');
    const signUpBtn = document.getElementById('signUpBtn');
    const signInBtn = document.getElementById('signInBtn');
    const backBtn = document.getElementById('mobileBackToSignIn');
    const mobReqBtn = document.getElementById('mobileRequestAccountBtn');
    const tab1Btn = document.getElementById('signup-tab-1');
    const tab2Btn = document.getElementById('signup-tab-2');
    const step1El = document.getElementById('signup-step-1');
    const step2El = document.getElementById('signup-step-2');
    const nextStepBtn = document.getElementById('btn-next-signup-step');
    const prevStepBtn = document.getElementById('btn-prev-signup-step');

    const setSignupStep = (stepNum) => {
      if (!step1El || !step2El || !tab1Btn || !tab2Btn) return;
      const isStep2 = stepNum === 2;
      step1El.style.display = isStep2 ? 'none' : 'flex';
      step2El.style.display = isStep2 ? 'flex' : 'none';
      tab1Btn.classList.toggle('active', !isStep2);
      tab2Btn.classList.toggle('active', isStep2);
      tab1Btn.setAttribute('aria-selected', String(!isStep2));
      tab2Btn.setAttribute('aria-selected', String(isStep2));
      const sp = container ? container.querySelector('.signup-panel') : null;
      if (sp) sp.scrollTop = 0;
    };
    window.__setSignupStep = setSignupStep;

    const validateStep1AndAdvance = () => {
      const nameVal = (document.getElementById('req-name').value || '').trim();
      const userVal = (document.getElementById('req-user').value || '').trim();
      const passVal = document.getElementById('req-pass').value || '';
      const passConfVal = document.getElementById('req-pass-confirm').value || '';
      const alertBoxEl = document.getElementById('signup-alert-box');
      if (!nameVal || !userVal) {
        if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', 'Please fill in your Full Name and Desired Username first.', 'alert');
        return false;
      }
      if (passVal.length < 4) {
        if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', 'Password must be at least 4 characters long.', 'alert');
        return false;
      }
      if (passVal !== passConfVal) {
        if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', 'Passwords do not match. Please verify and re-type your password.', 'alert');
        return false;
      }
      if (alertBoxEl) alertBoxEl.innerHTML = '';
      setSignupStep(2);
      setTimeout(() => { const pinEl = document.getElementById('req-pin'); if (pinEl) pinEl.focus(); }, 80);
      return true;
    };

    if (tab1Btn) tab1Btn.onclick = () => setSignupStep(1);
    if (tab2Btn) tab2Btn.onclick = () => validateStep1AndAdvance();
    if (nextStepBtn) nextStepBtn.onclick = () => validateStep1AndAdvance();
    if (prevStepBtn) prevStepBtn.onclick = () => setSignupStep(1);

    const showSignUp = () => {
      if (!container) return;
      container.classList.add('right-panel-active');
      const sp = container.querySelector('.signup-panel');
      if (sp) sp.scrollTop = 0;
      setTimeout(() => { const rn = document.getElementById('req-name'); if (rn) rn.focus(); }, 120);
    };
    const showSignIn = () => {
      if (!container) return;
      container.classList.remove('right-panel-active');
      const sip = container.querySelector('.signin-panel');
      if (sip) sip.scrollTop = 0;
      setTimeout(() => { const uEl = document.getElementById('u'); if (uEl) uEl.focus(); }, 120);
    };
    if (signUpBtn) signUpBtn.onclick = showSignUp;
    if (mobReqBtn) mobReqBtn.onclick = showSignUp;
    if (signInBtn) signInBtn.onclick = showSignIn;
    if (backBtn) backBtn.onclick = showSignIn;
    const u = document.getElementById('u');
    if (u) u.focus();
  }

  /* ---------- MODULE 1, 2, 3, 4: ADMINISTRATOR WORKSPACE CONSOLE ---------- */
  async function pageAdmin(noticeMsg = '') {
    removeExistingModal();
    loading('Loading Administration Console & Audit Ledger...');
    try {
      const [curPolicy, profile, staffList, mcdaWeights, auditLogs, accountRequests, passwordResetRequests, suppliers, offers] = await Promise.all([
        API.getPolicy(),
        API.getCompanyProfile(),
        API.listStaff(),
        API.getMcdaWeights(),
        API.listAuditLogs(),
        API.listAccountRequests(),
        API.listPasswordResetRequests(),
        API.listSuppliers(),
        API.listOffers()
      ]);

      if (profile) applyBranding(profile);

      const totalWeights = (mcdaWeights.cost || 0) + (mcdaWeights.stock || 0) + (mcdaWeights.freshness || 0) + (mcdaWeights.consolidation || 0);
      const isWeightValid = totalWeights === 100;
      const pendingCount = (accountRequests || []).filter(r => r.status === 'PENDING').length;
      const pendingResetCount = (passwordResetRequests || []).filter(r => r.status === 'PENDING').length;
      const requiredQuotes = profile.required_supplier_quotes || 3;

      setMain(
        '<div class="stack" style="gap:20px;">' +
          '<!-- ADMIN HEADER PROFILE -->' +
          '<div class="row between" style="align-items:flex-end;">' +
            '<div>' +
              '<div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">' +
                '<h1 style="font-size:26px; font-weight:700; margin:0;">Enterprise Administration Console</h1>' +
                '<span class="badge ok">Role: Administrator (Auditor)</span>' +
              '</div>' +
              '<p class="sub">Configure enterprise business profile, adjust dynamic MCDA utility weights, manage staff account succession, and audit immutable event records.</p>' +
            '</div>' +
            '<div class="row" style="gap:8px;">' +
              '<button type="button" class="btn primary" onclick="document.getElementById(\'prof-name\').focus();">Edit Business Profile</button>' +
            '</div>' +
          '</div>' +

          (noticeMsg ? alertBox('ok', esc(noticeMsg), 'status') : '') +

          '<!-- 4 METRIC STATS CARDS -->' +
          '<div class="preparer-metrics-grid">' +
            '<div class="metric-card"><div class="metric-icon">🏢</div><div><div class="metric-number" style="font-size:18px;">' + esc(profile.business_name) + '</div><div class="metric-label">Enterprise Business Profile</div></div></div>' +
            '<div class="metric-card"><div class="metric-icon">⏱️</div><div><div class="metric-number">' + curPolicy.max_age_days + ' Days</div><div class="metric-label">Max Quote Age Policy</div></div></div>' +
            '<div class="metric-card"><div class="metric-icon">🏬</div><div><div class="metric-number">' + suppliers.length + ' Vendors (Min ' + requiredQuotes + ')</div><div class="metric-label">Supplier Canvass Quorum</div></div></div>' +
            '<div class="metric-card"><div class="metric-icon">⚖️</div><div><div class="metric-number">' + mcdaWeights.cost + '/' + mcdaWeights.stock + '/' + mcdaWeights.freshness + '/' + mcdaWeights.consolidation + '</div><div class="metric-label">MCDA Weights Ratio (%)</div></div></div>' +
          '</div>' +

          '<!-- MODULE 1: ENTERPRISE BUSINESS PROFILE CARD -->' +
          '<section class="card stack" id="admin-profile-card" style="border-left:4px solid var(--teal); background:var(--card-subtle);">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">🏢</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">Enterprise Business Profile &amp; Universal Branding</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Dynamically updates headers, footers, print job sheets, and document titles across all devices.</p>' +
                '</div>' +
              '</div>' +
              '<span class="badge ok">Dynamic Branding Active</span>' +
            '</div>' +

            '<form id="company-profile-form" class="stack" novalidate style="margin-top:10px;">' +
              '<div class="row" style="gap:12px;">' +
                '<div style="flex:2;">' +
                  '<label for="prof-name">Business / Company Name</label>' +
                  '<input id="prof-name" value="' + esc(profile.business_name) + '" required placeholder="e.g. AMGC Airconditioning Services">' +
                '</div>' +
                '<div style="flex:2;">' +
                  '<label for="prof-type">Industry / Trade Type</label>' +
                  '<input id="prof-type" value="' + esc(profile.business_type) + '" required placeholder="e.g. Commercial & Industrial HVAC Services">' +
                '</div>' +
              '</div>' +

              '<div>' +
                '<label for="prof-location">Headquarters Location / Official Address</label>' +
                '<input id="prof-location" value="' + esc(profile.location) + '" required placeholder="e.g. V.V. Soliven Ave. II, Cainta, Rizal, Philippines">' +
                '<div class="small" style="color:var(--mute); margin-top:2px;">Special characters will be formatted cleanly in footers and job sheets.</div>' +
              '</div>' +

              '<div class="row" style="gap:12px;">' +
                '<div style="flex:1;">' +
                  '<label for="prof-curr-code">Currency Code</label>' +
                  '<input id="prof-curr-code" value="' + esc(profile.currency_code || 'PHP') + '" maxlength="3" required style="text-transform:uppercase;">' +
                '</div>' +
                '<div style="flex:1;">' +
                  '<label for="prof-curr-symbol">Currency Symbol</label>' +
                  '<input id="prof-curr-symbol" value="' + esc(profile.currency_symbol || '₱') + '" maxlength="4" required>' +
                '</div>' +
                '<div style="flex:1.5;">' +
                  '<label for="prof-age">Max Quote Age Threshold (Days)</label>' +
                  '<input id="prof-age" type="number" min="1" max="90" value="' + profile.max_quote_age_days + '" required>' +
                '</div>' +
                '<div style="flex:1.5;">' +
                  '<label for="prof-min-suppliers">Required Supplier Quotes</label>' +
                  '<input id="prof-min-suppliers" type="number" min="1" max="20" value="' + requiredQuotes + '" required title="Minimum competing supplier bids required for procurement audit compliance">' +
                '</div>' +
              '</div>' +

              '<div class="row" style="margin-top:4px;">' +
                '<button class="primary" type="button" data-action="save-company-profile">Save Enterprise Business Profile</button>' +
              '</div>' +
            '</form>' +
          '</section>' +

          '<!-- MODULE 1B: ACCREDITED SUPPLIER NETWORK DIRECTORY -->' +
          '<section class="card stack" id="admin-suppliers-card" style="border-left:4px solid #0D9488; background:var(--card-subtle);">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">🏬</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">Accredited Supplier Network &amp; Vendor Directory (' + suppliers.length + ' Registered)</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Enterprise procurement network. Add and manage approved component vendors, regional depots, and wholesale distributors.</p>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="btn primary" data-action="open-add-supplier-modal" style="font-weight:700;">+ Add Accredited Supplier</button>' +
            '</div>' +

            '<div class="tbl" style="margin-top:6px;">' +
              '<table>' +
                '<thead><tr><th>Supplier / Organization</th><th>Depot / Branch Location</th><th>Contact / Reference</th><th class="num">Curated Quotes</th><th>Accreditation</th><th>Actions</th></tr></thead>' +
                '<tbody>' +
                  (suppliers && suppliers.length ? suppliers.map(sup => {
                    const quoteCount = (offers || []).filter(o => o.supplier_id === sup.id).length;
                    const isAccredited = sup.accredited !== false;
                    return '<tr>' +
                      '<td><strong style="color:var(--ink);">' + esc(sup.name) + '</strong></td>' +
                      '<td class="small" style="color:var(--mute);">' + esc(sup.location || 'Philippines') + '</td>' +
                      '<td class="small" style="color:var(--mute);">' + esc(sup.contact || 'Accredited Depot') + '</td>' +
                      '<td class="num font-mono"><strong>' + quoteCount + '</strong> offers</td>' +
                      '<td>' + (isAccredited ? badge('ok', '✓ Accredited') : badge('gray', 'Suspended')) + '</td>' +
                      '<td>' +
                        '<div class="row" style="gap:6px; flex-wrap:wrap;">' +
                          '<a class="link small" href="#/catalog" onclick="window.__pendingCatalogSupplierFilter=\'' + esc(sup.id) + '\'">📦 View Catalog (' + quoteCount + ')</a>' +
                          '<button type="button" class="link small" data-action="edit-supplier" data-id="' + esc(sup.id) + '">✏️ Edit</button>' +
                          '<button type="button" class="btn ' + (isAccredited ? 'ghost' : 'primary') + '" style="padding:3px 8px; font-size:11.5px;" data-action="toggle-supplier-status" data-id="' + esc(sup.id) + '">' + (isAccredited ? 'Suspend' : 'Accredit') + '</button>' +
                        '</div>' +
                      '</td>' +
                    '</tr>';
                  }).join('') : '<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--mute);">No suppliers registered yet. Click "+ Add Accredited Supplier" to register vendor partners.</td></tr>') +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</section>' +

          '<!-- MODULE 3: INTERACTIVE MCDA UTILITY WEIGHT ENGINE -->' +
          '<section class="card stack" id="admin-mcda-card" style="border-left:4px solid #8B5CF6; background:var(--card-subtle);">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">⚖️</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">AI Procurement Engine Settings (MCDA Utility Weights)</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Adjust multi-criteria optimization ratios applied when ranking candidate quotations. Sum must equal exactly 100%.</p>' +
                '</div>' +
              '</div>' +
              '<span class="badge ' + (isWeightValid ? 'ok' : 'bad') + '" id="mcda-total-badge">' + (isWeightValid ? 'Total: 100% ✓ Balanced' : 'Total: ' + totalWeights + '% ⚠️ Must equal 100%') + '</span>' +
            '</div>' +

            '<div class="grid2" style="margin-top:10px; gap:14px;">' +
              '<div class="field">' +
                '<label for="mcda-cost">1. Lowest Unit Cost Weight (%): <strong id="mcda-cost-val">' + mcdaWeights.cost + '%</strong></label>' +
                '<input id="mcda-cost" type="range" min="0" max="100" step="5" value="' + mcdaWeights.cost + '" data-bind="mcda-input">' +
                '<div class="small" style="color:var(--mute);">Maximizes fiscal savings per piece.</div>' +
              '</div>' +

              '<div class="field">' +
                '<label for="mcda-stock">2. Stock Buffer / Surplus Ratio (%): <strong id="mcda-stock-val">' + mcdaWeights.stock + '%</strong></label>' +
                '<input id="mcda-stock" type="range" min="0" max="100" step="5" value="' + mcdaWeights.stock + '" data-bind="mcda-input">' +
                '<div class="small" style="color:var(--mute);">Protects against stockouts and order delays.</div>' +
              '</div>' +

              '<div class="field">' +
                '<label for="mcda-freshness">3. Quote Freshness / Recency (%): <strong id="mcda-freshness-val">' + mcdaWeights.freshness + '%</strong></label>' +
                '<input id="mcda-freshness" type="range" min="0" max="100" step="5" value="' + mcdaWeights.freshness + '" data-bind="mcda-input">' +
                '<div class="small" style="color:var(--mute);">Favors verified contemporary pricing.</div>' +
              '</div>' +

              '<div class="field">' +
                '<label for="mcda-consolidation">4. Supplier Multi-line Consolidation (%): <strong id="mcda-consolidation-val">' + mcdaWeights.consolidation + '%</strong></label>' +
                '<input id="mcda-consolidation" type="range" min="0" max="100" step="5" value="' + mcdaWeights.consolidation + '" data-bind="mcda-input">' +
                '<div class="small" style="color:var(--mute);">Minimizes logistical and purchase order fragmentation.</div>' +
              '</div>' +
            '</div>' +

            '<div class="row" style="margin-top:6px;">' +
              '<button class="primary" type="button" data-action="save-mcda-weights" id="saveMcdaBtn"' + (isWeightValid ? '' : ' disabled') + '>Save MCDA Utility Weights</button>' +
            '</div>' +
          '</section>' +

          '<!-- MODULE 2B: STAFF ACCOUNT ACCESS & PROVISIONING REQUESTS -->' +
          '<section class="card stack" id="admin-requests-card" style="border-left:4px solid #06B6D4; background:var(--card-subtle);">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">👥</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">Staff Account Access &amp; Provisioning Requests</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Review, approve, or reject employee registration requests and issue role credentials.</p>' +
                '</div>' +
              '</div>' +
              '<span class="badge ' + (pendingCount > 0 ? 'warn' : 'ok') + '" id="req-pending-badge">' + (pendingCount > 0 ? (pendingCount + ' Pending Review') : '✓ All Reviewed') + '</span>' +
            '</div>' +

            (accountRequests && accountRequests.length ? (
              '<div class="tbl" style="margin-top:6px;">' +
                '<table>' +
                  '<thead><tr><th>Applicant / Username</th><th>Requested Role</th><th>Submitted Time</th><th>Review Status</th><th>Administrative Actions</th></tr></thead>' +
                  '<tbody>' +
                    accountRequests.map(r => {
                      const isPending = r.status === 'PENDING';
                      const isApproved = r.status === 'APPROVED';
                      const isRejected = r.status === 'REJECTED';
                      return '<tr>' +
                        '<td><strong style="color:var(--ink);">' + esc(r.name) + '</strong><div class="small mono">@' + esc(r.username) + '</div></td>' +
                        '<td><span class="badge ' + (r.role === 'maintainer' ? 'info' : 'ok') + '">' + esc(r.role) + '</span>' + ((r.recovery_pin || r.security_question) ? '<div class="small" style="color:var(--teal); margin-top:3px;">🛡️ PIN &amp; Sec. Q Set</div>' : '') + '</td>' +
                        '<td><span class="small">' + esc(fmtTime(r.created_at)) + '</span></td>' +
                        '<td>' + (isPending ? badge('warn', '⏳ Pending Review') : isApproved ? badge('ok', '✓ Approved &amp; Active') : badge('bad', '✕ Rejected')) + '</td>' +
                        '<td>' +
                          (isPending ? (
                            '<div class="row" style="gap:6px; flex-wrap:wrap;">' +
                              '<button type="button" class="btn primary" style="padding:4px 12px; font-size:12px; background:var(--teal);" data-action="approve-account-request" data-id="' + esc(r.id) + '">✓ Approve &amp; Activate</button>' +
                              '<button type="button" class="btn" style="padding:4px 10px; font-size:12px; border-color:#EF4444; color:#EF4444;" data-action="reject-account-request" data-id="' + esc(r.id) + '">✕ Reject</button>' +
                            '</div>'
                          ) : isApproved ? (
                            '<span class="small" style="color:var(--teal); font-weight:600;">✓ Active in Staff Directory &middot; Approved by ' + esc(r.reviewed_by || 'Admin') + '</span>'
                          ) : (
                            '<span class="small" style="color:var(--mute);">Declined &middot; Reviewed by ' + esc(r.reviewed_by || 'Admin') + '</span>'
                          )) +
                        '</td>' +
                      '</tr>';
                    }).join('') +
                  '</tbody>' +
                '</table>' +
              '</div>'
            ) : (
              '<div class="card" style="text-align:center; padding:18px; background:var(--card-bg); margin-top:8px;">' +
                '<p class="small" style="color:var(--mute); margin:0;">No account provisioning requests submitted yet. When technicians or catalog maintainers request an account at the Sign In portal, their submissions will appear here for administrator authorization.</p>' +
              '</div>'
            )) +
          '</section>' +

          '<!-- MODULE 2C: IDENTITY-VERIFIED PASSWORD RESET REQUESTS (ANTI-IMPOSTOR QUEUE) -->' +
          '<section class="card stack" id="admin-password-resets-card" style="border-left:4px solid #F59E0B; background:var(--card-subtle);">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">🔑</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">Identity-Verified Password Reset Requests</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Only staff requests that passed anti-impostor 6-Digit PIN &amp; Security Question verification reach this queue. Unverified / impostor attempts are blocked &amp; logged.</p>' +
                '</div>' +
              '</div>' +
              '<span class="badge ' + (pendingResetCount > 0 ? 'warn' : 'ok') + '" id="pwr-pending-badge">' + (pendingResetCount > 0 ? (pendingResetCount + ' Pending Approval') : '✓ All Clear') + '</span>' +
            '</div>' +

            (passwordResetRequests && passwordResetRequests.length ? (
              '<div class="tbl" style="margin-top:6px;">' +
                '<table>' +
                  '<thead><tr><th>Staff Member / Username</th><th>Role</th><th>Anti-Impostor Proof</th><th>Submitted Time</th><th>Status</th><th>Administrative Actions</th></tr></thead>' +
                  '<tbody>' +
                    passwordResetRequests.map(r => {
                      const isPending = r.status === 'PENDING';
                      const isApproved = r.status === 'APPROVED';
                      return '<tr>' +
                        '<td><strong style="color:var(--ink);">' + esc(r.name) + '</strong><div class="small mono">@' + esc(r.username) + '</div></td>' +
                        '<td><span class="badge ' + (r.role === 'maintainer' ? 'info' : 'ok') + '">' + esc(r.role) + '</span></td>' +
                        '<td><span class="badge ok">🛡️ Verified: ' + esc(r.verification_method || 'PIN / Sec. Question') + '</span></td>' +
                        '<td><span class="small">' + esc(fmtTime(r.created_at)) + '</span></td>' +
                        '<td>' + (isPending ? badge('warn', '⏳ Pending Approval') : isApproved ? badge('ok', '✓ Password Updated') : badge('bad', '✕ Declined')) + '</td>' +
                        '<td>' +
                          (isPending ? (
                            '<div class="row" style="gap:6px; flex-wrap:wrap;">' +
                              '<button type="button" class="btn primary" style="padding:4px 12px; font-size:12px; background:var(--teal);" data-action="approve-password-reset" data-id="' + esc(r.id) + '">✓ Approve Reset</button>' +
                              '<button type="button" class="btn" style="padding:4px 10px; font-size:12px; border-color:#EF4444; color:#EF4444;" data-action="reject-password-reset" data-id="' + esc(r.id) + '">✕ Reject</button>' +
                            '</div>'
                          ) : isApproved ? (
                            '<span class="small" style="color:var(--teal); font-weight:600;">✓ Password Activated &middot; Approved by ' + esc(r.reviewed_by || 'Admin') + '</span>'
                          ) : (
                            '<span class="small" style="color:var(--mute);">' + esc(r.reason || 'Declined') + ' &middot; Reviewed by ' + esc(r.reviewed_by || 'Admin') + '</span>'
                          )) +
                        '</td>' +
                      '</tr>';
                    }).join('') +
                  '</tbody>' +
                '</table>' +
              '</div>'
            ) : (
              '<div class="card" style="text-align:center; padding:18px; background:var(--card-bg); margin-top:8px;">' +
                '<p class="small" style="color:var(--mute); margin:0;">No pending password reset requests. When BOM Preparers or Catalog Maintainers verify their 6-Digit PIN or Security Question via <strong>Forgot password?</strong>, their verified reset appears here for approval. Administrators can self-recover immediately using 2-Factor (PIN + Security Question).</p>' +
              '</div>'
            )) +
          '</section>' +

          '<!-- MODULE 2: AUTHORIZED STAFF LIFECYCLE & SUCCESSION -->' +
          '<section class="card stack" id="admin-staff-card">' +
            '<div class="row between" style="align-items:center;">' +
              '<div>' +
                '<h2 style="font-size:18px; font-weight:700;">Authorized Staff Lifecycle &amp; Role Succession</h2>' +
                '<p class="small" style="color:var(--mute);">Manage role handovers and soft deactivations without compromising historical audit foreign keys.</p>' +
              '</div>' +
              '<span class="badge ok">Strict RBAC</span>' +
            '</div>' +

            '<div class="tbl" style="margin-top:6px;">' +
              '<table>' +
                '<thead><tr><th>Staff Member / Username</th><th>Assigned Role</th><th>Account Status</th><th>Succession &amp; Access Actions</th></tr></thead>' +
                '<tbody>' +
                  staffList.map(u => {
                    const isAdmin = u.role === 'administrator' || u.role === 'admin';
                    return '<tr>' +
                      '<td><strong style="color:var(--ink);">' + esc(u.name) + '</strong><div class="small mono">@' + esc(u.username) + '</div></td>' +
                      '<td><span class="badge ' + (isAdmin ? 'warn' : 'ok') + '">' + esc(u.role) + '</span></td>' +
                      '<td>' + (u.is_active ? badge('ok', '✓ Active') : badge('bad', '⚠️ Deactivated')) + '</td>' +
                      '<td>' +
                        '<div class="row" style="gap:6px; flex-wrap:wrap;">' +
                          (!isAdmin ? '<button type="button" class="btn" style="padding:4px 10px; font-size:12px;" data-action="promote-staff" data-id="' + esc(u.id) + '">👑 Promote to Admin</button>' : '<span class="small" style="color:var(--mute); padding:4px 0;">Primary Auditor</span>') +
                          '<button type="button" class="btn ' + (u.is_active ? 'ghost' : 'primary') + '" style="padding:4px 10px; font-size:12px;" data-action="toggle-staff-status" data-id="' + esc(u.id) + '">' + (u.is_active ? 'Deactivate' : 'Reactivate') + '</button>' +
                        '</div>' +
                      '</td>' +
                    '</tr>';
                  }).join('') +
                '</tbody>' +
              '</table>' +
            '</div>' +
            '<div class="alert info" style="font-size:12.5px; line-height:1.5; margin-top:8px;">' +
              '<strong>Soft Deactivation Policy:</strong> Resigned or departed employees are marked as Deactivated rather than deleted. Deactivated staff cannot log in, create BOMs, or freeze estimates, while past snapshots maintain foreign-key integrity.' +
            '</div>' +
          '</section>' +

          '<!-- MODULE 4: IMMUTABLE AUDIT EVENT LEDGER TABLE -->' +
          '<section class="card stack" id="admin-audit-ledger-card">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">📜</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">Immutable Audit Event Ledger</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Cryptographically attributable provenance trail synchronized with Supabase PostgreSQL.</p>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="btn" data-action="refresh-audit-logs">🔄 Refresh Ledger</button>' +
            '</div>' +

            '<div class="tbl" style="margin-top:6px; max-height:360px; overflow-y:auto;">' +
              '<table>' +
                '<thead><tr><th>Timestamp</th><th>Actor / Role</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>' +
                '<tbody>' +
                  (auditLogs && auditLogs.length ? auditLogs.map(l => {
                    let actionBadge = badge('gray', esc(l.action));
                    if (l.action === 'PROFILE_UPDATE') actionBadge = badge('ok', 'PROFILE_UPDATE');
                    else if (l.action === 'STAFF_STATUS_CHANGE') actionBadge = badge('warn', 'STAFF_CHANGE');
                    else if (l.action === 'POLICY_UPDATE') actionBadge = badge('ok', 'POLICY_UPDATE');
                    else if (l.action === 'SUMMARY_SAVE') actionBadge = badge('ok', 'SUMMARY_SAVE');
                    else if (l.action === 'SECURITY_RESET_FAILED' || l.action === 'SECURITY_ACCOUNT_LOCKOUT' || l.action === 'PASSWORD_RESET_REJECTED') actionBadge = badge('bad', esc(l.action));
                    else if (l.action === 'PASSWORD_RESET_REQUESTED') actionBadge = badge('warn', 'PASSWORD_RESET_REQUESTED');
                    else if (l.action === 'PASSWORD_RESET_APPROVED' || l.action === 'ADMIN_PASSWORD_RECOVERED' || l.action === 'SECURITY_CREDENTIALS_UPDATED') actionBadge = badge('ok', esc(l.action));

                    return '<tr>' +
                      '<td class="small mono" style="white-space:nowrap;">' + esc(l.timestamp || fmtTime(l.created_at)) + '</td>' +
                      '<td><strong style="color:var(--ink); font-size:13px;">' + esc(l.actor || l.performed_by || 'System') + '</strong></td>' +
                      '<td>' + actionBadge + '</td>' +
                      '<td class="small mono" style="color:var(--mute);">' + esc(l.target || 'System') + '</td>' +
                      '<td class="small" style="color:var(--ink);">' + esc(l.details || '') + '</td>' +
                    '</tr>';
                  }).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--mute);">No audit events recorded yet.</td></tr>') +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</section>' +

          '<!-- SUPABASE CLOUD SYNC & STATUS CARD -->' +
          '<section class="card stack" style="border-left:4px solid #10B981; background:var(--card-subtle);">' +
            '<div class="row between" style="align-items:center;">' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:20px;">☁️</span>' +
                '<div>' +
                  '<h2 style="font-size:18px; font-weight:700; margin:0;">Supabase Cloud PostgreSQL Database</h2>' +
                  '<p class="small" style="color:var(--mute); margin:0;">Live Cloud Backend &middot; <span class="mono">https://xahcgiwwyaskazgbgejh.supabase.co</span></p>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span class="badge ok" id="cloudStatusBadge">🟢 Cloud Connected</span>' +
                '<span class="badge ok" id="supabaseRealtimeBadge">⚡ Realtime Synchronized</span>' +
              '</div>' +
            '</div>' +
            '<div class="row" style="gap:10px; margin-top:8px;">' +
              '<button type="button" class="btn" data-action="test-cloud-connection">⚡ Test Supabase Latency</button>' +
              '<button type="button" class="btn primary" data-action="sync-cloud-data">🔄 Sync Local Catalog &amp; BOMs to Supabase</button>' +
            '</div>' +
            '<div id="cloudStatusOutput" class="small mono" style="margin-top:6px; color:var(--mute);">Ready to sync catalog_offers, bom_items, company_settings, and audit_logs.</div>' +
          '</section>' +
        '</div>'
      );
    } catch (e) { errorPage(e); }
  }

  function pageHome() {
    if (isAdminUser()) return pageAdmin();
    if (me && me.capabilities && me.capabilities.includes('lists')) return go('#/lists');
    if (me && me.capabilities && me.capabilities.includes('catalog')) return go('#/catalog');
    pageLanding();
  }

  function pageLanding() {
    landing = true;
    $app.innerHTML = window.PC_LANDING.html();
    renderShell();
    window.PC_LANDING.mount();
    applyBranding(companyProfile);
    if (window.__pendingScrollTarget) {
      const tgt = window.__pendingScrollTarget;
      window.__pendingScrollTarget = null;
      setTimeout(() => {
        const el = document.getElementById(tgt);
        if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }, 100);
    } else {
      window.scrollTo(0, 0);
    }
  }

  /* ---------- CATALOG WORKSPACE (MAINTAINER & ADMIN) ---------- */
  function canManageCatalog() {
    return me && (me.role === 'maintainer' || me.role === 'admin' || me.role === 'administrator' || (me.capabilities && me.capabilities.includes('catalog')));
  }

  async function pageCatalog(search) {
    if (!me) return go('#/login');
    if (!canManageCatalog()) return go('#/lists');
    removeExistingModal();
    loading('Loading catalog...');
    try {
      if (window.__pendingCatalogSupplierFilter) {
        catalogSupplierFilter = window.__pendingCatalogSupplierFilter;
        window.__pendingCatalogSupplierFilter = null;
      }
      const [parts, offers, sups] = await Promise.all([API.listParts(), API.listOffers(), API.listSuppliers()]);
      window.__cat = { parts, offers, sups };
      drawCatalog(search || '');
    } catch (e) { errorPage(e); }
  }

  function getOfferAgeDays(checkedDate) {
    if (!checkedDate) return 999;
    const baseDate = new Date();
    const checkDate = new Date(checkedDate + 'T12:00:00Z');
    const diff = Math.floor((baseDate - checkDate) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : 0;
  }

  function removeExistingModal() {
    const existing = document.getElementById('offerModalOverlay');
    if (existing) existing.remove();
    const aiModal = document.getElementById('aiImportModalOverlay');
    if (aiModal) aiModal.remove();
    const fpModal = document.getElementById('forgotPasswordModalOverlay');
    if (fpModal) fpModal.remove();
    const secModal = document.getElementById('mySecurityModalOverlay');
    if (secModal) secModal.remove();
    const supModal = document.getElementById('supplierModalOverlay');
    if (supModal) supModal.remove();
  }

  function renderForgotPasswordModal() {
    removeExistingModal();
    if (!fpState) return;

    const ch = fpState.challenge;
    const isAdmin = ch && ch.is_admin;
    const vMode = isAdmin ? 'both' : (fpState.verifyMode || 'both');
    const showPin = vMode === 'both' || vMode === 'pin';
    const showQuestion = vMode === 'both' || vMode === 'question';

    let bodyHtml = '';
    if (fpState.step === 1) {
      bodyHtml = `
        <div class="alert info" style="font-size:12.5px; line-height:1.45;">
          <strong>Anti-Impostor Identity Recovery:</strong> Enter your registered username to verify your identity via your <strong>6-Digit Recovery PIN</strong> and/or <strong>Unique Security Question</strong> (no external email required).
        </div>
        ${fpState.error ? alertBox('bad', esc(fpState.error), 'alert') : ''}
        <form id="fp-lookup-form" class="stack" novalidate style="gap:12px; margin-top:4px;">
          <div>
            <label for="fp-username">Registered Username</label>
            <input id="fp-username" placeholder="e.g. dave_pm, pearl_dba, or karen_admin" value="${esc(fpState.username || '')}" autocomplete="username" required>
          </div>
          <div class="row" style="gap:8px; justify-content:flex-end;">
            <button type="button" class="btn" data-action="close-forgot-password">Cancel</button>
            <button type="submit" class="btn primary" id="btn-fp-lookup">Verify Account &amp; Continue →</button>
          </div>
        </form>
        <details style="margin-top:6px; font-size:12px; color:var(--mute); background:var(--card-subtle); padding:8px 12px; border-radius:8px; border:1px solid var(--line);">
          <summary style="cursor:pointer; font-weight:600; color:var(--ink);">🧪 Pre-configured Demo PINs &amp; Security Answers (Testing Reference)</summary>
          <div class="stack" style="gap:4px; margin-top:6px; line-height:1.4;">
            <div>• <strong>@dave_pm</strong> (BOM Preparer): PIN <code class="mono">240811</code> &middot; Birth City: <code class="mono">cainta</code></div>
            <div>• <strong>@pearl_dba</strong> (Catalog Maintainer): PIN <code class="mono">350922</code> &middot; Birth City: <code class="mono">quezon city</code></div>
            <div>• <strong>@karen_admin</strong> (Administrator &middot; 2FA): PIN <code class="mono">890415</code> &middot; Birth City: <code class="mono">manila</code></div>
          </div>
        </details>
      `;
    } else if (fpState.step === 2 && ch) {
      bodyHtml = `
        <div class="row between" style="align-items:center; background:var(--card-subtle); padding:10px 12px; border-radius:8px; border:1px solid var(--line);">
          <div>
            <strong style="color:var(--ink);">${esc(ch.name)}</strong>
            <span class="small mono" style="color:var(--mute); margin-left:6px;">@${esc(ch.username)}</span>
            <span class="badge ${isAdmin ? 'warn' : 'ok'}" style="margin-left:6px;">${esc(ch.role)}</span>
          </div>
          <button type="button" class="link small" data-action="fp-change-user">Change user</button>
        </div>

        ${isAdmin ? `
          <div class="alert warn" style="font-size:12.5px; line-height:1.45;">
            🛡️ <strong>Administrator 2-Factor Self-Recovery:</strong> Administrator accounts require <strong>BOTH</strong> your 6-Digit Recovery PIN and your Unique Security Question Answer to recover access immediately.
          </div>
        ` : `
          <div class="alert info" style="font-size:12.5px; line-height:1.45;">
            🛡️ <strong>Anti-Impostor Gate:</strong> Verify your identity below. Only verified requests reach the Admin Console for approval; wrong attempts are blocked and lock after 5 tries.
          </div>
          <div class="signup-tabs" role="tablist" aria-label="Verification Method" style="margin-bottom:2px;">
            <button type="button" class="signup-tab-btn ${vMode === 'both' ? 'active' : ''}" data-action="fp-set-verify-mode" data-mode="both">Both (2FA)</button>
            <button type="button" class="signup-tab-btn ${vMode === 'pin' ? 'active' : ''}" data-action="fp-set-verify-mode" data-mode="pin">6-Digit PIN</button>
            <button type="button" class="signup-tab-btn ${vMode === 'question' ? 'active' : ''}" data-action="fp-set-verify-mode" data-mode="question">Security Question</button>
          </div>
        `}

        ${fpState.error ? alertBox('bad', esc(fpState.error), 'alert') : ''}

        <form id="forgot-password-form" class="stack" novalidate style="gap:10px;">
          ${showPin ? `
            <div>
              <label for="fp-pin">6-Digit Security PIN</label>
              <input id="fp-pin" type="password" inputmode="numeric" maxlength="6" class="pin-input-mono" placeholder="••••••" value="${esc(fpState.pin || '')}" autocomplete="off">
            </div>
          ` : ''}

          ${showQuestion ? `
            <div style="background:var(--card-subtle); padding:8px 12px; border-radius:8px; border:1px solid var(--line);">
              <div class="small" style="color:var(--mute); font-weight:600;">Registered Security Question:</div>
              <div style="font-size:13.5px; font-weight:700; color:var(--ink); margin-top:2px;" id="fp-question-text">${esc(ch.security_question)}</div>
            </div>
            <div>
              <label for="fp-sec-answer">Secret Security Answer</label>
              <input id="fp-sec-answer" type="text" placeholder="Enter your secret answer (case-insensitive)" value="${esc(fpState.secAnswer || '')}" autocomplete="off">
            </div>
          ` : ''}

          <div class="row" style="gap:10px;">
            <div class="field">
              <label for="fp-new-pass">New Password</label>
              <input id="fp-new-pass" type="password" placeholder="Min 4 chars" value="${esc(fpState.newPass || '')}" autocomplete="new-password">
            </div>
            <div class="field">
              <label for="fp-confirm-pass">Confirm New Password</label>
              <input id="fp-confirm-pass" type="password" placeholder="Re-type password" value="${esc(fpState.confirmPass || '')}" autocomplete="new-password">
            </div>
          </div>

          <div class="row" style="gap:8px; justify-content:flex-end; margin-top:4px;">
            <button type="button" class="btn" data-action="close-forgot-password">Cancel</button>
            <button type="submit" class="btn primary" id="btn-fp-submit">${isAdmin ? 'Verify 2FA &amp; Recover Admin Password' : 'Verify Identity &amp; Submit Reset Request'}</button>
          </div>
        </form>
      `;
    } else if (fpState.step === 3) {
      bodyHtml = `
        ${alertBox('ok', esc(fpState.successMsg || 'Password recovery processed.'), 'status')}
        <div class="small" style="color:var(--mute); line-height:1.5;">
          ${fpState.mode === 'IMMEDIATE_ADMIN_RESET'
            ? 'Your Administrator credentials have been updated immediately via 2-Factor Verification. You may now sign in with your new password.'
            : 'Your identity-verified request is now queued under <strong>Identity-Verified Password Reset Requests</strong> in the Enterprise Administration Console. Once an Administrator clicks <strong>Approve Reset</strong>, your new password will become active.'}
        </div>
        <div class="row" style="justify-content:flex-end; margin-top:6px;">
          <button type="button" class="btn primary" id="btn-fp-done" data-action="close-forgot-password">Back to Sign In</button>
        </div>
      `;
    }

    const overlay = document.createElement('div');
    overlay.id = 'forgotPasswordModalOverlay';
    overlay.className = 'catalog-modal-overlay';
    overlay.innerHTML = `
      <div class="catalog-modal-card stack" style="max-width:520px;">
        <div class="catalog-modal-header">
          <div>
            <h2 style="font-size:20px; font-weight:700; margin:0;">🔑 Forgot Password &amp; Identity Recovery</h2>
            <p class="small" style="color:var(--mute); margin-top:2px;">Anti-impostor verification for Staff &amp; Administrators</p>
          </div>
          <button type="button" class="catalog-modal-close-btn" data-action="close-forgot-password" aria-label="Close modal">&times;</button>
        </div>
        ${bodyHtml}
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async function renderMySecurityModal(err = '', okMsg = '') {
    removeExistingModal();
    if (!me) return;
    let info;
    try {
      info = await API.getMySecuritySettings();
    } catch (e) {
      alert(e.message);
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'mySecurityModalOverlay';
    overlay.className = 'catalog-modal-overlay';
    overlay.innerHTML = `
      <div class="catalog-modal-card stack" style="max-width:500px;">
        <div class="catalog-modal-header">
          <div>
            <h2 style="font-size:20px; font-weight:700; margin:0;">🛡️ Recovery PIN &amp; Security Question</h2>
            <p class="small" style="color:var(--mute); margin-top:2px;">Update anti-impostor recovery credentials for <strong>@${esc(info.username)}</strong> (${esc(info.role)})</p>
          </div>
          <button type="button" class="catalog-modal-close-btn" data-action="close-my-security-modal" aria-label="Close modal">&times;</button>
        </div>

        ${err ? alertBox('bad', esc(err), 'alert') : ''}
        ${okMsg ? alertBox('ok', esc(okMsg), 'status') : ''}

        <form id="my-security-form" class="stack" novalidate style="gap:10px; margin-top:4px;">
          <div>
            <label for="sec-cur-pass">Current Account Password (Required to Authorize Changes)</label>
            <input id="sec-cur-pass" type="password" placeholder="Enter your current password" autocomplete="current-password" required>
          </div>
          <div>
            <label for="sec-new-pin">New 6-Digit Security PIN</label>
            <input id="sec-new-pin" type="password" inputmode="numeric" maxlength="6" class="pin-input-mono" placeholder="6 digits (avoid 123456 / 000000)" autocomplete="off" required>
          </div>
          <div>
            <label for="sec-new-q">Unique Security Question</label>
            <select id="sec-new-q">
              ${SECURITY_QUESTIONS.map(q => `<option value="${esc(q)}"${q === info.security_question ? ' selected' : ''}>${esc(q)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="sec-new-a">Secret Security Answer</label>
            <input id="sec-new-a" type="text" placeholder="Enter secret answer (case-insensitive, min 2 chars)" autocomplete="off" required>
          </div>
          <div class="row" style="gap:8px; justify-content:flex-end; margin-top:6px;">
            <button type="button" class="btn" data-action="close-my-security-modal">Close</button>
            <button type="submit" class="btn primary" id="btn-save-my-security">Save Recovery Credentials</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  let supplierForm = null;

  function renderSupplierModal() {
    removeExistingModal();
    if (!supplierForm || !supplierForm.isOpen) return;
    const f = supplierForm;
    const overlay = document.createElement('div');
    overlay.id = 'supplierModalOverlay';
    overlay.className = 'catalog-modal-overlay';
    overlay.innerHTML = `
      <div class="catalog-modal-card stack" style="max-width:520px;">
        <div class="catalog-modal-header">
          <div>
            <h2 style="font-size:20px; font-weight:700; margin:0;">${f.id ? 'Edit Accredited Supplier' : 'Register Accredited Supplier'}</h2>
            <p class="small" style="color:var(--mute); margin-top:2px;">Enterprise vendor partner for competitive quotation evaluations.</p>
          </div>
          <button type="button" class="catalog-modal-close-btn" data-action="close-supplier-modal" aria-label="Close modal">&times;</button>
        </div>

        ${f.error ? alertBox('bad', esc(f.error), 'alert') : ''}

        <form id="supplier-form" class="stack" novalidate style="gap:12px; margin-top:4px;">
          <div>
            <label for="sup-name">Supplier / Company Name</label>
            <input id="sup-name" placeholder="e.g. Apex Industrial Cold Supply Corp." value="${esc(f.name || '')}" required>
          </div>
          <div>
            <label for="sup-location">Depot / Branch Location</label>
            <input id="sup-location" placeholder="e.g. Mandaluyong &amp; Pasig City, Metro Manila" value="${esc(f.location || '')}" required>
          </div>
          <div>
            <label for="sup-contact">Contact Person / Invoice Notes</label>
            <input id="sup-contact" placeholder="e.g. Engr. Santos &bull; (02) 8888-1234 &bull; Net 30 terms" value="${esc(f.contact || '')}">
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="sup-accredited" ${f.accredited !== false ? 'checked' : ''} style="width:auto; cursor:pointer;">
            <label for="sup-accredited" style="margin:0; cursor:pointer;">Accredited Vendor Partner (Eligible for BOM Quoting)</label>
          </div>

          <div class="row" style="gap:8px; justify-content:flex-end; margin-top:6px;">
            <button type="button" class="btn" data-action="close-supplier-modal">Cancel</button>
            <button type="submit" class="btn primary" id="btn-save-supplier">${f.id ? 'Update Supplier' : 'Register Supplier'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => {
      const el = document.getElementById('sup-name');
      if (el) el.focus();
    }, 60);
  }

  function drawCatalog(search, notice, preserveScroll = false) {
    const { parts, offers, sups } = window.__cat;
    const q = (search || '').trim().toLowerCase();

    const pName = (id) => (parts.find((p) => p.id === id) || {}).exact_id || '?';
    const sName = (id) => (sups.find((s) => s.id === id) || {}).name || '?';

    const maxAge = (companyProfile && companyProfile.max_quote_age_days) || 14;
    const totalOffers = offers.length;
    let freshCount = 0;
    let staleCount = 0;
    let incompleteCount = 0;

    offers.forEach(o => {
      const missing = o.price_minor == null || o.recorded_quantity == null || !o.checked_date || !o.source_reference;
      const days = getOfferAgeDays(o.checked_date);
      if (missing) incompleteCount++;
      else if (days > maxAge) staleCount++;
      else freshCount++;
    });

    const rows = offers.filter((o) => {
      if (catalogSupplierFilter && catalogSupplierFilter !== 'ALL') {
        if (o.supplier_id !== catalogSupplierFilter) return false;
      }

      const matchQuery = !q || pName(o.part_id).toLowerCase().includes(q) || sName(o.supplier_id).toLowerCase().includes(q) || (o.source_reference || '').toLowerCase().includes(q);
      if (!matchQuery) return false;

      const missing = o.price_minor == null || o.recorded_quantity == null || !o.checked_date || !o.source_reference;
      const days = getOfferAgeDays(o.checked_date);

      if (catalogFilter === 'FRESH') return !missing && days <= maxAge;
      if (catalogFilter === 'STALE') return !missing && days > maxAge;
      if (catalogFilter === 'INCOMPLETE') return missing;
      return true;
    });

    setMain(
      '<div class="stack" style="gap:20px;">' +
        '<div class="row between" style="align-items:flex-end;">' +
          '<div>' +
            '<div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">' +
              '<h1 style="font-size:26px; font-weight:700; margin:0;">Offer Catalog Workspace</h1>' +
              '<span class="badge ok">Role: ' + (isAdminUser() ? 'Administrator' : 'Catalog Maintainer') + '</span>' +
            '</div>' +
            '<p class="sub">Curate, update, and audit exact component offers from accredited suppliers for ' + esc(companyProfile.business_name) + '.</p>' +
          '</div>' +
          (canManageCatalog() ? 
            '<div class="row" style="gap:8px; align-items:center;">' +
              '<input type="file" id="supplier-csv-input" accept=".csv" class="hidden" style="display:none;" onchange="handleSupplierCsvUpload(event)">' +
              '<button type="button" class="btn" id="btn-download-csv-template" data-action="download-csv-template" onclick="downloadSupplierCsvTemplate()" style="font-weight:600;">CSV Template</button>' +
              '<button type="button" class="btn primary" id="btn-upload-supplier-csv" data-action="upload-supplier-csv" onclick="document.getElementById(\'supplier-csv-input\').click()" style="background:#059669; border-color:#047857; color:#FFFFFF; font-weight:700;">Upload Supplier CSV</button>' +
              '<button type="button" class="btn primary" data-action="open-add-offer-modal" style="font-weight:700;">+ Add New Offer</button>' +
            '</div>' : '') +
        '</div>' +

        '<div class="preparer-metrics-grid">' +
          '<div class="metric-card"><div class="metric-icon">📦</div><div><div class="metric-number">' + totalOffers + '</div><div class="metric-label">Total Curated Offers</div></div></div>' +
          '<div class="metric-card"><div class="metric-icon">✓</div><div><div class="metric-number" style="color:var(--ok);">' + freshCount + '</div><div class="metric-label">Fresh &amp; Complete (≤' + maxAge + 'd)</div></div></div>' +
          '<div class="metric-card"><div class="metric-icon">⏱️</div><div><div class="metric-number" style="color:var(--warn);">' + staleCount + '</div><div class="metric-label">Stale Offers (>' + maxAge + 'd)</div></div></div>' +
          '<div class="metric-card"><div class="metric-icon">🏬</div><div><div class="metric-number">' + sups.length + '</div><div class="metric-label">Suppliers Tracked</div></div></div>' +
        '</div>' +

        (notice ? alertBox('ok', esc(notice), 'status') : '') +

        '<section class="card stack" aria-labelledby="oh">' +
          '<div class="row between" style="align-items:center;">' +
            '<div>' +
              '<h2 id="oh" style="font-size:18px; font-weight:700;">Curated Offers List (' + rows.length + ' shown)</h2>' +
              '<p class="small" style="color:var(--mute);">Missing values or stale dates (>' + maxAge + ' days) will cause an offer to be automatically excluded from BOM evaluations.</p>' +
            '</div>' +
            '<div class="field" style="max-width:280px;">' +
              '<input id="q" type="search" placeholder="🔍 Search part, supplier, or notes..." value="' + esc(search) + '" data-bind="catsearch">' +
            '</div>' +
          '</div>' +

          '<div class="row between" style="align-items:center; flex-wrap:wrap; gap:8px; margin-top:2px;">' +
            '<div class="row" style="gap:8px; flex-wrap:wrap;">' +
              '<button type="button" class="btn ' + (catalogFilter === 'ALL' ? 'primary' : '') + '" data-action="set-catalog-filter" data-val="ALL">All Offers (' + totalOffers + ')</button>' +
              '<button type="button" class="btn ' + (catalogFilter === 'FRESH' ? 'primary' : '') + '" data-action="set-catalog-filter" data-val="FRESH">Fresh (≤' + maxAge + 'd) (' + freshCount + ')</button>' +
              '<button type="button" class="btn ' + (catalogFilter === 'STALE' ? 'primary' : '') + '" data-action="set-catalog-filter" data-val="STALE">Stale (>' + maxAge + 'd) (' + staleCount + ')</button>' +
              '<button type="button" class="btn ' + (catalogFilter === 'INCOMPLETE' ? 'primary' : '') + '" data-action="set-catalog-filter" data-val="INCOMPLETE">Incomplete (' + incompleteCount + ')</button>' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<label for="cat-sup-filter" class="small" style="margin:0; font-weight:600; color:var(--mute); white-space:nowrap;">Filter by Supplier:</label>' +
              '<select id="cat-sup-filter" data-bind="cat-sup-filter" style="min-width:210px; padding:6px 10px; font-size:13px;">' +
                '<option value="ALL">🏢 All Suppliers (' + totalOffers + ')</option>' +
                sups.map(s => {
                  const cnt = offers.filter(o => o.supplier_id === s.id).length;
                  return '<option value="' + esc(s.id) + '"' + (catalogSupplierFilter === s.id ? ' selected' : '') + '>' + esc(s.name) + ' (' + cnt + ' quotes)</option>';
                }).join('') +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="tbl" style="margin-top:8px;">' +
            '<table>' +
              '<thead><tr><th>Exact Part ID &amp; Description</th><th>Supplier / Shop</th><th>Attributed Source</th><th class="num">Unit Price</th><th class="num">Stock</th><th>Checked Date</th><th>Status</th><th>Actions</th></tr></thead>' +
              '<tbody>' +
                (rows.length ? rows.map((o) => {
                  const part = parts.find((p) => p.id === o.part_id) || {};
                  const sup = sups.find((s) => s.id === o.supplier_id) || {};
                  const days = getOfferAgeDays(o.checked_date);
                  const isStale = days > maxAge;
                  const isMissing = o.price_minor == null || o.recorded_quantity == null || !o.checked_date || !o.source_reference;

                  let statusBadge = badge('ok', '✓ Fresh');
                  if (isMissing) statusBadge = badge('bad', '! Incomplete');
                  else if (isStale) statusBadge = badge('warn', '⏱️ Stale (' + days + 'd)');
                  if (!o.active) statusBadge += ' ' + badge('gray', 'Inactive');

                  return '<tr>' +
                    '<td><div class="mono" style="font-weight:700;">' + esc(part.exact_id || o.part_id) + '</div><div class="small" style="color:var(--mute);">' + esc(part.description || '') + '</div></td>' +
                    '<td><strong style="color:var(--ink);">' + esc(sup.name || o.supplier_id) + '</strong></td>' +
                    '<td class="small" style="max-width:200px; color:var(--mute);">' + esc(o.source_reference || 'None') + '</td>' +
                    '<td class="num font-mono">' + money(o.price_minor, o.currency) + '</td>' +
                    '<td class="num font-mono">' + (o.recorded_quantity == null ? '<span class="badge bad">None</span>' : o.recorded_quantity) + '</td>' +
                    '<td class="small">' + fmtDate(o.checked_date) + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                    '<td><button type="button" class="link" data-action="edit-offer" data-id="' + esc(o.id) + '">✏️ Edit</button></td>' +
                  '</tr>';
                }).join('') : '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--mute);">No offers match the selected filters.</td></tr>') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</section>' +
      '</div>',
      preserveScroll
    );
  }

  /* ---------- CSV TEMPLATE GENERATOR & BULK PARSER ---------- */
  function downloadSupplierCsvTemplate() {
    const csvContent = 
`part_id,description,source,attributed_source,unit_price,stock
CBB65-45UF-450V,"Dual Run Motor Capacitor 45uF 450VAC (Round aluminum can)",Everwell Parts & Equipment Corp.,Everwell Official Wholesale Quote #EW-2026-11,405.00,45
CBB65-45UF-450V,"Dual Run Motor Capacitor 45uF 450VAC (Round aluminum can)",C&C Airconditioning Supply,C&C Supply Catalog Sheet #CC-8820,420.00,30
R410A-CAN-1KG,"R410A Refrigerant Cylinder 1kg",Manco Refrigeration Supply,Manco Counter Price List Nov 2026,590.00,25\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'supplier_catalog_template.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function parseCsvRecords(text) {
    const lines = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i++;
        }
        row.push(field.trim());
        field = '';
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          lines.push(row);
        }
        row = [];
      } else {
        field += char;
      }
    }
    if (field || row.length > 0) {
      row.push(field.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        lines.push(row);
      }
    }
    return lines;
  }

  async function handleSupplierCsvUpload(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const text = e.target.result;
        const parsedRows = parseCsvRecords(text);
        if (!parsedRows || parsedRows.length < 2) {
          alert('Uploaded CSV file is empty or missing data rows.');
          if (event.target) event.target.value = '';
          return;
        }

        const headers = parsedRows[0].map(h => (h || '').trim().toLowerCase().replace(/[\s_-]+/g, '_'));

        const idxPart = headers.findIndex(h => h === 'part_id' || h === 'part_number' || h === 'partid' || h === 'part' || h === 'exact_id');
        const idxDesc = headers.findIndex(h => h === 'description' || h === 'desc' || h === 'part_description' || h === 'name');
        const idxSource = headers.findIndex(h => h === 'source' || h === 'supplier' || h === 'shop' || h === 'supplier_name' || h === 'vendor');
        const idxAttr = headers.findIndex(h => h === 'attributed_source' || h === 'source_reference' || h === 'reference' || h === 'quote_reference' || h === 'quote_ref');
        const idxPrice = headers.findIndex(h => h === 'unit_price' || h === 'price' || h === 'unitprice' || h === 'price_php');
        const idxStock = headers.findIndex(h => h === 'stock' || h === 'available_qty' || h === 'qty' || h === 'quantity' || h === 'available_quantity');

        if (idxPart === -1 || idxSource === -1 || idxPrice === -1) {
          alert('Invalid CSV header format. CSV must contain at least: part_id, source (or supplier), and unit_price (or price). Click "CSV Template" to download the official format.');
          if (event.target) event.target.value = '';
          return;
        }

        const batch = [];
        for (let i = 1; i < parsedRows.length; i++) {
          const r = parsedRows[i];
          if (!r || !r.length || (r.length === 1 && !r[0])) continue;

          const partId = (r[idxPart] || '').trim();
          const source = (r[idxSource] || '').trim();
          if (!partId || !source) continue;

          const desc = idxDesc !== -1 ? (r[idxDesc] || '').trim() : '';
          const attr = (idxAttr !== -1 ? (r[idxAttr] || '').trim() : '') || file.name;
          const rawPrice = idxPrice !== -1 ? r[idxPrice] : '0';
          const rawStock = idxStock !== -1 ? r[idxStock] : '0';

          batch.push({
            part_id: partId,
            description: desc,
            source: source,
            attributed_source: attr,
            unit_price: rawPrice,
            stock: rawStock
          });
        }

        if (!batch.length) {
          alert('No valid supplier quotation rows found in CSV.');
          if (event.target) event.target.value = '';
          return;
        }

        // Call adapter to persist locally and sync to Supabase
        const result = await API.bulkUpsertOffers(batch, file.name);

        // Refresh in-memory catalog cache
        const [parts, offers, sups] = await Promise.all([API.listParts(), API.listOffers(), API.listSuppliers()]);
        window.__cat = { parts, offers, sups };

        // Re-render catalog view with notice and recalculated KPI summary cards
        const noticeMsg = `Bulk CSV Upload Complete: ${result.addedCount} new quote(s) created, ${result.updatedCount} existing quote(s) updated from "${file.name}". All entries marked Fresh (≤14d).`;
        drawCatalog('', noticeMsg);

      } catch (err) {
        console.error('Supplier CSV upload error:', err);
        alert('Failed to process supplier CSV: ' + (err.message || 'Unknown error'));
      } finally {
        if (event && event.target) event.target.value = '';
        const inputEl = document.getElementById('supplier-csv-input');
        if (inputEl) inputEl.value = '';
      }
    };
    reader.readAsText(file);
  }

  // Export to window for global access
  window.downloadSupplierCsvTemplate = downloadSupplierCsvTemplate;
  window.handleSupplierCsvUpload = handleSupplierCsvUpload;

  function renderCatalogModal() {
    removeExistingModal();
    if (!offerForm || !offerForm.isOpen) return;

    const f = offerForm;
    const { parts, sups } = window.__cat;
    const opt = (list, val, label) => list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === val ? ' selected' : '') + '>' + esc(label(x)) + '</option>').join('');

    const overlay = document.createElement('div');
    overlay.id = 'offerModalOverlay';
    overlay.className = 'catalog-modal-overlay';
    overlay.innerHTML = `
      <div class="catalog-modal-card stack">
        <div class="catalog-modal-header">
          <div>
            <h2 style="font-size:20px; font-weight:700; margin:0;">${f.id ? 'Edit Offer' : 'Add Curated Component Offer'}</h2>
            <p class="small" style="color:var(--mute); margin-top:2px;">${f.id ? 'Updating record for ID: ' + esc(f.id) : 'Record a dated component quotation.'}</p>
          </div>
          <button type="button" class="catalog-modal-close-btn" data-action="close-offer-modal" aria-label="Close modal">&times;</button>
        </div>

        ${f.error ? alertBox('bad', esc(f.error), 'alert') : ''}

        <form id="offerform" class="stack" novalidate style="margin-top:6px;">
          <div>
            <label for="f-part">Exact Part ID</label>
            <select id="f-part" data-bind="of.part_id" ${f.errors && f.errors.part_id ? 'aria-invalid="true" aria-describedby="e-part"' : ''}>
              <option value="">Choose a verified component</option>
              ${opt(parts, f.part_id, (p) => p.exact_id + ' - ' + p.description)}
            </select>
            ${fe(f.errors, 'part_id', 'e-part')}
          </div>

          <div>
            <label for="f-sup">Accredited Supplier</label>
            <select id="f-sup" data-bind="of.supplier_id" ${f.errors && f.errors.supplier_id ? 'aria-invalid="true" aria-describedby="e-sup"' : ''}>
              <option value="">Choose an accredited supplier</option>
              ${opt(sups, f.supplier_id, (s) => s.name)}
            </select>
            ${fe(f.errors, 'supplier_id', 'e-sup')}
          </div>

          <div class="row" style="gap:10px;">
            <div class="field" style="flex:2;">
              <label for="f-price">Unit Price (${esc(companyProfile.currency_code)})</label>
              <input id="f-price" inputmode="decimal" placeholder="e.g. 380.00" value="${esc(f.price)}" data-bind="of.price" ${f.errors && f.errors.price ? 'aria-invalid="true" aria-describedby="e-price"' : ''}>
              ${fe(f.errors, 'price', 'e-price')}
            </div>
            <div class="field" style="flex:1;">
              <label for="f-cur">Currency</label>
              <input id="f-cur" maxlength="3" value="${esc(f.currency || companyProfile.currency_code)}" data-bind="of.currency" readonly style="background:var(--card-subtle);">
            </div>
          </div>

          <div class="row" style="gap:10px;">
            <div class="field">
              <label for="f-qty">Recorded Available Qty</label>
              <input id="f-qty" inputmode="numeric" placeholder="e.g. 45" value="${esc(f.recorded_quantity)}" data-bind="of.recorded_quantity" ${f.errors && f.errors.recorded_quantity ? 'aria-invalid="true" aria-describedby="e-qty"' : ''}>
              ${fe(f.errors, 'recorded_quantity', 'e-qty')}
            </div>
            <div class="field">
              <label for="f-date">Checked Date</label>
              <input id="f-date" type="date" value="${esc(f.checked_date)}" data-bind="of.checked_date">
            </div>
          </div>

          <div>
            <label for="f-src">Source Attribution / Invoice Ref</label>
            <input id="f-src" placeholder="e.g. Quotation Sheet #EW-2026-4491" value="${esc(f.source_reference)}" data-bind="of.source_reference">
          </div>

          <label style="display:flex; gap:10px; align-items:center; font-weight:400; cursor:pointer; margin-top:4px;">
            <input type="checkbox" data-bind="of.active" ${f.active ? 'checked' : ''}>
            <span>Active offer (uncheck to retire instead of hard deleting)</span>
          </label>

          <div class="row" style="gap:10px; margin-top:14px;">
            <button class="primary" type="submit" style="flex:1; height:46px; font-weight:700;">
              ${f.id ? 'Save Changes' : '+ Add Offer'}
            </button>
            <button type="button" class="btn" data-action="close-offer-modal" style="height:46px;">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        removeExistingModal();
        offerForm = null;
      }
    });

    setTimeout(() => {
      const p = document.getElementById('f-part');
      if (p) p.focus();
    }, 50);
  }

  /* ---------- AI CSV / TEXT IMPORT MODAL ---------- */
  function renderAiImportModal() {
    removeExistingModal();
    parsedAiRows = [];
    const overlay = document.createElement('div');
    overlay.id = 'aiImportModalOverlay';
    overlay.className = 'catalog-modal-overlay';
    overlay.innerHTML = `
      <div class="catalog-modal-card stack" style="max-width:680px;">
        <div class="catalog-modal-header">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">🤖</span>
              <h2 style="font-size:20px; font-weight:700; margin:0;">AI Part Normalization &amp; CSV Importer</h2>
            </div>
            <p class="small" style="color:var(--mute); margin-top:2px;">Paste vendor descriptions or CSV lines. AI parses and normalizes each entry to exact catalog components.</p>
          </div>
          <button type="button" class="catalog-modal-close-btn" data-action="close-ai-import-modal" aria-label="Close modal">&times;</button>
        </div>

        <div class="stack" style="gap:8px;">
          <div class="row" style="gap:6px; align-items:center; flex-wrap:wrap;">
            <span class="small" style="font-weight:600;">Load Test Samples:</span>
            <button type="button" class="ai-prompt-chip" data-action="load-ai-sample-1">📦 Split-Type Overhaul (3 parts)</button>
            <button type="button" class="ai-prompt-chip" data-action="load-ai-sample-2">⚡ Sensors &amp; Control Board (2 parts)</button>
          </div>

          <div>
            <label for="aiCsvInput">Paste CSV or messy supplier line items (Description, Quantity):</label>
            <textarea id="aiCsvInput" rows="5" style="width:100%; font-family:monospace; font-size:13px; padding:10px; border-radius:8px; border:1px solid var(--line); background:var(--card-subtle); color:var(--ink);" placeholder="e.g.&#10;45uf dual run capacitor, 2&#10;r410a freon gas 1kg can, 2&#10;defrost contactor 30a, 1"></textarea>
          </div>

          <div class="row" style="gap:10px;">
            <button type="button" class="btn primary" data-action="run-ai-csv-parse" style="flex:1; height:42px; font-weight:700;">⚡ Parse &amp; Normalize with AI</button>
            <button type="button" class="btn" data-action="close-ai-import-modal" style="height:42px;">Cancel</button>
          </div>
        </div>

        <div id="aiCsvResults" style="display:none; margin-top:12px;"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        removeExistingModal();
      }
    });
  }

  /* ---------- PREPARER WORKSPACE DASHBOARD ---------- */
  async function pageLists() {
    if (isAdminUser()) return go('#/');
    removeExistingModal();
    loading('Loading Preparer Workspace...');
    try {
      const lists = await API.listLists();
      const totalLists = lists.length;
      const totalComponents = lists.reduce((acc, l) => acc + (l.lines ? l.lines.length : 0), 0);
      const activeDrafts = lists.filter((l) => !l.archived).length;

      setMain(
        '<div class="stack" style="gap:20px;">' +
          '<div class="preparer-header-wrap">' +
            '<div>' +
              '<div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">' +
                '<h1 style="font-size:26px; font-weight:700; margin:0;">Preparer Workspace</h1>' +
                '<span class="badge ok">Role: BOM Preparer / Field Technician</span>' +
              '</div>' +
              '<p class="sub">Build job parts lists, verify accredited supplier quotations, and freeze procurement decisions for ' + esc(companyProfile.business_name) + '.</p>' +
            '</div>' +
            '<div style="display:flex; gap:10px;">' +
              '<a href="#/summaries" class="btn">View Saved Summaries</a>' +
            '</div>' +
          '</div>' +

          '<div class="preparer-metrics-grid">' +
            '<div class="metric-card"><div class="metric-icon">📋</div><div><div class="metric-number">' + totalLists + '</div><div class="metric-label">Total BOM Lists</div></div></div>' +
            '<div class="metric-card"><div class="metric-icon">⚡</div><div><div class="metric-number">' + totalComponents + '</div><div class="metric-label">Components Listed</div></div></div>' +
            '<div class="metric-card"><div class="metric-icon">🔒</div><div><div class="metric-number">' + activeDrafts + '</div><div class="metric-label">Active Comparison Drafts</div></div></div>' +
          '</div>' +

          '<div class="preparer-guide-banner">' +
            '<div class="guide-step-item"><span class="guide-step-badge">Step 1</span><strong>Create or Edit BOM</strong><p>Add exact part numbers with whole-piece quantities needed for a job.</p></div>' +
            '<div class="guide-step-arrow">→</div>' +
            '<div class="guide-step-item"><span class="guide-step-badge">Step 2</span><strong>AI Multi-Objective Sourcing</strong><p>Optimize for lowest cost, single-supplier consolidation, or MCDA utility.</p></div>' +
            '<div class="guide-step-arrow">→</div>' +
            '<div class="guide-step-item"><span class="guide-step-badge">Step 3</span><strong>Freeze Sourcing Summary</strong><p>Lock the verified prices, compliance proofs, and AI executive briefing.</p></div>' +
          '</div>' +

          '<div class="grid2">' +
            '<section class="card stack" aria-labelledby="lh">' +
              '<div class="row between" style="align-items:center;">' +
                '<div><h2 id="lh" style="font-size:18px; font-weight:700;">Active BOM Lists (' + lists.length + ')</h2><p class="small" style="color:var(--mute);">Each list represents a specific maintenance overhaul.</p></div>' +
              '</div>' +
              '<div class="tbl">' +
                '<table>' +
                  '<thead><tr><th>Project Title</th><th class="num">Lines</th><th>Status</th><th>Actions</th></tr></thead>' +
                  '<tbody>' +
                    (lists.length ? lists.map((l) => '<tr>' +
                      '<td><strong style="color:var(--ink);"><a href="#/lists/' + esc(l.id) + '">' + esc(l.title) + '</a></strong><div class="small" style="color:var(--mute);">Revision ' + l.revision + '</div></td>' +
                      '<td class="num font-mono">' + (l.lines ? l.lines.length : 0) + '</td>' +
                      '<td>' + (l.archived ? badge('gray', 'Archived') : badge('ok', 'Active Draft')) + '</td>' +
                      '<td><div class="row" style="gap:6px;"><a class="btn" style="padding:4px 10px; font-size:12px;" href="#/lists/' + esc(l.id) + '">Edit</a>' +
                      '<a class="btn primary" style="padding:4px 10px; font-size:12px;" href="#/compare/' + esc(l.id) + '">Compare</a></div></td>' +
                    '</tr>').join('') : '<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--mute);">No BOM lists found. Create your first list below.</td></tr>') +
                  '</tbody>' +
                '</table>' +
              '</div>' +
            '</section>' +

            '<section class="card stack" aria-labelledby="nh">' +
              '<h2 id="nh" style="font-size:18px; font-weight:700;">Create New BOM List</h2>' +
              '<p class="small" style="color:var(--mute);">Start a new Bill of Materials for an upcoming job estimate.</p>' +
              '<form id="newlist" class="stack" novalidate style="margin-top:6px;">' +
                '<div>' +
                  '<label for="nl">Project Title / Job Reference</label>' +
                  '<input id="nl" placeholder="e.g. Split-Type Overhaul (Job #AC-2026-089)" required>' +
                  '<div class="err" id="nl-err" hidden></div>' +
                '</div>' +
                '<button class="primary" type="submit" style="margin-top:8px;">+ Create Blank BOM List</button>' +
              '</form>' +
            '</section>' +
          '</div>' +
        '</div>'
      );
    } catch (e) { errorPage(e); }
  }

  /* ---------- BOM LIST EDITOR ---------- */
  async function pageEditor(id) {
    removeExistingModal();
    loading('Loading list...');
    try {
      const [list, parts] = await Promise.all([API.getList(id), API.listParts()]);
      ed = { 
        id: list.id, 
        revision: list.revision, 
        title: list.title, 
        archived: list.archived, 
        parts, 
        errors: null, 
        error: null, 
        saved: false,
        lines: list.lines.map((l) => ({ id: l.id, part_id: l.part_id, quantity: String(l.quantity) })) 
      };
      drawEditor();
    } catch (e) { errorPage(e); }
  }

  function drawEditor(preserveScroll = false) {
    const er = ed.errors || {}; const le = er.lines || {};
    const partCounts = {};
    ed.lines.forEach((l) => { if (l.part_id) partCounts[l.part_id] = (partCounts[l.part_id] || 0) + 1; });
    const dupParts = Object.keys(partCounts).filter((k) => partCounts[k] > 1);
    const hasDup = dupParts.length > 0;
    const dupPartNames = dupParts.map((pid) => {
      const p = ed.parts.find((item) => item.id === pid);
      return p ? p.exact_id : pid;
    });

    const rows = ed.lines.map((l, i) => {
      const isDup = l.part_id && partCounts[l.part_id] > 1;
      const bad = !!le[i] || isDup;
      return '<tr' + (bad ? ' class="row-bad"' : '') + '><td style="min-width:220px"><label class="sr" for="lp' + i + '">Part for line ' + (i + 1) + '</label><select id="lp' + i + '" data-bind="line.part" data-i="' + i + '"' + (bad ? ' aria-invalid="true" aria-describedby="le' + i + '"' : '') + '><option value="">Choose a verified component</option>'
        + ed.parts.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === l.part_id ? ' selected' : '') + (!p.active ? ' disabled' : '') + '>' + esc(p.exact_id) + ' - ' + esc(p.description) + '</option>').join('') + '</select>'
        + (bad ? '<div class="err" id="le' + i + '">' + esc(le[i] || (isDup ? 'Duplicate part on BOM.' : '')) + '</div>' : '') + '</td>'
        + '<td style="width:130px"><label class="sr" for="lq' + i + '">Quantity for line ' + (i + 1) + '</label><input id="lq' + i + '" inputmode="numeric" value="' + esc(l.quantity) + '" data-bind="line.qty" data-i="' + i + '"' + (bad ? ' aria-invalid="true"' : '') + '></td>'
        + '<td><button type="button" class="link" data-action="remove-line" data-i="' + i + '" aria-label="Remove line ' + (i + 1) + '">Remove</button></td></tr>';
    }).join('');

    const dupBanner = hasDup 
      ? alertBox('bad', '⚠️ <strong>' + esc(dupPartNames.join(', ')) + '</strong> is already on this BOM. Edit its quantity instead of adding a second line.', 'alert')
      : '';

    setMain('<div class="row between" style="align-items:center"><div><h1>Edit BOM List</h1><p class="sub">Revision ' + ed.revision + '. Enter whole-piece quantities. Each component appears once per BOM.</p></div><a class="btn" href="#/lists">Back to lists</a></div>'
      + dupBanner
      + (ed.error ? alertBox('bad', esc(ed.error), 'alert') + (ed.conflict ? '<div><button type="button" data-action="reload-list">Reload latest (discards your edits)</button></div>' : '') : '')
      + (ed.saved ? alertBox('ok', 'Saved. Now at revision ' + ed.revision + '.', 'status') : '')
      + '<form id="editor" class="card stack" novalidate><div><label for="t">Project Title</label><input id="t" value="' + esc(ed.title) + '" data-bind="ed.title"' + (er.title ? ' aria-invalid="true" aria-describedby="et"' : '') + '>' + fe(er, 'title', 'et') + '</div>'
      + (ed.lines.length ? '<div class="tbl"><table><thead><tr><th>Verified Component</th><th>Quantity Needed</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="sub">This BOM is currently empty. Add lines below or use AI Import.</p>')
      + '<div class="row" style="gap:10px;">'
      + '<button type="button" data-action="add-line">+ Add Line Item</button>'
      + '<button type="button" class="btn" data-action="open-ai-import-modal" style="display:inline-flex;align-items:center;gap:6px;">🤖 AI CSV / Text Import</button>'
      + '</div>'
      + '<label style="display:flex;gap:10px;align-items:center;font-weight:400"><input type="checkbox" data-bind="ed.archived"' + (ed.archived ? ' checked' : '') + '> Archived</label>'
      + '<div class="row" style="gap:10px;"><button class="primary" type="submit"' + (hasDup ? ' disabled' : '') + '>Save BOM Changes</button><a class="btn" href="#/compare/' + esc(ed.id) + '" ' + (ed.lines.length && !ed.dirty && !hasDup ? '' : 'aria-disabled="true" tabindex="-1"') + '>Compare Saved BOM</a></div>'
      + (ed.dirty ? '<p class="small" style="color:var(--warn);">Save changes before proceeding to comparison.</p>' : '') + '</form>',
      preserveScroll
    );
  }

  /* ---------- COMPARISON & DYNAMIC MCDA OPTIMIZATION ---------- */
  async function pageCompare(id) {
    removeExistingModal();
    loading('Preparing comparison with accredited suppliers...');
    try {
      const policy = await API.getPolicy();
      cmp = { 
        id, 
        selections: {}, 
        strategy: 'lowest_cost', 
        result: null, 
        policy, 
        error: null, 
        saveState: 'idle', 
        token: API.newToken(), 
        savedId: null, 
        settingErrors: null,
        vatMode: 'both'
      };
      if (!policy) { drawCompare(); return; }
      cmp.result = await API.compare(id, cmp.selections);
      
      // Auto-apply default lowest cost strategy selections
      if (window.PC_AI && typeof window.PC_AI.recommendStrategy === 'function') {
        const mcdaW = await API.getMcdaWeights();
        cmp.selections = window.PC_AI.recommendStrategy(cmp.result, 'lowest_cost', mcdaW);
        cmp.result = await API.compare(id, cmp.selections);
      }
      
      drawCompare();
    } catch (e) {
      if (e.code === 'EMPTY_LIST') { 
        setMain('<div class="card stack"><h1>Cannot compare</h1>' + alertBox('warn', 'This list is empty. Add at least one line item first.', 'alert') + '<div><a class="btn" href="#/lists/' + esc(id) + '">Edit list</a></div></div>'); 
        return; 
      }
      errorPage(e);
    }
  }

  function candHtml(line, c) {
    const lowest = line.lowest_eligible_offer_ids.includes(c.offer_id);
    const tie = lowest && line.lowest_eligible_offer_ids.length > 1;
    const chosen = line.selected_offer_id === c.offer_id;

    const vMode = (cmp && cmp.vatMode) || 'both';
    const cv = computeVat(c.price_minor);

    let priceTag = '';
    if (vMode === 'exclusive') {
      priceTag = '<strong class="font-mono">' + money(cv.net, c.currency) + '</strong> <span class="badge gray" style="font-size:9.5px;padding:1px 5px;">Net (excl. 12% VAT)</span> <span class="small" style="color:var(--mute);">(Gross: ' + money(cv.gross, c.currency) + ')</span>';
    } else if (vMode === 'inclusive') {
      priceTag = '<strong class="font-mono">' + money(cv.gross, c.currency) + '</strong> <span class="badge ok" style="font-size:9.5px;padding:1px 5px;">12% VAT Included</span>';
    } else {
      priceTag = '<strong class="font-mono">' + money(cv.gross, c.currency) + '</strong> <span class="badge ok" style="font-size:9.5px;padding:1px 5px;">VAT Incl</span>'
        + '<div class="small font-mono" style="color:var(--mute);margin-top:2px;">&bull; Net of VAT: <strong>' + money(cv.net, c.currency) + '</strong> &bull; 12% VAT: <strong>' + money(cv.vat, c.currency) + '</strong></div>';
    }

    const meta = esc(c.supplier_name) + ' &middot; ' + priceTag + ' &middot; stock ' + (c.recorded_quantity == null ? 'missing' : c.recorded_quantity)
      + '<br><span class="small">Checked ' + fmtDate(c.checked_date) + ' &middot; ' + esc(c.source_reference || 'No source') + (c.synthetic ? ' &middot; synthetic' : '') + '</span>';
    if (c.eligible) {
      return '<div class="cand' + (chosen ? ' sel' : '') + '"><label><input type="radio" name="sel-' + esc(line.line_id) + '" value="' + esc(c.offer_id) + '" data-bind="select" data-line="' + esc(line.line_id) + '"' + (chosen ? ' checked' : '') + '><span>' + meta
        + '<br>' + badge('ok', '&#10003; Eligible') + (lowest ? ' ' + badge('gray', tie ? 'Tied lowest eligible price' : 'Lowest eligible price') : '') + '</span></label></div>';
    }
    return '<div class="cand off"><div>' + meta + '<br>' + badge('bad', 'Excluded') + '<ul style="margin:6px 0 0;padding-left:18px">' + c.reasons.map((r) => '<li>' + esc(REASONS[r] || r) + '</li>').join('') + '</ul></div></div>';
  }

  function drawCompare(preserveScroll = false) {
    const back = '<a class="btn" href="#/lists/' + esc(cmp.id) + '">Back to BOM Editor</a>';
    if (!cmp.policy) {
      const se = cmp.settingErrors || {};
      setMain('<div class="row between" style="align-items:center"><h1>Compare</h1>' + back + '</div>'
        + alertBox('warn', '<strong>CONFIG_REQUIRED.</strong> No comparison policy has been adopted yet.', 'alert')
        + '<form id="policy" class="card stack" style="max-width:480px" novalidate><h2>Adopt Sourcing Policy</h2>'
        + '<div><label for="pa">Maximum age of checked date (Days)</label><input id="pa" inputmode="numeric" placeholder="14" value="14"' + (se.max_age_days ? ' aria-invalid="true" aria-describedby="pae"' : '') + '>' + fe(se, 'max_age_days', 'pae') + '</div>'
        + '<div><label for="pc">Currency code</label><input id="pc" value="PHP" maxlength="3"' + (se.currency ? ' aria-invalid="true" aria-describedby="pce"' : '') + '>' + fe(se, 'currency', 'pce') + '</div>'
        + '<button class="primary" type="submit">Adopt Policy</button></form>', preserveScroll);
      return;
    }

    const r = cmp.result; 
    const s = r.summary; 
    const complete = s.status === 'COMPLETE';
    const vatMode = cmp.vatMode || 'both';

    // 12% Philippine VAT Calculations
    const sv = computeVat(s.subtotal_minor);

    const noteBlock = '<ul class="small" style="margin:0;padding-left:18px"><li>Each line uses one accredited supplier offer covering 100% quantity. Split shipments are prohibited per ' + esc(companyProfile.business_name) + ' service guidelines.</li><li>Standard Philippine 12% VAT is computed in compliance with BIR tax regulations (Republic Act No. 9337).</li><li>Prices reflect verified supplier quotations.</li><li>Unresolved components are never treated as ' + esc(companyProfile.currency_symbol || '₱') + '0.00.</li></ul>';

    setMain(
      '<div class="row between" style="align-items:center"><div><h1>BOM Sourcing Comparison</h1><p class="sub">Policy ' + esc(r.policy_version) + ' &middot; max age ' + r.policy.max_age_days + ' days &middot; ' + esc(r.currency) + ' &middot; evaluated ' + esc(r.evaluation_date) + '</p></div>' + back + '</div>'
      + (cmp.error ? alertBox('bad', esc(cmp.error.message) + ' <span class="small">(' + esc(cmp.error.code) + ')</span>', 'alert') + (cmp.error.code === 'INPUT_CHANGED' ? '<div><button type="button" data-action="rereview">Review again</button></div>' : '') : '')
      + (cmp.savedId ? alertBox('ok', 'Saved as a ' + (complete ? 'complete' : 'partial') + ' sourcing summary snapshot. <a href="#/summaries/' + esc(cmp.savedId) + '">Open Saved Summary</a>.', 'status') : '')
      
      + '<section class="card stack" aria-labelledby="sh">'
      + '<div class="row between" style="align-items:flex-start; flex-wrap:wrap; gap:16px;">'
      + '<div><h2 id="sh">Components Subtotal' + (complete ? '' : ' (Partial)') + '</h2>'
      + '<div class="total">' + money(s.subtotal_minor, r.currency) + ' <span class="small" style="font-size:14px;font-weight:400;color:var(--mute);">(VAT Included)</span></div>'
      + '<div class="small">' + (r.lines.length - s.unresolved_count) + ' of ' + r.lines.length + ' lines resolved ' + (complete ? badge('ok', '&#10003; Ready for Sourcing') : badge('warn', '! Incomplete Lines Pending')) + '</div></div>'
      + '<div class="row"><button class="primary" type="button" data-action="save-summary"' + (cmp.saveState === 'saving' || cmp.savedId ? ' disabled' : '') + '>' + (cmp.saveState === 'saving' ? 'Saving Snapshot...' : cmp.saveState === 'failed' ? 'Retry Save' : 'Save Sourcing Summary') + '</button></div></div>'

      /* PHILIPPINE 12% VAT BREAKDOWN & VIEW CONTROLS */
      + '<div class="vat-tax-summary-box" style="margin-top:14px; padding:14px 18px; background:var(--card-subtle); border:1px solid var(--line); border-radius:12px;">'
      + '<div class="row between" style="align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">'
      + '<div style="display:flex; align-items:center; gap:8px;">'
      + '<span style="font-size:20px;">🧾</span>'
      + '<div><strong style="font-size:14.5px;">Philippine 12% Value Added Tax (VAT) Breakdown</strong><div class="small" style="color:var(--mute);">BIR Republic Act 9337 / Official Invoicing Standards</div></div>'
      + '</div>'
      + '<div class="row" style="gap:6px; flex-wrap:wrap; align-items:center;">'
      + '<span class="small" style="color:var(--mute); font-weight:600; margin-right:4px;">VAT View:</span>'
      + '<button type="button" class="btn ' + (vatMode === 'both' ? 'primary' : '') + '" data-action="set-vat-mode" data-mode="both" style="font-size:12px; padding:5px 12px; font-weight:600;">📊 Dual View (Net &amp; Gross)</button>'
      + '<button type="button" class="btn ' + (vatMode === 'inclusive' ? 'primary' : '') + '" data-action="set-vat-mode" data-mode="inclusive" style="font-size:12px; padding:5px 12px; font-weight:600;">🏷️ VAT-Inclusive (Gross)</button>'
      + '<button type="button" class="btn ' + (vatMode === 'exclusive' ? 'primary' : '') + '" data-action="set-vat-mode" data-mode="exclusive" style="font-size:12px; padding:5px 12px; font-weight:600;">📑 Net of VAT (Excl.)</button>'
      + '</div></div>'

      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">'
      + '<div style="background:var(--card-bg); padding:12px 16px; border-radius:8px; border:1px solid var(--line);">'
      + '<div class="small" style="color:var(--mute); font-weight:600;">1. Net of VAT (Vatable Sales)</div>'
      + '<div class="font-mono" style="font-size:19px; font-weight:700; color:var(--ink); margin:4px 0 2px;">' + money(sv.net, r.currency) + '</div>'
      + '<div class="small" style="font-size:11.5px; color:var(--mute);">Component base cost before tax</div></div>'

      + '<div style="background:var(--card-bg); padding:12px 16px; border-radius:8px; border:1px solid var(--line);">'
      + '<div class="small" style="color:var(--mute); font-weight:600;">2. 12% Value Added Tax</div>'
      + '<div class="font-mono" style="font-size:19px; font-weight:700; color:#0D9488; margin:4px 0 2px;">+ ' + money(sv.vat, r.currency) + '</div>'
      + '<div class="small" style="font-size:11.5px; color:var(--mute);">12% standard BIR tax amount</div></div>'

      + '<div style="background:rgba(45,212,191,0.08); padding:12px 16px; border-radius:8px; border:1px solid rgba(45,212,191,0.3);">'
      + '<div class="small" style="color:var(--teal); font-weight:700;">3. Total Sourcing Cost (VAT Included)</div>'
      + '<div class="font-mono" style="font-size:21px; font-weight:700; color:var(--teal); margin:4px 0 2px;">' + money(sv.gross, r.currency) + '</div>'
      + '<div class="small" style="font-size:11.5px; color:var(--teal);">Official invoice payable total</div></div>'
      + '</div></div>'

      + (complete ? '' : alertBox('warn', '<strong>' + s.unresolved_count + ' unresolved line' + (s.unresolved_count > 1 ? 's' : '') + '.</strong> Their cost is omitted and not counted as zero. The saved summary will be flagged as partial until fully resolved.'))
      + (r.summary && r.summary.below_quorum_count ? '<div class="alert warn" style="margin-top:8px; font-size:12.5px;">⚠️ <strong>Procurement Quorum Notice:</strong> ' + r.summary.below_quorum_count + ' component line(s) have fewer than the required ' + ((r.summary && r.summary.required_supplier_quotes) || (companyProfile && companyProfile.required_supplier_quotes) || 3) + ' competitive supplier bids per corporate benchmark policy.</div>' : '')
      + noteBlock + '</section>'

      /* AI SOURCING STRATEGY OPTIMIZER BAR */
      + '<section class="card stack" style="background:var(--card-subtle); padding:16px;">'
      + '<div class="row between" style="align-items:center; flex-wrap:wrap; gap:10px;">'
      + '<div><div style="display:flex; align-items:center; gap:8px;"><span style="font-size:18px;">🤖</span><h3 style="font-size:16px; font-weight:700; margin:0;">AI Sourcing Strategy Optimizer</h3></div><p class="small" style="color:var(--mute); margin:2px 0 0;">Auto-assign candidate offers using configured MCDA utility weights:</p></div>'
      + '<div class="row" style="gap:6px; flex-wrap:wrap;">'
      + '<button type="button" class="ai-strat-btn ' + (cmp.strategy === 'lowest_cost' ? 'active' : '') + '" data-action="apply-strategy" data-strat="lowest_cost">⚡ Lowest Cost (' + esc(companyProfile.currency_symbol || '₱') + ')</button>'
      + '<button type="button" class="ai-strat-btn ' + (cmp.strategy === 'consolidation' ? 'active' : '') + '" data-action="apply-strategy" data-strat="consolidation">📦 Single Supplier</button>'
      + '<button type="button" class="ai-strat-btn ' + (cmp.strategy === 'resilience' ? 'active' : '') + '" data-action="apply-strategy" data-strat="resilience">🛡️ Stock Resilience</button>'
      + '<button type="button" class="ai-strat-btn ' + (cmp.strategy === 'balanced' ? 'active' : '') + '" data-action="apply-strategy" data-strat="balanced">⚖️ Balanced MCDA</button>'
      + '</div></div></section>'

      + '<section class="card" aria-labelledby="lh">'
      + '<div class="row between" style="align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">'
      + '<h2 id="lh" style="margin:0;">BOM Component Lines &amp; Candidate Quotations</h2>'
      + '<span class="badge gray" style="font-size:11.5px;">Active Pricing Mode: ' + (vatMode === 'both' ? '📊 Dual View (Gross &amp; Net)' : vatMode === 'exclusive' ? '📑 Net of 12% VAT' : '🏷️ VAT-Inclusive (Gross)') + '</span>'
      + '</div>'
      + '<div class="tbl"><table><thead><tr><th>Exact Component</th><th class="num">Qty</th><th>Accredited Supplier Offers (Choose One)</th><th class="num">Line Cost (VAT Detail)</th><th>Status</th></tr></thead><tbody>'
      + r.lines.map((l) => {
          const lv = computeVat(l.line_cost_minor);
          let lineCostDisplay = 'Not counted';
          if (l.line_cost_minor != null) {
            if (vatMode === 'exclusive') {
              lineCostDisplay = '<div class="mono" style="font-weight:700;">' + money(lv.net, r.currency) + '</div>'
                + '<div class="small font-mono" style="color:var(--mute);">Net of 12% VAT</div>'
                + '<div class="small font-mono" style="color:var(--mute);">(Gross: ' + money(lv.gross, r.currency) + ')</div>';
            } else if (vatMode === 'inclusive') {
              lineCostDisplay = '<div class="mono" style="font-weight:700;color:var(--teal);">' + money(lv.gross, r.currency) + '</div>'
                + '<div class="small font-mono" style="color:var(--ok);">&#10003; 12% VAT Included</div>';
            } else {
              lineCostDisplay = '<div class="mono" style="font-weight:700;">' + money(lv.gross, r.currency) + ' <span class="badge ok" style="font-size:9.5px;padding:1px 5px;">VAT Incl</span></div>'
                + '<div class="small font-mono" style="color:var(--mute);margin-top:2px;">Net: ' + money(lv.net, r.currency) + '<br>12% VAT: ' + money(lv.vat, r.currency) + '</div>';
            }
          }

          const reqQuotes = (r.summary && r.summary.required_supplier_quotes) || (companyProfile && companyProfile.required_supplier_quotes) || 3;
          const eligCount = l.eligible_count != null ? l.eligible_count : l.candidates.filter(c => c.eligible).length;
          const quorumBadge = '<div style="margin-bottom:6px; display:flex; align-items:center; gap:6px;">'
            + '<span class="badge ' + (eligCount >= reqQuotes ? 'ok' : 'warn') + '" style="font-size:10px; padding:2px 6px;">'
            + eligCount + ' / ' + reqQuotes + ' Quotes'
            + '</span>'
            + (eligCount < reqQuotes ? '<span class="small" style="color:var(--warn); font-size:11px;">(Below ' + reqQuotes + '-quote quorum)</span>' : '')
            + '</div>';

          return '<tr' + (l.line_status === 'UNRESOLVED' ? ' class="row-bad"' : '') + '><td style="min-width:160px"><div class="mono" style="font-weight:700;">' + esc(l.exact_id) + '</div><div class="small" style="color:var(--mute);">' + esc(l.description) + '</div></td><td class="num font-mono">' + l.quantity + '</td>'
            + '<td style="min-width:320px">' + quorumBadge + (l.candidates.length ? l.candidates.map((c) => candHtml(l, c)).join('') : '<span class="small" style="color:var(--bad);">No supplier quotation recorded for this component.</span>') + '</td>'
            + '<td class="num">' + lineCostDisplay + '</td>'
            + '<td>' + (l.line_status === 'RESOLVED' ? badge('ok', '&#10003; Resolved') : badge('bad', '! Unresolved') + '<div class="small" style="margin-top:4px">' + esc(UNRESOLVED[l.unresolved_reason] || l.unresolved_reason) + '</div>') + '</td></tr>';
        }).join('')
      + '</tbody></table></div></section>'

      + '<section class="demo-tools stack" aria-label="Demo tools"><strong>Catalog Drift Simulation</strong><p class="small">Simulate price drift or catalog update by bumping the first offer. The review fingerprint will reject out-of-date saves until re-evaluated.</p><div><button type="button" data-action="demo-change">Simulate a Catalog Price Drift</button></div></section>',
      preserveScroll
    );
  }

  async function refreshCompare(preserveScroll = true) {
    cmp.result = await API.compare(cmp.id, cmp.selections);
    drawCompare(preserveScroll);
  }

  /* ---------- SAVED SUMMARIES ---------- */
  async function pageSummaries() {
    removeExistingModal();
    loading('Loading summaries...');
    try {
      const list = await API.listSummaries();
      setMain('<div><h1>Saved Sourcing Summaries</h1><p class="sub">Frozen historical snapshots for ' + esc(companyProfile.business_name) + '. Each record permanently preserves the exact prices, supplier sources, and rules active at sign-off.</p></div>'
        + (list.length ? '<div class="stack">' + list.map((x) => '<a class="list-card" href="#/summaries/' + esc(x.id) + '"><div class="row between" style="align-items:center"><div><strong>' + esc(x.title) + '</strong><div class="small">Evaluated by ' + esc(x.author_name || 'BOM Preparer') + ' &middot; ' + esc(fmtTime(x.created_at)) + '</div></div><div class="row" style="align-items:center"><span class="mono" style="font-weight:700;">' + money(x.subtotal_minor, x.currency) + '</span>' + (x.status === 'COMPLETE' ? badge('ok', '&#10003; 100% Complete') : badge('warn', '! Incomplete Lines')) + '</div></div></a>').join('') + '</div>'
          : '<div class="card"><p class="sub">No saved summaries yet. Compare a BOM list and save it.</p><div style="margin-top:12px"><a class="btn primary" href="#/lists">Go to Preparer Workspace</a></div></div>'));
    } catch (e) { errorPage(e); }
  }

  async function pageSummary(id) {
    removeExistingModal();
    loading('Loading summary snapshot...');
    try {
      const x = await API.getSummary(id); 
      const r = x.comparison; 
      const s = r.summary; 
      const complete = s.status === 'COMPLETE';
      const sv = computeVat(s.subtotal_minor);
      
      const aiBriefing = x.ai_executive_summary || (window.PC_AI ? window.PC_AI.generateExecutiveSummary(r, x.title, companyProfile) : 'Summary recorded.');

      setMain(
        '<div class="row between" style="align-items:center"><div><h1>' + esc(x.title) + '</h1><p class="sub">Saved ' + esc(fmtTime(x.created_at)) + ' &middot; policy ' + esc(r.policy_version) + ' (age limit ' + r.policy.max_age_days + ' days, ' + esc(r.currency) + ') &middot; BOM list revision ' + r.list_revision + '</p></div><a class="btn" href="#/summaries">All summaries</a></div>'
        + alertBox('info', '<strong>Frozen Auditable Snapshot:</strong> Values and supplier distributions reflect the exact quotes at the moment of sign-off, completely immune to subsequent catalog updates.')
        
        /* PRINT HEADER (VISIBLE ONLY ON PRINT) */
        + '<div class="print-amgc-header" style="display:none;">'
        + '<h1 style="font-size:22pt; margin:0 0 4px;">' + esc(companyProfile.business_name) + '</h1>'
        + '<div style="font-size:10pt; color:#444;">' + esc(companyProfile.business_type) + ' &bull; ' + esc(companyProfile.location) + '</div>'
        + '<div style="font-size:10pt; margin-top:8px; font-weight:bold;">OFFICIAL BILL OF MATERIALS SOURCING JOB SHEET &bull; ' + esc(x.title) + '</div>'
        + '<div style="font-size:9pt; color:#666;">Snapshot Token: ' + esc(x.save_token) + ' | Fingerprint: ' + esc(r.review_fingerprint) + '</div>'
        + '<div style="margin-top:8px; padding:6px 0; border-top:1px dashed #666; font-size:9.5pt;">'
        + 'Net Sourcing Base: ' + money(sv.net, r.currency) + ' &bull; 12% Value Added Tax: ' + money(sv.vat, r.currency) + ' &bull; <strong>Total Amount Due: ' + money(sv.gross, r.currency) + '</strong>'
        + '</div>'
        + '</div>'

        /* AI EXECUTIVE BRIEFING CARD */
        + '<section class="card stack" style="border-left: 4px solid var(--teal); background: var(--card-subtle);">'
        + '<div class="row between" style="align-items:center; flex-wrap:wrap; gap:10px;">'
        + '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:22px;">🤖</span><div><h2 style="font-size:17px; font-weight:700; margin:0;">AI Executive Sourcing Explanation &amp; Compliance Audit</h2><span class="small" style="color:var(--mute);">Cryptographically fingerprinted decision justification (Hash: ' + esc(r.review_fingerprint) + ')</span></div></div>'
        + '<div class="row" style="gap:8px;"><button type="button" class="btn" data-action="copy-ai-summary" data-id="' + esc(x.id) + '">📋 Copy Briefing</button><button type="button" class="btn primary" data-action="print-job-sheet">🖨️ Print Sourcing Job Sheet</button></div></div>'
        + '<div style="white-space: pre-wrap; font-size:13.5px; line-height:1.6; color:var(--ink); padding: 8px 4px;">' + esc(aiBriefing) + '</div></section>'

        + '<section class="card stack"><div><div class="small">Components Subtotal' + (complete ? '' : ' (Partial)') + ' as Saved</div><div class="total">' + money(s.subtotal_minor, r.currency) + ' <span class="small" style="font-size:14px;font-weight:400;color:var(--mute);">(VAT Included)</span></div><div class="small">' + (complete ? badge('ok', '&#10003; 100% Full Line Coverage') : badge('warn', '! Incomplete') + ' ' + s.unresolved_count + ' unresolved line(s) omitted') + ' &middot; verified supplier quotations</div></div>'
        
        + '<div class="vat-tax-summary-box" style="margin-top:10px; padding:12px 16px; background:var(--card-subtle); border:1px solid var(--line); border-radius:10px;">'
        + '<div style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:8px;">🧾 BIR 12% Value Added Tax (VAT) Calculation:</div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">'
        + '<div><span class="small" style="color:var(--mute);">Net Component Cost:</span> <strong class="font-mono">' + money(sv.net, r.currency) + '</strong></div>'
        + '<div><span class="small" style="color:var(--mute);">12% Value Added Tax:</span> <strong class="font-mono" style="color:#0D9488;">+ ' + money(sv.vat, r.currency) + '</strong></div>'
        + '<div><span class="small" style="color:var(--teal); font-weight:600;">Total (VAT-Inclusive):</span> <strong class="font-mono" style="color:var(--teal);">' + money(sv.gross, r.currency) + '</strong></div>'
        + '</div></div>'
        
        + '<div class="tbl"><table><thead><tr><th>Verified Component</th><th class="num">Qty</th><th>Chosen Offer &amp; Source Attribution</th><th class="num">Unit Price</th><th class="num">Line Cost (VAT Detail)</th></tr></thead><tbody>'
        + r.lines.map((l) => { 
          const sel = l.candidates.find((c) => c.offer_id === l.selected_offer_id);
          const lv = computeVat(l.line_cost_minor);
          const lineCostDisplay = lv.gross != null 
            ? '<div class="mono" style="font-weight:700;">' + money(lv.gross, r.currency) + '</div><div class="small font-mono" style="color:var(--mute);font-size:11px;">Net: ' + money(lv.net, r.currency) + '<br>VAT: ' + money(lv.vat, r.currency) + '</div>'
            : 'Not counted';

          return '<tr' + (sel ? '' : ' class="row-bad"') + '><td><div class="mono" style="font-weight:700;">' + esc(l.exact_id) + '</div><div class="small" style="color:var(--mute);">' + esc(l.description) + '</div></td><td class="num font-mono">' + l.quantity + '</td><td>'
            + (sel ? '<strong>' + esc(sel.supplier_name) + '</strong><div class="small" style="color:var(--mute);">Checked ' + fmtDate(sel.checked_date) + ' &middot; ' + esc(sel.source_reference) + '</div>' : badge('bad', '! Unresolved') + '<div class="small">' + esc(UNRESOLVED[l.unresolved_reason] || l.unresolved_reason) + '</div>')
            + (l.candidates.length ? '<details style="margin-top:6px"><summary class="small" style="cursor:pointer;color:var(--teal);">' + l.candidates.length + ' supplier offer(s) considered</summary>' + l.candidates.map((c) => '<div class="small" style="margin-top:4px">' + esc(c.supplier_name) + ': ' + money(c.price_minor, c.currency) + ', stock ' + (c.recorded_quantity == null ? 'missing' : c.recorded_quantity) + ', checked ' + fmtDate(c.checked_date) + ' &mdash; ' + (c.eligible ? badge('ok', 'Eligible') : badge('bad', 'Excluded: ' + c.reasons.map((q) => esc(REASONS[q] || q)).join('; '))) + '</div>').join('') + '</details>' : '')
            + '</td><td class="num font-mono">' + (sel ? money(sel.price_minor, sel.currency) : 'Not available') + '</td><td class="num font-mono">' + lineCostDisplay + '</td></tr>'; 
        }).join('')
        + '</tbody></table></div></section>'
      );
    } catch (e) { errorPage(e); }
  }

  /* ---------- ROUTER ---------- */
  async function route() {
    const h = location.hash || '#/';
    try {
      if (h === '#/logout') {
        await API.logout();
        me = null;
        return go('#/login');
      }
      if (h === '#/about') return pageAbout();
      if (h === '#/faqs') return pageFaqs();

      if (!me) { 
        try { me = await API.me(); } 
        catch (e) { me = null; } 
      }
      if (!me && (h === '#/' || h === '#')) return pageLanding();
      if (!me && h !== '#/login') { return pageLogin(); }
      if (h === '#/login') { 
        if (me) return go('#/'); 
        return pageLogin(); 
      }
      
      let m;
      if (h === '#/' ) return pageHome();
      if (h === '#/catalog') { offerForm = null; return pageCatalog(); }
      if (h === '#/lists') return pageLists();
      if ((m = h.match(/^#\/lists\/(.+)$/))) return pageEditor(m[1]);
      if ((m = h.match(/^#\/compare\/(.+)$/))) return pageCompare(m[1]);
      if (h === '#/summaries') return pageSummaries();
      if ((m = h.match(/^#\/summaries\/(.+)$/))) return pageSummary(m[1]);
      setMain('<div class="card"><h1>Page not found</h1><a href="#/">Go back</a></div>');
    } catch (e) { errorPage(e); }
  }
  window.addEventListener('hashchange', route);

  /* ---------- EVENT HANDLERS ---------- */
  document.addEventListener('submit', async (ev) => {
    const f = ev.target; 
    ev.preventDefault();
    try {
      if (f.id === 'login') {
        const u = f.u.value.trim();
        try { 
          me = await API.login(u, f.p.value); 
          go('#/'); 
        } catch (e) { 
          pageLogin(e.message, u); 
        }
      } else if (f.id === 'signup-request') {
        const name = document.getElementById('req-name').value.trim();
        const user = document.getElementById('req-user').value.trim();
        const role = document.getElementById('req-role').value;
        const pass = document.getElementById('req-pass').value;
        const passConf = document.getElementById('req-pass-confirm').value;
        const pin = (document.getElementById('req-pin') ? document.getElementById('req-pin').value : '').trim();
        const secQ = document.getElementById('req-sec-q') ? document.getElementById('req-sec-q').value : SECURITY_QUESTIONS[0];
        const secA = (document.getElementById('req-sec-a') ? document.getElementById('req-sec-a').value : '').trim();
        const alertBoxEl = document.getElementById('signup-alert-box');
        const submitBtn = document.getElementById('btn-submit-signup');

        if (!name || !user) {
          if (window.__setSignupStep) window.__setSignupStep(1);
          if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', 'Full Name and Desired Username are required.', 'alert');
          return;
        }

        if (pass !== passConf) {
          if (window.__setSignupStep) window.__setSignupStep(1);
          if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', 'Passwords do not match. Please verify and re-type your password.', 'alert');
          return;
        }

        if (pass.length < 4) {
          if (window.__setSignupStep) window.__setSignupStep(1);
          if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', 'Password must be at least 4 characters long.', 'alert');
          return;
        }

        if (!pin || !secA) {
          if (window.__setSignupStep) window.__setSignupStep(2);
          if (alertBoxEl) alertBoxEl.innerHTML = alertBox('warn', 'Please configure your 6-Digit Security PIN and Secret Security Answer on Step 2 to protect your account against impostors.', 'alert');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting Request...';
        }

        try {
          await API.submitAccountRequest({
            name,
            username: user,
            role,
            password: pass,
            recovery_pin: pin,
            security_question: secQ,
            security_answer: secA
          });
          f.reset();
          if (window.__setSignupStep) window.__setSignupStep(1);
          if (alertBoxEl) {
            alertBoxEl.innerHTML = alertBox('ok', '✓ Account request & anti-impostor recovery credentials submitted! Your account is now pending Administrator approval in the Admin Console.', 'status');
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Account Request';
          }
        } catch (err) {
          if (alertBoxEl) alertBoxEl.innerHTML = alertBox('bad', esc(err.message), 'alert');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Account Request';
          }
        }
      } else if (f.id === 'fp-lookup-form') {
        const uname = (document.getElementById('fp-username') ? document.getElementById('fp-username').value : '').trim();
        if (!fpState) fpState = { step: 1, username: uname, verifyMode: 'both' };
        fpState.username = uname;
        try {
          const ch = await API.getRecoveryChallenge(uname);
          fpState.step = 2;
          fpState.username = ch.username;
          fpState.challenge = ch;
          fpState.verifyMode = 'both';
          fpState.pin = '';
          fpState.secAnswer = '';
          fpState.newPass = '';
          fpState.confirmPass = '';
          fpState.error = '';
          renderForgotPasswordModal();
        } catch (err) {
          fpState.error = err.message;
          renderForgotPasswordModal();
        }
      } else if (f.id === 'forgot-password-form') {
        if (!fpState || !fpState.challenge) return;
        const pinEl = document.getElementById('fp-pin');
        const ansEl = document.getElementById('fp-sec-answer');
        const newPass = document.getElementById('fp-new-pass') ? document.getElementById('fp-new-pass').value : '';
        const confPass = document.getElementById('fp-confirm-pass') ? document.getElementById('fp-confirm-pass').value : '';
        fpState.pin = pinEl ? pinEl.value.trim() : '';
        fpState.secAnswer = ansEl ? ansEl.value : '';
        fpState.newPass = newPass;
        fpState.confirmPass = confPass;

        if (newPass.length < 4) {
          fpState.error = 'New password must be at least 4 characters long.';
          renderForgotPasswordModal();
          return;
        }
        if (newPass !== confPass) {
          fpState.error = 'New passwords do not match. Please verify and re-type.';
          renderForgotPasswordModal();
          return;
        }

        try {
          const res = await API.submitPasswordReset({
            username: fpState.username,
            pin: pinEl ? fpState.pin : '',
            security_answer: ansEl ? fpState.secAnswer : '',
            new_password: newPass
          });
          fpState.step = 3;
          fpState.error = '';
          fpState.mode = res.mode;
          fpState.successMsg = res.message;
          renderForgotPasswordModal();
        } catch (err) {
          fpState.error = err.message;
          renderForgotPasswordModal();
        }
      } else if (f.id === 'my-security-form') {
        const curPass = document.getElementById('sec-cur-pass') ? document.getElementById('sec-cur-pass').value : '';
        const newPin = document.getElementById('sec-new-pin') ? document.getElementById('sec-new-pin').value.trim() : '';
        const newQ = document.getElementById('sec-new-q') ? document.getElementById('sec-new-q').value : SECURITY_QUESTIONS[0];
        const newA = document.getElementById('sec-new-a') ? document.getElementById('sec-new-a').value : '';
        try {
          await API.updateMySecuritySettings({
            current_password: curPass,
            recovery_pin: newPin,
            security_question: newQ,
            security_answer: newA
          });
          await renderMySecurityModal('', '✓ Your 6-Digit Recovery PIN and Security Question have been updated!');
        } catch (err) {
          await renderMySecurityModal(err.message, '');
        }
      } else if (f.id === 'newlist') {
        const title = document.getElementById('nl').value;
        try { 
          const l = await API.createList(title); 
          go('#/lists/' + l.id); 
        } catch (e) { 
          const el = document.getElementById('nl-err'); 
          el.hidden = false; 
          el.textContent = (e.field_errors && e.field_errors.title) || e.message; 
          document.getElementById('nl').setAttribute('aria-invalid', 'true'); 
          document.getElementById('nl').setAttribute('aria-describedby', 'nl-err'); 
          document.getElementById('nl').focus(); 
        }
      } else if (f.id === 'editor') {
        const lines = ed.lines.map((l) => ({ 
          id: l.id, 
          part_id: l.part_id, 
          quantity: /^\d+$/.test(String(l.quantity).trim()) ? parseInt(l.quantity, 10) : NaN 
        }));
        try {
          const saved = await API.updateList(ed.id, ed.revision, ed.title, lines, ed.archived);
          ed.revision = saved.revision; 
          ed.lines = saved.lines.map((l) => ({ id: l.id, part_id: l.part_id, quantity: String(l.quantity) }));
          ed.errors = null; ed.error = null; ed.saved = true; ed.dirty = false; ed.conflict = false; 
          drawEditor(true);
        } catch (e) { 
          ed.errors = e.field_errors || null; 
          ed.error = e.message; 
          ed.conflict = e.code === 'REVISION_CONFLICT'; 
          ed.saved = false; 
          drawEditor(true); 
        }
      } else if (f.id === 'policy') {
        const raw = (f.pa || document.getElementById('pa')).value.trim();
        const curInput = (f.pc || document.getElementById('pc')).value.trim().toUpperCase();
        const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
        try { 
          const updated = await API.setPolicy(n, curInput); 
          cmp.policy = updated;
          cmp.settingErrors = null;
          cmp.result = await API.compare(cmp.id, cmp.selections);
          drawCompare(true);
        } catch (e) { 
          cmp.settingErrors = e.field_errors || { max_age_days: e.message }; 
          drawCompare(true); 
        }
      } else if (f.id === 'offerform') {
        const o = offerForm; 
        const e0 = {};
        const price = String(o.price).trim(); 
        const qty = String(o.recorded_quantity).trim();
        let price_minor = null, recorded_quantity = null;
        if (price !== '') { 
          if (/^\d+(\.\d{1,2})?$/.test(price)) price_minor = Math.round(parseFloat(price) * 100); 
          else e0.price = 'Enter a valid amount like 380 or 380.50.'; 
        }
        if (qty !== '') { 
          if (/^\d+$/.test(qty)) recorded_quantity = parseInt(qty, 10); 
          else e0.recorded_quantity = 'Quantity must be a positive whole number.'; 
        }
        if (Object.keys(e0).length) { 
          o.errors = e0; 
          o.error = 'Please fix the highlighted fields.'; 
          o.isOpen = true;
          return renderCatalogModal(); 
        }
        try {
          await API.saveOffer({ 
            id: o.id, revision: o.revision, part_id: o.part_id, supplier_id: o.supplier_id, 
            price_minor, currency: o.currency || companyProfile.currency_code, price_basis: o.price_basis, 
            recorded_quantity, checked_date: o.checked_date, source_reference: o.source_reference, active: o.active 
          });
          const wasEdit = !!o.id; 
          removeExistingModal();
          offerForm = null;
          const [parts, offers, sups] = await Promise.all([API.listParts(), API.listOffers(), API.listSuppliers()]);
          window.__cat = { parts, offers, sups }; 
          drawCatalog('', wasEdit ? 'Offer updated successfully.' : 'New offer added to catalog.');
        } catch (e) { 
          o.errors = e.field_errors || null; 
          o.error = e.message; 
          o.isOpen = true;
          renderCatalogModal(); 
        }
      } else if (f.id === 'supplier-form') {
        const name = (document.getElementById('sup-name') ? document.getElementById('sup-name').value : '').trim();
        const location = (document.getElementById('sup-location') ? document.getElementById('sup-location').value : '').trim();
        const contact = (document.getElementById('sup-contact') ? document.getElementById('sup-contact').value : '').trim();
        const accredited = document.getElementById('sup-accredited') ? document.getElementById('sup-accredited').checked : true;

        if (!name) {
          if (supplierForm) {
            supplierForm.error = 'Supplier company name is required.';
            renderSupplierModal();
          }
          return;
        }

        try {
          if (supplierForm && supplierForm.id) {
            await API.updateSupplier(supplierForm.id, { name, location, contact, accredited });
            supplierForm = null;
            removeExistingModal();
            pageAdmin(`Accredited vendor "${name}" updated successfully!`);
          } else {
            await API.createSupplier({ name, location, contact, accredited });
            supplierForm = null;
            removeExistingModal();
            pageAdmin(`Accredited vendor "${name}" registered into enterprise directory!`);
          }
        } catch (err) {
          if (supplierForm) {
            supplierForm.error = err.message;
            renderSupplierModal();
          }
        }
      }
    } catch (e) { errorPage(e); }
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target; 
    const b = t.getAttribute && t.getAttribute('data-bind'); 
    if (b === 'ed.title') { ed.title = t.value; ed.dirty = true; }
    else if (b === 'line.qty') { ed.lines[+t.dataset.i].quantity = t.value; ed.dirty = true; }
    else if (b && b.startsWith('of.') && b !== 'of.active') { if (offerForm) offerForm[b.slice(3)] = t.value; }
    else if (b === 'catsearch') { 
      drawCatalog(t.value); 
      const q = document.getElementById('q'); 
      if (q) { q.focus(); q.setSelectionRange(t.value.length, t.value.length); }
    }
    else if (b === 'mcda-input') {
      const c = parseInt(document.getElementById('mcda-cost').value, 10) || 0;
      const s = parseInt(document.getElementById('mcda-stock').value, 10) || 0;
      const f = parseInt(document.getElementById('mcda-freshness').value, 10) || 0;
      const con = parseInt(document.getElementById('mcda-consolidation').value, 10) || 0;

      const cEl = document.getElementById('mcda-cost-val');
      const sEl = document.getElementById('mcda-stock-val');
      const fEl = document.getElementById('mcda-freshness-val');
      const conEl = document.getElementById('mcda-consolidation-val');
      if (cEl) cEl.textContent = c + '%';
      if (sEl) sEl.textContent = s + '%';
      if (fEl) fEl.textContent = f + '%';
      if (conEl) conEl.textContent = con + '%';

      const sum = c + s + f + con;
      const badgeEl = document.getElementById('mcda-total-badge');
      const saveBtn = document.getElementById('saveMcdaBtn');
      if (badgeEl) {
        if (sum === 100) {
          badgeEl.className = 'badge ok';
          badgeEl.textContent = 'Total: 100% ✓ Balanced';
          if (saveBtn) saveBtn.disabled = false;
        } else {
          badgeEl.className = 'badge bad';
          badgeEl.textContent = 'Total: ' + sum + '% ⚠️ Must equal 100%';
          if (saveBtn) saveBtn.disabled = true;
        }
      }
    }
  });

  document.addEventListener('change', async (ev) => {
    const t = ev.target; 
    const b = t.getAttribute && t.getAttribute('data-bind'); 
    if (!b) return;
    try {
      if (b === 'line.part') { 
        ed.lines[+t.dataset.i].part_id = t.value; 
        ed.dirty = true;
        drawEditor(true);
      }
      else if (b === 'ed.archived') { ed.archived = t.checked; ed.dirty = true; }
      else if (b === 'of.active') { if (offerForm) offerForm.active = t.checked; }
      else if (b.startsWith('of.')) { if (offerForm) offerForm[b.slice(3)] = t.value; }
      else if (b === 'select') { 
        cmp.selections[t.dataset.line] = t.value; 
        cmp.error = null; 
        await refreshCompare(true); 
      }
      else if (b === 'cat-sup-filter') {
        catalogSupplierFilter = t.value;
        drawCatalog(document.getElementById('q') ? document.getElementById('q').value : '', null, true);
      }
    } catch (e) { errorPage(e); }
  });

  function handleOpenLogin(ev) {
    if (me) {
      if (ev) ev.preventDefault();
      go('#/');
      return;
    }
    const slider = document.getElementById('loginSlider');
    if (slider) {
      if (ev) ev.preventDefault();
      slider.classList.remove('right-panel-active');
      const sip = slider.querySelector('.signin-panel');
      if (sip) sip.scrollTop = 0;
      if (location.hash !== '#/login') {
        history.replaceState(null, '', '#/login');
      }
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setTimeout(() => {
        const u = document.getElementById('u');
        if (u) u.focus();
      }, 120);
      return;
    }
    if (location.hash === '#/login') {
      if (ev) ev.preventDefault();
      pageLogin();
      return;
    }
    if (ev) ev.preventDefault();
    go('#/login');
  }

  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-action]'); 
    if (!t) {
      const a = ev.target.closest('a[aria-disabled="true"]'); 
      if (a) { ev.preventDefault(); return; }
      const loginLink = ev.target.closest('a[href="#/login"]');
      if (loginLink) { handleOpenLogin(ev); return; }
      return;
    }
    const act = t.dataset.action;
    try {
      if (act === 'open-login') {
        handleOpenLogin(ev);
      }
      else if (act === 'logout') { 
        await API.logout(); 
        me = null; 
        go('#/'); 
      }
      else if (act === 'scroll') { 
        const targetId = t.dataset.target;
        const el = document.getElementById(targetId); 
        if (el) {
          el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); 
        } else {
          window.__pendingScrollTarget = targetId;
          go('#/');
        }
      }
      else if (act === 'quick-login') { 
        try { 
          me = await API.login(t.dataset.u, 'demo', true); 
          go('#/'); 
        } catch (e) { 
          pageLogin(e.message); 
        } 
      }
      else if (act === 'open-forgot-password') {
        const typedU = document.getElementById('u') ? document.getElementById('u').value.trim() : '';
        fpState = {
          step: 1,
          username: typedU,
          challenge: null,
          verifyMode: 'both',
          pin: '',
          secAnswer: '',
          newPass: '',
          confirmPass: '',
          error: '',
          successMsg: '',
          mode: ''
        };
        renderForgotPasswordModal();
        setTimeout(() => {
          const el = document.getElementById('fp-username');
          if (el) el.focus();
        }, 60);
      }
      else if (act === 'close-forgot-password') {
        fpState = null;
        removeExistingModal();
      }
      else if (act === 'fp-change-user') {
        if (fpState) {
          fpState.step = 1;
          fpState.challenge = null;
          fpState.error = '';
          renderForgotPasswordModal();
          setTimeout(() => {
            const el = document.getElementById('fp-username');
            if (el) el.focus();
          }, 60);
        }
      }
      else if (act === 'fp-set-verify-mode') {
        if (fpState) {
          const pEl = document.getElementById('fp-pin');
          if (pEl) fpState.pin = pEl.value.trim();
          const aEl = document.getElementById('fp-sec-answer');
          if (aEl) fpState.secAnswer = aEl.value;
          const npEl = document.getElementById('fp-new-pass');
          if (npEl) fpState.newPass = npEl.value;
          const cpEl = document.getElementById('fp-confirm-pass');
          if (cpEl) fpState.confirmPass = cpEl.value;
          fpState.verifyMode = t.dataset.mode || 'both';
          fpState.error = '';
          renderForgotPasswordModal();
        }
      }
      else if (act === 'open-my-security-modal') {
        await renderMySecurityModal();
      }
      else if (act === 'close-my-security-modal') {
        removeExistingModal();
      }
      else if (act === 'add-line') { 
        ed.lines.push({ id: null, part_id: '', quantity: '1' }); 
        ed.dirty = true; 
        drawEditor(true); 
        const sel = document.getElementById('lp' + (ed.lines.length - 1)); 
        if (sel) sel.focus(); 
      }
      else if (act === 'remove-line') { 
        ed.lines.splice(+t.dataset.i, 1); 
        ed.dirty = true; 
        ed.errors = null; 
        drawEditor(true); 
      }
      else if (act === 'reload-list') { 
        pageEditor(ed.id); 
      }

      /* MODULE 1: ENTERPRISE BUSINESS PROFILE ACTIONS */
      else if (act === 'save-company-profile') {
        const nameInput = document.getElementById('prof-name');
        const typeInput = document.getElementById('prof-type');
        const locInput = document.getElementById('prof-location');
        const currInput = document.getElementById('prof-curr-code');
        const symInput = document.getElementById('prof-curr-symbol');
        const ageInput = document.getElementById('prof-age');
        const minSupInput = document.getElementById('prof-min-suppliers');

        const profileData = {
          business_name: nameInput ? nameInput.value : companyProfile.business_name,
          business_type: typeInput ? typeInput.value : companyProfile.business_type,
          location: locInput ? locInput.value : companyProfile.location,
          currency_code: currInput ? currInput.value : companyProfile.currency_code,
          currency_symbol: symInput ? symInput.value : companyProfile.currency_symbol,
          max_quote_age_days: ageInput ? parseInt(ageInput.value, 10) : 14,
          required_supplier_quotes: minSupInput ? parseInt(minSupInput.value, 10) : 3
        };

        const updated = await API.saveCompanyProfile(profileData);
        applyBranding(updated);
        pageAdmin('Enterprise business profile saved and synchronized with Supabase Cloud!');
      }

      /* MODULE 1B: ACCREDITED SUPPLIER DIRECTORY ACTIONS */
      else if (act === 'open-add-supplier-modal') {
        supplierForm = { id: null, name: '', location: '', contact: '', accredited: true, isOpen: true, error: null };
        renderSupplierModal();
      }
      else if (act === 'edit-supplier') {
        const suppliers = await API.listSuppliers();
        const sup = suppliers.find(x => x.id === t.dataset.id);
        if (sup) {
          supplierForm = {
            id: sup.id,
            name: sup.name,
            location: sup.location || '',
            contact: sup.contact || '',
            accredited: sup.accredited !== false,
            isOpen: true,
            error: null
          };
          renderSupplierModal();
        }
      }
      else if (act === 'close-supplier-modal') {
        supplierForm = null;
        removeExistingModal();
      }
      else if (act === 'toggle-supplier-status') {
        const supId = t.dataset.id;
        try {
          await API.toggleSupplierStatus(supId);
          pageAdmin('Supplier accreditation status updated.');
        } catch (err) {
          alert('Error updating supplier status: ' + err.message);
        }
      }

      /* MODULE 3: SAVE MCDA WEIGHTS */
      else if (act === 'save-mcda-weights') {
        const cost = parseInt(document.getElementById('mcda-cost').value, 10) || 0;
        const stock = parseInt(document.getElementById('mcda-stock').value, 10) || 0;
        const freshness = parseInt(document.getElementById('mcda-freshness').value, 10) || 0;
        const consolidation = parseInt(document.getElementById('mcda-consolidation').value, 10) || 0;

        await API.saveMcdaWeights({ cost, stock, freshness, consolidation });
        pageAdmin('MCDA utility weights updated and synchronized to Supabase Cloud!');
      }

      /* MODULE 2: STAFF SUCCESSION & STATUS TOGGLE */
      else if (act === 'promote-staff') {
        const staffId = t.dataset.id;
        await API.promoteStaffToAdmin(staffId);
        pageAdmin('Staff member successfully promoted to Administrator for succession handover.');
      }
      else if (act === 'toggle-staff-status') {
        const staffId = t.dataset.id;
        try {
          await API.toggleStaffStatus(staffId);
          pageAdmin('Staff account status toggled.');
        } catch (err) {
          alert(err.message);
        }
      }

      /* MODULE 2B: ACCOUNT ACCESS REQUESTS (APPROVE / REJECT) */
      else if (act === 'approve-account-request') {
        const reqId = t.dataset.id;
        try {
          const res = await API.approveAccountRequest(reqId);
          pageAdmin(`Staff account for ${res.user.name} (@${res.user.username}) approved and activated!`);
        } catch (err) {
          alert('Error approving request: ' + err.message);
        }
      }
      else if (act === 'reject-account-request') {
        const reqId = t.dataset.id;
        if (confirm('Are you sure you want to decline this registration request?')) {
          try {
            await API.rejectAccountRequest(reqId);
            pageAdmin('Staff account request declined.');
          } catch (err) {
            alert('Error rejecting request: ' + err.message);
          }
        }
      }

      /* MODULE 2C: IDENTITY-VERIFIED PASSWORD RESET REQUESTS (APPROVE / REJECT) */
      else if (act === 'approve-password-reset') {
        const pwrId = t.dataset.id;
        try {
          const res = await API.approvePasswordResetRequest(pwrId);
          pageAdmin(`Verified password reset for ${res.user.name} (@${res.user.username}) approved and activated!`);
        } catch (err) {
          alert('Error approving password reset: ' + err.message);
        }
      }
      else if (act === 'reject-password-reset') {
        const pwrId = t.dataset.id;
        if (confirm('Are you sure you want to decline this password reset request?')) {
          try {
            await API.rejectPasswordResetRequest(pwrId);
            pageAdmin('Password reset request declined.');
          } catch (err) {
            alert('Error declining password reset: ' + err.message);
          }
        }
      }

      /* MODULE 4: REFRESH AUDIT LOGS */
      else if (act === 'refresh-audit-logs') {
        pageAdmin('Audit event ledger refreshed.');
      }
      
      /* CATALOG MODAL ACTIONS */
      else if (act === 'download-csv-template') {
        downloadSupplierCsvTemplate();
      }
      else if (act === 'upload-supplier-csv') {
        const fileInput = document.getElementById('supplier-csv-input');
        if (fileInput) fileInput.click();
      }
      else if (act === 'open-add-offer-modal') {
        offerForm = { 
          id: null, revision: null, part_id: '', supplier_id: '', price: '', 
          currency: companyProfile.currency_code || 'PHP', price_basis: 'per_piece', recorded_quantity: '', 
          checked_date: new Date().toISOString().slice(0, 10), source_reference: '', active: true, 
          errors: null, error: null, isOpen: true 
        };
        renderCatalogModal();
      }
      else if (act === 'edit-offer') {
        const o = window.__cat.offers.find((x) => x.id === t.dataset.id);
        offerForm = { 
          id: o.id, revision: o.revision, part_id: o.part_id, supplier_id: o.supplier_id, 
          price: o.price_minor == null ? '' : (o.price_minor / 100).toFixed(2), 
          currency: o.currency || companyProfile.currency_code, price_basis: o.price_basis, 
          recorded_quantity: o.recorded_quantity == null ? '' : String(o.recorded_quantity), 
          checked_date: o.checked_date || '', source_reference: o.source_reference || '', 
          active: o.active, errors: null, error: null, isOpen: true 
        };
        renderCatalogModal();
      }
      else if (act === 'close-offer-modal') {
        removeExistingModal();
        offerForm = null;
      }
      else if (act === 'set-catalog-filter') {
        catalogFilter = t.dataset.val;
        drawCatalog(document.getElementById('q') ? document.getElementById('q').value : '', null, true);
      }

      /* AI CSV IMPORT MODAL ACTIONS */
      else if (act === 'open-ai-import-modal') {
        renderAiImportModal();
      }
      else if (act === 'close-ai-import-modal') {
        removeExistingModal();
      }
      else if (act === 'load-ai-sample-1') {
        const ta = document.getElementById('aiCsvInput');
        if (ta) {
          ta.value = "45uf dual run capacitor 450v, 2\ndefrost contactor 30a 1-pole, 1\nr410a virgin freon sealed canister 1kg, 2";
        }
      }
      else if (act === 'load-ai-sample-2') {
        const ta = document.getElementById('aiCsvInput');
        if (ta) {
          ta.value = "precision temp sensor probe ntc 10k, 3\nuniversal split ac control board system, 1";
        }
      }
      else if (act === 'run-ai-csv-parse') {
        const ta = document.getElementById('aiCsvInput');
        const raw = ta ? ta.value : '';
        if (!raw.trim()) {
          alert('Please enter or paste at least one line item.');
          return;
        }
        if (window.PC_AI && typeof window.PC_AI.parseCsvImport === 'function') {
          parsedAiRows = window.PC_AI.parseCsvImport(raw, ed.parts);
          const resultsEl = document.getElementById('aiCsvResults');
          if (resultsEl) {
            resultsEl.style.display = 'block';
            resultsEl.innerHTML = `
              <div class="card stack" style="background:var(--card-subtle); padding:12px;">
                <div class="row between" style="align-items:center;">
                  <strong>AI Match Results (${parsedAiRows.filter(r => r.matchedPart).length} of ${parsedAiRows.length} recognized):</strong>
                  <button type="button" class="btn primary" data-action="apply-ai-csv-import">Import Matched Items to BOM</button>
                </div>
                <div class="tbl" style="margin-top:8px;">
                  <table>
                    <thead><tr><th>Raw Input</th><th>AI Matched Exact Part</th><th class="num">Confidence</th><th class="num">Qty</th></tr></thead>
                    <tbody>
                      ${parsedAiRows.map(r => `
                        <tr>
                          <td class="small mono">${esc(r.extractedDescription)}</td>
                          <td>
                            ${r.matchedPart 
                              ? `<strong style="color:var(--ink);">${esc(r.matchedPart.exact_id)}</strong><div class="small" style="color:var(--mute);">${esc(r.matchedPart.description)}</div>` 
                              : `<span class="badge bad">Unrecognized</span>`}
                          </td>
                          <td class="num"><span class="badge ${r.confidence >= 70 ? 'ok' : r.confidence >= 40 ? 'warn' : 'bad'}">${r.confidence}%</span></td>
                          <td class="num font-mono">${r.quantity}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }
        }
      }
      else if (act === 'apply-ai-csv-import') {
        if (!parsedAiRows || !parsedAiRows.length) return;
        const matched = parsedAiRows.filter(r => r.matchedPart);
        if (!matched.length) {
          alert('No confident matches found to import.');
          return;
        }
        for (const item of matched) {
          const existing = ed.lines.find(l => l.part_id === item.matchedPart.id);
          if (existing) {
            existing.quantity = String((parseInt(existing.quantity, 10) || 0) + item.quantity);
          } else {
            ed.lines.push({ id: null, part_id: item.matchedPart.id, quantity: String(item.quantity) });
          }
        }
        ed.dirty = true;
        removeExistingModal();
        drawEditor(true);
      }

      /* VAT PRICING VIEW CONTROLS */
      else if (act === 'set-vat-mode') {
        if (cmp) {
          cmp.vatMode = t.dataset.mode;
          drawCompare(true);
        }
      }

      /* AI SOURCING STRATEGY APPLICATION */
      else if (act === 'apply-strategy') {
        cmp.strategy = t.dataset.strat;
        if (window.PC_AI && typeof window.PC_AI.recommendStrategy === 'function') {
          const weights = await API.getMcdaWeights();
          cmp.selections = window.PC_AI.recommendStrategy(cmp.result, cmp.strategy, weights);
          await refreshCompare(true);
        }
      }

      /* COMPARE ACTIONS */
      else if (act === 'rereview') { 
        cmp.error = null; 
        cmp.saveState = 'idle'; 
        cmp.token = API.newToken(); 
        await refreshCompare(true); 
      }
      else if (act === 'demo-change') {
        const l = cmp.result.lines[0]; 
        if (l && l.candidates[0]) { 
          await API.bumpOfferForDemo(l.candidates[0].offer_id); 
        }
        cmp.error = null; 
        drawCompare(true);
      }
      else if (act === 'save-summary') {
        const r = cmp.result; 
        cmp.saveState = 'saving'; 
        cmp.error = null; 
        drawCompare(true);
        try {
          const sm = await API.saveSummary(cmp.id, { 
            list_revision: r.list_revision, 
            selections: cmp.selections, 
            policy_version: r.policy_version, 
            review_fingerprint: r.review_fingerprint, 
            save_token: cmp.token 
          });
          cmp.saveState = 'saved'; 
          cmp.savedId = sm.id; 
          drawCompare(true);
        } catch (e) { 
          cmp.saveState = e.code === 'INPUT_CHANGED' ? 'idle' : 'failed'; 
          cmp.error = e; 
          drawCompare(true); 
        }
      }

      /* SOURCING SUMMARY ACTIONS */
      else if (act === 'copy-ai-summary') {
        const summaryId = t.dataset.id;
        const x = await API.getSummary(summaryId);
        const textToCopy = x.ai_executive_summary || (window.PC_AI ? window.PC_AI.generateExecutiveSummary(x.comparison, x.title, companyProfile) : 'Summary text');
        await navigator.clipboard.writeText(textToCopy);
        const oldText = t.textContent;
        t.textContent = '✓ Copied to Clipboard!';
        setTimeout(() => { t.textContent = oldText; }, 2000);
      }
      else if (act === 'print-job-sheet') {
        window.print();
      }

      /* SUPABASE CLOUD TEST & SYNC */
      else if (act === 'test-cloud-connection') {
        const out = document.getElementById('cloudStatusOutput');
        if (out) out.textContent = 'Testing connection to Supabase Cloud...';
        const res = await API.getCloudStatus();
        if (out) {
          out.textContent = res.connected 
            ? `🟢 Supabase Connected! Latency: ${res.latencyMs}ms | Cloud offers table rows: ${res.offersCount}`
            : `⚠️ Supabase offline / error: ${res.message}`;
        }
      }
      else if (act === 'sync-cloud-data') {
        const out = document.getElementById('cloudStatusOutput');
        if (out) out.textContent = 'Synchronizing local catalog & BOM lists to Supabase PostgreSQL...';
        try {
          const res = await API.syncToCloud();
          let summaryMsg = `✓ Successfully synchronized ${res.offersSynced} offers and ${res.listsSynced} BOM lists to Supabase Cloud!`;
          if (res.summariesSynced) summaryMsg += ` (${res.summariesSynced} snapshots preserved)`;
          if (res.companySettingsSynced) summaryMsg += ' Enterprise profile synchronized.';
          if (out) out.textContent = summaryMsg;
        } catch (err) {
          if (out) out.textContent = '⚠️ Cloud sync error: ' + err.message;
        }
      }
    } catch (e) { errorPage(e); }
  });

  /* ---------- SUPABASE REALTIME EVENT LISTENERS ---------- */
  window.addEventListener('pc:realtime-catalog', async (e) => {
    if (location.hash === '#/catalog' && typeof drawCatalog === 'function') {
      try {
        const [parts, offers, sups] = await Promise.all([API.listParts(), API.listOffers(), API.listSuppliers()]);
        window.__cat = { parts, offers, sups };
        drawCatalog('', '⚡ Live Realtime update: Catalog quotation synced from Supabase!');
      } catch (err) {}
    }
  });

  window.addEventListener('pc:realtime-branding', (e) => {
    if (e.detail && typeof applyBranding === 'function') {
      applyBranding(e.detail);
    }
  });

  window.addEventListener('pc:realtime-audit', (e) => {
    if ((location.hash === '#/' || location.hash === '') && typeof pageAdmin === 'function') {
      const card = document.getElementById('admin-audit-ledger-card');
      if (card) {
        pageAdmin();
      }
    }
  });

  window.addEventListener('pc:realtime-status', (e) => {
    const badge = document.getElementById('supabaseRealtimeBadge');
    if (badge) {
      badge.textContent = e.detail === 'SUBSCRIBED' ? '⚡ Realtime Synchronized' : '🟡 ' + e.detail;
      badge.className = e.detail === 'SUBSCRIBED' ? 'badge ok' : 'badge warn';
    }
  });

  const srStyle = document.createElement('style');
  srStyle.textContent = '.sr{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
  document.head.appendChild(srStyle);

  /* ---------- GLOBAL HELP & AI COPILOT WIDGET ---------- */
  const helpArticles = [
    { title: 'Supplier Onboarding & Designated Catalog Upload', category: 'Suppliers', url: '#/faqs', desc: 'How to register new vendors and upload their designated component price lists.' },
    { title: 'Quote Freshness Rule & Validity Policies', category: 'Policy', url: '#/faqs', desc: 'Why component quotations expire after the configured age threshold.' },
    { title: 'Why Unresolved Parts Are Never Treated as ₱0.00', category: 'Pricing', url: '#/faqs', desc: 'Eliminates hidden markups and dangerous budget underestimation.' },
    { title: 'Preserved Sourcing Snapshots & Frozen Summaries', category: 'Audit', url: '#/faqs', desc: 'Immutable records that resist catalog drift.' },
    { title: 'Dynamic Multi-Criteria Decision Analysis (MCDA)', category: 'Engine', url: '#/', desc: 'How utility weights balance cost, stock, freshness, and consolidation.' },
    { title: 'Supabase Cloud PostgreSQL Architecture', category: 'Cloud', url: '#/', desc: 'Real-time schema, tables, and offline caching.' }
  ];

  function initFloatingHelpWidget() {
    if (document.getElementById('helpFloatBtn')) return;
    const btn = document.createElement('div');
    btn.id = 'helpFloatBtn';
    btn.className = 'help-floating-btn';
    btn.setAttribute('title', 'Need help or AI sourcing advice? Click here');
    btn.innerHTML = '<span class="help-circle-icon">🤖</span><span class="help-text">AI Copilot</span>';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'helpModalPanel';
    panel.className = 'help-modal-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="help-modal-header">
        <div><h3 id="copilotHeaderTitle">Sourcing Copilot &amp; Support</h3></div>
        <button type="button" class="help-modal-close" id="helpModalClose" aria-label="Close help">&times;</button>
      </div>
      <div class="help-modal-body">
        <h4 style="font-size:14px; font-weight:700; margin:0 0 2px;">Ask AI Sourcing Copilot</h4>
        <div class="help-search-box">
          <input type="search" id="helpGlobalSearch" placeholder="Ask about capacitors, contactors, 14-day rule..." autocomplete="off">
          <button type="button" class="help-search-btn" id="copilotAskBtn" aria-label="Ask">💬</button>
        </div>

        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
          <button type="button" class="ai-prompt-chip" data-q="capacitor prices">Capacitor prices</button>
          <button type="button" class="ai-prompt-chip" data-q="contactor quotes">Contactor quotes</button>
          <button type="button" class="ai-prompt-chip" data-q="14-day freshness rule">14-Day rule</button>
          <button type="button" class="ai-prompt-chip" data-q="dynamic mcda utility weights">MCDA weights</button>
          <button type="button" class="ai-prompt-chip" data-q="why unresolved is not zero">Unresolved ₱0.00 rule</button>
        </div>

        <div id="copilotAnswerArea" class="ai-copilot-bubble" style="display:none; margin-top:4px;"></div>

        <div class="help-section-label" style="margin-top:6px;">Documentation &amp; Support Articles</div>
        <div class="help-articles-list" id="helpArticlesList"></div>
      </div>
    `;
    document.body.appendChild(panel);

    const searchInput = document.getElementById('helpGlobalSearch');
    const articlesList = document.getElementById('helpArticlesList');
    const closeBtn = document.getElementById('helpModalClose');
    const copilotBtn = document.getElementById('copilotAskBtn');
    const copilotAnswerArea = document.getElementById('copilotAnswerArea');

    function renderList(filter = '') {
      const q = filter.trim().toLowerCase();
      const filtered = helpArticles.filter(item =>
        !q || item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      );

      if (filtered.length === 0) {
        articlesList.innerHTML = `<div style="font-size:13px; color:var(--mute); padding:12px; text-align:center;">No articles match "${esc(filter)}".</div>`;
        return;
      }

      articlesList.innerHTML = filtered.map(item => `
        <a class="help-article-link" href="${item.url}" onclick="document.getElementById('helpModalPanel').style.display='none';">
          <span class="help-article-icon">📖</span>
          <div>
            <strong style="display:block; margin-bottom:2px;">${esc(item.title)}</strong>
            <span style="font-size:12px; color:var(--mute);">${esc(item.desc)}</span>
          </div>
        </a>
      `).join('');
    }

    function askCopilot(query) {
      if (!window.PC_AI) return;
      const answer = window.PC_AI.copilotAnswer(query, { company: companyProfile });
      copilotAnswerArea.style.display = 'block';
      copilotAnswerArea.innerHTML = '<strong>🤖 Copilot:</strong>\n' + esc(answer);
    }

    btn.onclick = () => {
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        renderList(searchInput.value);
        searchInput.focus();
      }
    };

    closeBtn.onclick = () => { panel.style.display = 'none'; };
    searchInput.addEventListener('input', (e) => renderList(e.target.value));
    
    if (copilotBtn) {
      copilotBtn.onclick = () => {
        if (searchInput.value.trim()) askCopilot(searchInput.value);
      };
    }
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchInput.value.trim()) askCopilot(searchInput.value);
      }
    });

    panel.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.ai-prompt-chip');
      if (chip && chip.dataset.q) {
        searchInput.value = chip.dataset.q;
        askCopilot(chip.dataset.q);
      }
    });

    renderList();
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadInitialCompanyProfile();
      initFloatingHelpWidget();
    });
  } else {
    loadInitialCompanyProfile();
    initFloatingHelpWidget();
  }
  
  route();
})();
