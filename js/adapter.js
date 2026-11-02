/*
 * DATA ADAPTER & SUPABASE CLOUD INTEGRATION
 * Universal Enterprise PartsCompare Architecture
 * Supports Dynamic Company Settings, Staff Lifecycle / Succession,
 * Interactive MCDA Utility Weights, and Immutable Audit Ledger.
 */
(function () {
  const KEY = 'partscompare_enterprise_v3';
  const SKEY = 'partscompare_enterprise_session';

  const SUPABASE_URL = 'https://xahcgiwwyaskazgbgejh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_AkccI9Jh_aikiAkSizP37g_ZIP7iJ5z';

  let supabase = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch (err) {
    console.warn('Supabase initialization fallback to local:', err);
  }

  function load() {
    let s = null;
    try { 
      s = JSON.parse(localStorage.getItem(KEY)); 
    } catch (e) { 
      s = null; 
    }
    
    // Seed fixtures if empty or uninitialized
    if (!s || !s.parts || !s.company_settings) {
      s = JSON.parse(JSON.stringify(window.PC_FIXTURES));
      save(s);
    }

    // Ensure company_settings exists
    if (!s.company_settings) {
      s.company_settings = {
        id: 1,
        business_name: 'AMGC Airconditioning Services',
        business_type: 'Commercial & Industrial HVAC Services',
        location: 'V.V. Soliven Ave. II, Cainta, Rizal, Philippines',
        currency_code: 'PHP',
        currency_symbol: '₱',
        max_quote_age_days: 14,
        required_supplier_quotes: 3,
        mcda_cost_weight: 40,
        mcda_stock_weight: 30,
        mcda_freshness_weight: 20,
        mcda_consolidation_weight: 10,
        updated_at: new Date().toISOString()
      };
      save(s);
    }

    if (s.company_settings && s.company_settings.required_supplier_quotes == null) {
      s.company_settings.required_supplier_quotes = 3;
      save(s);
    }

    if (!s.suppliers || !Array.isArray(s.suppliers) || s.suppliers.length === 0) {
      s.suppliers = JSON.parse(JSON.stringify(window.PC_FIXTURES.suppliers));
      save(s);
    }

    // Ensure users have is_active flag and anti-impostor recovery credentials
    const DEFAULT_RECOVERY = {
      dave_pm: { pin: '240811', q: 'What city or municipality were you born in?', a: 'cainta' },
      pearl_dba: { pin: '350922', q: 'What city or municipality were you born in?', a: 'quezon city' },
      karen_admin: { pin: '890415', q: 'What city or municipality were you born in?', a: 'manila' }
    };
    if (s.users) {
      let usersChanged = false;
      s.users.forEach(u => {
        if (u.is_active === undefined) { u.is_active = true; usersChanged = true; }
        const def = DEFAULT_RECOVERY[(u.username || '').toLowerCase()] || { pin: '517283', q: 'What city or municipality were you born in?', a: 'pasig' };
        if (!u.recovery_pin) { u.recovery_pin = def.pin; usersChanged = true; }
        if (!u.security_question) { u.security_question = def.q; usersChanged = true; }
        if (!u.security_answer) { u.security_answer = def.a; usersChanged = true; }
      });
      if (usersChanged) save(s);
    }

    // Ensure account_requests exists
    if (!s.account_requests || !Array.isArray(s.account_requests)) {
      s.account_requests = [
        {
          id: 'req-01',
          name: 'Engr. Marco Santos',
          username: 'marco_hvac',
          role: 'preparer',
          password: 'demo',
          recovery_pin: '517283',
          security_question: 'What city or municipality were you born in?',
          security_answer: 'pasig',
          status: 'PENDING',
          created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
          reviewed_at: null,
          reviewed_by: null
        }
      ];
      save(s);
    }

    if (!s.password_reset_requests || !Array.isArray(s.password_reset_requests)) {
      s.password_reset_requests = [];
      save(s);
    }

    if (!s.reset_lockouts || typeof s.reset_lockouts !== 'object') {
      s.reset_lockouts = {};
      save(s);
    }

    // Ensure policy is present
    if (!s.policy) {
      s.policy = { 
        version: 'POL-ENT-01', 
        max_age_days: s.company_settings.max_quote_age_days || 14, 
        currency: s.company_settings.currency_code || 'PHP', 
        synthetic: false 
      };
      save(s);
    }

    if (!s.audit_logs) {
      s.audit_logs = [];
      save(s);
    }

    return s;
  }

  function save(s) { 
    try {
      localStorage.setItem(KEY, JSON.stringify(s)); 
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }
  }

  function nextId(s, prefix) { 
    s.counters.id = (s.counters.id || 100) + 1; 
    return prefix + s.counters.id; 
  }

  function fail(status, code, message, field_errors) { 
    return { status, code, message, field_errors }; 
  }

  function todayStr() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function daysBetween(a, b) {
    const t = (x) => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 86400000);
  }

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return 'fp' + (h >>> 0).toString(16);
  }

  function uuid() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'tok-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  const CAN = {
    preparer: ['lists', 'summaries'],
    maintainer: ['catalog'],
    administrator: ['catalog', 'lists', 'summaries', 'admin'],
  };

  function currentUser(s) {
    const id = sessionStorage.getItem(SKEY);
    const u = s.users.find((x) => x.id === id);
    if (!u) throw fail(401, 'UNAUTHENTICATED', 'Please sign in.');
    if (u.is_active === false) {
      throw fail(403, 'ACCOUNT_DEACTIVATED', 'This staff account has been deactivated. Please contact an Administrator.');
    }
    return u;
  }

  function need(s, cap) {
    const u = currentUser(s);
    if (u.role === 'administrator' || u.role === 'admin') return u; // Admin has full access
    if (!CAN[u.role] || !CAN[u.role].includes(cap)) {
      throw fail(403, 'FORBIDDEN', 'Your role (' + u.role + ') is not permitted to perform this action.');
    }
    return u;
  }

  const wrap = (fn) => new Promise((resolve, reject) => {
    setTimeout(async () => { 
      try { 
        const res = await fn();
        resolve(res); 
      } catch (e) { 
        reject(e); 
      } 
    }, 60);
  });

  /* ---------- STANDARDIZED AUDIT LOGGING HELPER ---------- */
  function logAudit(action, target, details, user) {
    const s = load();
    const actorName = user ? `${user.name} (${user.role.toUpperCase()})` : 'System';
    const logEntry = {
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      actor: actorName,
      action: action,
      target: target || 'Enterprise System',
      details: typeof details === 'string' ? details : JSON.stringify(details),
      created_at: new Date().toISOString()
    };
    
    s.audit_logs = s.audit_logs || [];
    s.audit_logs.push(logEntry);
    save(s);

    if (supabase) {
      (async () => {
        try {
          await supabase.from('audit_logs').insert([logEntry]);
        } catch (e) {}
      })();
    }
  }

  /* ---------- RULES EVALUATION ---------- */
  function evaluateOffer(offer, part, qty, policy, today) {
    const r = [];
    if (offer.price_minor == null || offer.recorded_quantity == null || !offer.checked_date || !offer.source_reference) {
      r.push('MISSING_DATA');
    }
    if (!offer.active || !part.active) {
      r.push('INACTIVE');
    }
    if (offer.price_basis !== 'per_piece') {
      r.push('PRICE_BASIS_MISMATCH');
    }
    if (offer.currency !== policy.currency) {
      r.push('CURRENCY_MISMATCH');
    }
    if (offer.checked_date) {
      if (offer.checked_date > today) {
        r.push('FUTURE_DATE');
      } else if (daysBetween(offer.checked_date, today) > policy.max_age_days) {
        r.push('STALE');
      }
    }
    if (offer.recorded_quantity != null && offer.recorded_quantity < qty) {
      r.push('INSUFFICIENT_QUANTITY');
    }
    return r;
  }

  function buildComparison(s, list, selections) {
    const policy = s.policy;
    if (!policy) throw fail(422, 'CONFIG_REQUIRED', 'No comparison policy has been adopted yet.');
    if (!list.lines || !list.lines.length) throw fail(422, 'EMPTY_LIST', 'An empty list cannot be compared.');
    const today = todayStr();

    const lines = list.lines.map((ln) => {
      const part = s.parts.find((p) => p.id === ln.part_id) || { id: ln.part_id, exact_id: 'UNKNOWN', description: 'Unknown item', active: false };
      const candidates = s.offers.filter((o) => o.part_id === ln.part_id).map((o) => {
        const reasons = evaluateOffer(o, part, ln.quantity, policy, today);
        const sup = s.suppliers.find((x) => x.id === o.supplier_id);
        return {
          offer_id: o.id,
          offer_revision: o.revision || 1,
          supplier_id: o.supplier_id,
          supplier_name: sup ? sup.name : 'Unknown Supplier',
          price_minor: o.price_minor,
          currency: o.currency || policy.currency || 'PHP',
          price_basis: o.price_basis || 'per_piece',
          recorded_quantity: o.recorded_quantity,
          checked_date: o.checked_date,
          source_reference: o.source_reference,
          synthetic: !!o.synthetic,
          eligible: reasons.length === 0,
          reasons,
        };
      });

      const eligible = candidates.filter((c) => c.eligible);
      const reqQuorum = (s.company_settings && s.company_settings.required_supplier_quotes) || 3;
      const meets_quorum = eligible.length >= reqQuorum;
      let lowest = [];
      if (eligible.length) {
        const min = Math.min(...eligible.map((c) => c.price_minor));
        lowest = eligible.filter((c) => c.price_minor === min).map((c) => c.offer_id);
      }

      const chosenId = selections ? selections[ln.id] : null;
      let selected = null;
      if (chosenId) {
        selected = candidates.find((c) => c.offer_id === chosenId);
        if (!selected || !selected.eligible) {
          throw fail(422, 'INVALID_INPUT', 'An excluded or unknown offer was selected.');
        }
      }

      let reason = null;
      if (!candidates.length) reason = 'NO_RECORDED_OFFER';
      else if (!eligible.length) reason = 'NO_ELIGIBLE_OFFER';
      else if (!selected) reason = 'NO_SELECTION';

      return {
        line_id: ln.id,
        part_id: part.id,
        exact_id: part.exact_id,
        description: part.description,
        quantity: ln.quantity,
        candidates,
        lowest_eligible_offer_ids: lowest,
        selected_offer_id: selected ? selected.offer_id : null,
        line_status: selected ? 'RESOLVED' : 'UNRESOLVED',
        unresolved_reason: reason,
        line_cost_minor: selected ? selected.price_minor * ln.quantity : null,
        eligible_count: eligible.length,
        required_supplier_quotes: reqQuorum,
        meets_quorum
      };
    });

    const reqQuorum = (s.company_settings && s.company_settings.required_supplier_quotes) || 3;
    const unresolved = lines.filter((l) => l.line_status === 'UNRESOLVED').length;
    const subtotal = lines.reduce((a, l) => a + (l.line_cost_minor || 0), 0);
    const belowQuorumCount = lines.filter((l) => l.eligible_count < reqQuorum).length;

    const fpSource = JSON.stringify({
      lr: list.revision,
      pv: policy.version,
      l: lines.map((l) => [
        l.line_id,
        l.quantity,
        l.candidates.map((c) => [c.offer_id, c.offer_revision, c.price_minor, c.recorded_quantity, c.checked_date, c.reasons.join('+')])
      ]),
    });

    return {
      list_revision: list.revision,
      policy_version: policy.version,
      review_fingerprint: hash(fpSource),
      currency: policy.currency,
      money_scale: 2,
      evaluation_date: today,
      policy: { max_age_days: policy.max_age_days, currency: policy.currency },
      lines,
      summary: {
        status: unresolved === 0 ? 'COMPLETE' : 'INCOMPLETE',
        unresolved_count: unresolved,
        subtotal_minor: subtotal,
        required_supplier_quotes: reqQuorum,
        below_quorum_count: belowQuorumCount
      },
    };
  }

  function ownList(s, u, id) {
    const l = s.lists.find((x) => x.id === id);
    if (!l) throw fail(404, 'NOT_FOUND', 'List not found.');
    if (u.role !== 'administrator' && u.role !== 'admin' && l.owner_id !== u.id) {
      throw fail(403, 'FORBIDDEN', 'Access denied to this list.');
    }
    return l;
  }

  function validateLines(s, lines) {
    const fe = {};
    const seen = new Set();
    lines.forEach((ln, i) => {
      const part = s.parts.find((p) => p.id === ln.part_id);
      if (!ln.part_id) fe[i] = 'Choose a part.';
      else if (!part) fe[i] = 'Unknown part.';
      else if (!part.active) fe[i] = 'This part is inactive.';
      else if (seen.has(ln.part_id)) fe[i] = 'This part is already on the list.';
      else if (!Number.isInteger(ln.quantity) || ln.quantity < 1) fe[i] = 'Quantity must be a positive whole number.';
      seen.add(ln.part_id);
    });
    return fe;
  }

  const WEAK_PINS = new Set([
    '000000', '111111', '222222', '333333', '444444',
    '555555', '666666', '777777', '888888', '999999',
    '123456', '654321', '123123', '112233', '012345'
  ]);

  function validateRecoveryPin(pin) {
    const clean = String(pin || '').trim();
    if (!/^\d{6}$/.test(clean)) {
      throw fail(400, 'INVALID_PIN', 'Recovery PIN must be exactly 6 numeric digits (0–9).');
    }
    if (WEAK_PINS.has(clean)) {
      throw fail(400, 'WEAK_PIN', 'Please choose a stronger 6-digit PIN (avoid sequences like 123456 or repeated digits like 000000).');
    }
    return clean;
  }

  function normalizeSecurityAnswer(ans) {
    return String(ans || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  const api = {
    /* ---------- AUTHENTICATION & SESSION ---------- */
    login: (username, password, isQuickDemo = false) => wrap(() => {
      const s = load();
      const u = s.users.find((x) => 
        x.username.toLowerCase() === username.toLowerCase() || 
        (x.alias && x.alias.toLowerCase() === username.toLowerCase())
      );
      if (!u) {
        throw fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials. Check your username or role.');
      }
      if (u.is_active === false) {
        throw fail(403, 'ACCOUNT_DEACTIVATED', 'This staff account has been deactivated. Please contact an Administrator.');
      }
      if (!isQuickDemo) {
        const expectedPass = u.password || 'demo';
        if (password !== expectedPass) {
          throw fail(401, 'INVALID_CREDENTIALS', 'Invalid password. Please check your credentials and try again.');
        }
      }
      sessionStorage.setItem(SKEY, u.id);
      logAudit('USER_LOGIN', `Auth @${u.username}`, `Staff signed in successfully as ${u.role}`, u);
      return { id: u.id, name: u.name, role: u.role, capabilities: CAN[u.role] || [] };
    }),

    logout: () => wrap(() => { 
      sessionStorage.removeItem(SKEY); 
      return {}; 
    }),

    me: () => wrap(() => {
      const s = load();
      const u = currentUser(s);
      return { id: u.id, name: u.name, role: u.role, capabilities: CAN[u.role] || [] };
    }),

    resetDemo: () => wrap(() => { 
      localStorage.removeItem(KEY); 
      const fresh = load(); 
      return fresh; 
    }),

    /* ---------- MODULE 1: ENTERPRISE BUSINESS PROFILE & UNIVERSAL BRANDING ---------- */
    getCompanyProfile: () => wrap(async () => {
      const s = load();
      if (supabase) {
        try {
          const { data, error } = await supabase.from('company_settings').select('*').eq('id', 1).single();
          if (!error && data) {
            s.company_settings = Object.assign({}, s.company_settings, data);
            save(s);
          }
        } catch (e) {}
      }
      return s.company_settings || window.PC_FIXTURES.company_settings;
    }),

    saveCompanyProfile: (profile) => wrap(async () => {
      const s = load();
      const u = need(s, 'admin');

      const clean = {
        id: 1,
        business_name: (profile.business_name || '').trim() || 'AMGC Airconditioning Services',
        business_type: (profile.business_type || '').trim() || 'Commercial & Industrial HVAC Services',
        location: (profile.location || '').trim() || 'V.V. Soliven Ave. II, Cainta, Rizal, Philippines',
        currency_code: (profile.currency_code || 'PHP').trim().toUpperCase(),
        currency_symbol: (profile.currency_symbol || '₱').trim(),
        max_quote_age_days: Number.isInteger(profile.max_quote_age_days) ? profile.max_quote_age_days : 14,
        required_supplier_quotes: Number.isInteger(profile.required_supplier_quotes) && profile.required_supplier_quotes >= 1 ? profile.required_supplier_quotes : 3,
        mcda_cost_weight: profile.mcda_cost_weight != null ? profile.mcda_cost_weight : (s.company_settings.mcda_cost_weight || 40),
        mcda_stock_weight: profile.mcda_stock_weight != null ? profile.mcda_stock_weight : (s.company_settings.mcda_stock_weight || 30),
        mcda_freshness_weight: profile.mcda_freshness_weight != null ? profile.mcda_freshness_weight : (s.company_settings.mcda_freshness_weight || 20),
        mcda_consolidation_weight: profile.mcda_consolidation_weight != null ? profile.mcda_consolidation_weight : (s.company_settings.mcda_consolidation_weight || 10),
        updated_at: new Date().toISOString()
      };

      s.company_settings = clean;
      // Sync policy currency & age limit
      if (s.policy) {
        s.policy.currency = clean.currency_code;
        s.policy.max_age_days = clean.max_quote_age_days;
      }
      save(s);

      if (supabase) {
        try {
          await supabase.from('company_settings').upsert([clean]);
        } catch (e) {}
      }

      logAudit('PROFILE_UPDATE', 'Enterprise Profile #1', `Updated enterprise profile to "${clean.business_name}" (${clean.business_type}, ${clean.location})`, u);
      return clean;
    }),

    /* ---------- MODULE 2: STAFF LIFECYCLE, SUCCESSION & SOFT DEACTIVATION ---------- */
    listStaff: () => wrap(() => {
      const s = load();
      need(s, 'admin');
      return s.users.map(u => ({
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        alias: u.alias,
        is_active: u.is_active !== false
      }));
    }),

    promoteStaffToAdmin: (userId) => wrap(() => {
      const s = load();
      const current = need(s, 'admin');
      const target = s.users.find(x => x.id === userId);
      if (!target) throw fail(404, 'NOT_FOUND', 'Staff user not found.');
      target.role = 'administrator';
      save(s);
      logAudit('STAFF_STATUS_CHANGE', `Staff #${target.id} (@${target.username})`, `Promoted ${target.name} to Administrator for succession handover.`, current);
      return target;
    }),

    toggleStaffStatus: (userId) => wrap(() => {
      const s = load();
      const current = need(s, 'admin');
      const target = s.users.find(x => x.id === userId);
      if (!target) throw fail(404, 'NOT_FOUND', 'Staff user not found.');
      if (target.id === current.id) {
        throw fail(400, 'SELF_DEACTIVATION', 'You cannot deactivate your own active session account.');
      }
      target.is_active = !target.is_active;
      save(s);
      logAudit('STAFF_STATUS_CHANGE', `Staff #${target.id} (@${target.username})`, `${target.is_active ? 'Reactivated' : 'Deactivated'} staff account for ${target.name}.`, current);
      return target;
    }),

    /* ---------- MODULE 2B: STAFF ACCOUNT ACCESS & PROVISIONING REQUESTS ---------- */
    listAccountRequests: () => wrap(async () => {
      const s = load();
      need(s, 'admin');
      if (supabase) {
        try {
          const { data, error } = await supabase.from('account_requests').select('*').order('created_at', { ascending: false });
          if (!error && data && data.length) {
            if (!s.account_requests) s.account_requests = [];
            data.forEach(cloudReq => {
              const idx = s.account_requests.findIndex(r => r.id === cloudReq.id || r.username === cloudReq.username);
              if (idx >= 0) {
                s.account_requests[idx] = Object.assign({}, s.account_requests[idx], cloudReq);
              } else {
                s.account_requests.push(cloudReq);
              }
            });
            save(s);
          }
        } catch (e) {}
      }
      return (s.account_requests || []).map(r => Object.assign({}, r));
    }),

    submitAccountRequest: (reqData) => wrap(async () => {
      const s = load();
      const name = (reqData.name || '').trim();
      const username = (reqData.username || '').trim().toLowerCase();
      const role = reqData.role === 'maintainer' ? 'maintainer' : 'preparer';
      const password = reqData.password || '';
      const recoveryPin = validateRecoveryPin(reqData.recovery_pin);
      const securityQuestion = (reqData.security_question || '').trim();
      const securityAnswer = normalizeSecurityAnswer(reqData.security_answer);

      if (!name) throw fail(400, 'VALIDATION_ERROR', 'Full name is required.');
      if (!username) throw fail(400, 'VALIDATION_ERROR', 'Desired username is required.');
      if (!password || password.length < 4) throw fail(400, 'VALIDATION_ERROR', 'Password must be at least 4 characters long.');
      if (!securityQuestion) throw fail(400, 'VALIDATION_ERROR', 'Please choose a Security Question.');
      if (!securityAnswer || securityAnswer.length < 2) throw fail(400, 'VALIDATION_ERROR', 'Security Answer must be at least 2 characters.');

      // Check if username already exists in users
      const existingUser = (s.users || []).find(u => u.username.toLowerCase() === username);
      if (existingUser) {
        throw fail(409, 'USERNAME_TAKEN', `The username @${username} is already registered in the system.`);
      }

      // Check if pending request exists with same username
      if (!s.account_requests) s.account_requests = [];
      const pendingReq = s.account_requests.find(r => r.username.toLowerCase() === username && r.status === 'PENDING');
      if (pendingReq) {
        throw fail(409, 'REQUEST_EXISTS', `A pending registration request for @${username} has already been submitted.`);
      }

      const reqObj = {
        id: 'req-' + Date.now(),
        name,
        username,
        role,
        password,
        recovery_pin: recoveryPin,
        security_question: securityQuestion,
        security_answer: securityAnswer,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null
      };

      s.account_requests.unshift(reqObj);
      save(s);

      if (supabase) {
        try {
          await supabase.from('account_requests').insert([reqObj]);
        } catch (e) {}
      }

      logAudit('STAFF_REQUEST_SUBMITTED', `@${username}`, `Registration request submitted by ${name} for role "${role}" (6-Digit PIN & Security Question configured)`);
      return { ok: true, request: reqObj };
    }),

    approveAccountRequest: (requestId) => wrap(async () => {
      const s = load();
      const current = need(s, 'admin');
      if (!s.account_requests) s.account_requests = [];
      const req = s.account_requests.find(r => r.id === requestId);
      if (!req) throw fail(404, 'NOT_FOUND', 'Account request not found.');
      if (req.status === 'APPROVED') throw fail(400, 'ALREADY_APPROVED', 'This request is already approved.');

      req.status = 'APPROVED';
      req.reviewed_at = new Date().toISOString();
      req.reviewed_by = current.name;

      // Find or create user in s.users
      let user = (s.users || []).find(u => u.username.toLowerCase() === req.username.toLowerCase());
      if (user) {
        user.name = req.name;
        user.role = req.role;
        user.password = req.password;
        if (req.recovery_pin) user.recovery_pin = req.recovery_pin;
        if (req.security_question) user.security_question = req.security_question;
        if (req.security_answer) user.security_answer = req.security_answer;
        user.is_active = true;
      } else {
        user = {
          id: 'u' + Date.now(),
          name: req.name,
          username: req.username,
          alias: req.username,
          role: req.role,
          password: req.password,
          recovery_pin: req.recovery_pin || '517283',
          security_question: req.security_question || 'What city or municipality were you born in?',
          security_answer: req.security_answer || 'pasig',
          is_active: true
        };
        s.users.push(user);
      }

      save(s);

      if (supabase) {
        try {
          await supabase.from('account_requests').update({
            status: 'APPROVED',
            reviewed_at: req.reviewed_at,
            reviewed_by: req.reviewed_by
          }).eq('id', req.id);
        } catch (e) {}
      }

      logAudit('STAFF_REQUEST_APPROVED', `Staff #${user.id} (@${user.username})`, `Administrator ${current.name} approved registration request for ${user.name} (${user.role})`, current);
      return { ok: true, user, request: req };
    }),

    rejectAccountRequest: (requestId, reason) => wrap(async () => {
      const s = load();
      const current = need(s, 'admin');
      if (!s.account_requests) s.account_requests = [];
      const req = s.account_requests.find(r => r.id === requestId);
      if (!req) throw fail(404, 'NOT_FOUND', 'Account request not found.');
      if (req.status === 'REJECTED') throw fail(400, 'ALREADY_REJECTED', 'This request is already rejected.');

      req.status = 'REJECTED';
      req.reviewed_at = new Date().toISOString();
      req.reviewed_by = current.name;
      req.reason = reason || 'Declined by Administrator';

      save(s);

      if (supabase) {
        try {
          await supabase.from('account_requests').update({
            status: 'REJECTED',
            reviewed_at: req.reviewed_at,
            reviewed_by: req.reviewed_by,
            reason: req.reason
          }).eq('id', req.id);
        } catch (e) {}
      }

      logAudit('STAFF_REQUEST_REJECTED', `Request #${req.id} (@${req.username})`, `Administrator ${current.name} declined registration request for ${req.name} (@${req.username})`, current);
      return { ok: true, request: req };
    }),

    /* ---------- MODULE 2C: IDENTITY-VERIFIED PASSWORD RECOVERY & ANTI-IMPOSTOR ENGINE ---------- */
    getRecoveryChallenge: (usernameInput) => wrap(() => {
      const s = load();
      const query = String(usernameInput || '').trim().toLowerCase();
      if (!query) throw fail(400, 'VALIDATION_ERROR', 'Please enter your username.');
      const u = (s.users || []).find(x =>
        x.username.toLowerCase() === query ||
        (x.alias && x.alias.toLowerCase() === query)
      );
      if (!u) {
        throw fail(404, 'ACCOUNT_NOT_FOUND', 'No authorized staff account found with that username.');
      }
      if (u.is_active === false) {
        throw fail(403, 'ACCOUNT_DEACTIVATED', 'This staff account is deactivated. Please contact an Administrator directly.');
      }
      if (!s.reset_lockouts) s.reset_lockouts = {};
      const uKey = u.username.toLowerCase();
      const lock = s.reset_lockouts[uKey];
      if (lock && lock.locked_until) {
        const diffMs = new Date(lock.locked_until).getTime() - Date.now();
        if (diffMs > 0) {
          const secsLeft = Math.ceil(diffMs / 1000);
          throw fail(429, 'RECOVERY_LOCKED', `Account recovery for @${u.username} is temporarily locked due to multiple failed verification attempts (${secsLeft}s remaining).`);
        } else {
          s.reset_lockouts[uKey] = { attempts: 0, locked_until: null };
          save(s);
        }
      }
      const isAdmin = u.role === 'administrator' || u.role === 'admin';
      return {
        username: u.username,
        name: u.name,
        role: u.role,
        is_admin: isAdmin,
        security_question: u.security_question || 'What city or municipality were you born in?',
        requires_both_factors: isAdmin
      };
    }),

    submitPasswordReset: (payload) => wrap(async () => {
      const s = load();
      const query = String(payload.username || '').trim().toLowerCase();
      const u = (s.users || []).find(x =>
        x.username.toLowerCase() === query ||
        (x.alias && x.alias.toLowerCase() === query)
      );
      if (!u) throw fail(404, 'ACCOUNT_NOT_FOUND', 'Staff account not found.');
      if (u.is_active === false) throw fail(403, 'ACCOUNT_DEACTIVATED', 'This staff account is deactivated.');

      if (!s.reset_lockouts) s.reset_lockouts = {};
      const uKey = u.username.toLowerCase();
      let lock = s.reset_lockouts[uKey] || { attempts: 0, locked_until: null };
      if (lock.locked_until) {
        const diffMs = new Date(lock.locked_until).getTime() - Date.now();
        if (diffMs > 0) {
          const secsLeft = Math.ceil(diffMs / 1000);
          throw fail(429, 'RECOVERY_LOCKED', `Account recovery for @${u.username} is locked (${secsLeft}s remaining).`);
        } else {
          lock = { attempts: 0, locked_until: null };
        }
      }

      const newPassword = String(payload.new_password || '');
      if (newPassword.length < 4) {
        throw fail(400, 'VALIDATION_ERROR', 'New password must be at least 4 characters long.');
      }

      const isAdmin = u.role === 'administrator' || u.role === 'admin';
      const pinRaw = String(payload.pin || '').trim();
      const ansNorm = normalizeSecurityAnswer(payload.security_answer);
      const pinProvided = pinRaw.length > 0;
      const ansProvided = ansNorm.length > 0;

      if (isAdmin && (!pinProvided || !ansProvided)) {
        throw fail(400, 'VALIDATION_ERROR', 'Administrator self-recovery requires BOTH your 6-Digit Recovery PIN and your Security Question Answer.');
      }
      if (!isAdmin && !pinProvided && !ansProvided) {
        throw fail(400, 'VALIDATION_ERROR', 'Please enter your 6-Digit Recovery PIN and/or your Security Question Answer to verify your identity.');
      }

      const pinMatches = pinProvided && pinRaw === String(u.recovery_pin || '');
      const ansMatches = ansProvided && ansNorm === normalizeSecurityAnswer(u.security_answer || '');

      let verifiedOk = false;
      if (isAdmin) {
        verifiedOk = pinMatches && ansMatches;
      } else {
        // Every factor provided by the requester must match (prevents guessing one while failing another)
        const pinCheck = pinProvided ? pinMatches : true;
        const ansCheck = ansProvided ? ansMatches : true;
        verifiedOk = (pinProvided || ansProvided) && pinCheck && ansCheck;
      }

      if (!verifiedOk) {
        lock.attempts = (lock.attempts || 0) + 1;
        if (lock.attempts >= 5) {
          lock.locked_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          s.reset_lockouts[uKey] = lock;
          save(s);
          logAudit('SECURITY_ACCOUNT_LOCKOUT', `Auth @${u.username}`, `Blocked potential impostor: 5 consecutive failed password recovery attempts locked @${u.username} for 5 minutes.`);
          throw fail(429, 'RECOVERY_LOCKED', `Maximum failed attempts (5/5) reached! Recovery for @${u.username} is locked for 5 minutes and reported to the Audit Ledger.`);
        }
        s.reset_lockouts[uKey] = lock;
        save(s);
        const left = 5 - lock.attempts;
        logAudit('SECURITY_RESET_FAILED', `Auth @${u.username}`, `Failed anti-impostor identity check (${lock.attempts}/5) during password recovery for @${u.username}.`);
        throw fail(401, 'VERIFICATION_FAILED', `Identity verification failed (incorrect PIN or Security Answer). ${left} attempt(s) remaining before 5-minute lockout.`);
      }

      // Identity verified — reset lockout counter
      s.reset_lockouts[uKey] = { attempts: 0, locked_until: null };

      if (isAdmin) {
        u.password = newPassword;
        save(s);
        logAudit('ADMIN_PASSWORD_RECOVERED', `Admin @${u.username}`, `Administrator ${u.name} verified BOTH 6-Digit PIN + Security Question (2FA) and recovered account password.`, u);
        return {
          ok: true,
          mode: 'IMMEDIATE_ADMIN_RESET',
          message: `✓ 2-Factor Identity Verified (PIN + Security Question)! Password for Administrator @${u.username} has been updated immediately.`
        };
      }

      const methodLabel = (pinMatches && ansMatches)
        ? 'PIN + Security Question (2FA)'
        : pinMatches
          ? '6-Digit Recovery PIN'
          : 'Security Question';

      if (!s.password_reset_requests) s.password_reset_requests = [];
      // Mark any older PENDING reset request for this same user as superseded/rejected
      s.password_reset_requests.forEach(r => {
        if (r.username.toLowerCase() === uKey && r.status === 'PENDING') {
          r.status = 'REJECTED';
          r.reason = 'Superseded by newer verified request';
          r.reviewed_at = new Date().toISOString();
          r.reviewed_by = 'System';
        }
      });

      const pwrObj = {
        id: 'pwr-' + Date.now(),
        user_id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        new_password: newPassword,
        verification_method: methodLabel,
        verified: true,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null
      };

      s.password_reset_requests.unshift(pwrObj);
      save(s);

      if (supabase) {
        try {
          await supabase.from('password_reset_requests').insert([pwrObj]);
        } catch (e) {}
      }

      logAudit('PASSWORD_RESET_REQUESTED', `Staff @${u.username}`, `${u.name} passed anti-impostor check (${methodLabel}) and queued a password reset request for Admin approval.`);
      return {
        ok: true,
        mode: 'QUEUED_FOR_ADMIN',
        request: pwrObj,
        message: `✓ Identity Verified (${methodLabel})! Your password reset request has been submitted to the Administrator Console for approval.`
      };
    }),

    listPasswordResetRequests: () => wrap(async () => {
      const s = load();
      need(s, 'admin');
      if (supabase) {
        try {
          const { data, error } = await supabase.from('password_reset_requests').select('*').order('created_at', { ascending: false });
          if (!error && data && data.length) {
            if (!s.password_reset_requests) s.password_reset_requests = [];
            data.forEach(cloudPwr => {
              const idx = s.password_reset_requests.findIndex(r => r.id === cloudPwr.id);
              if (idx >= 0) {
                s.password_reset_requests[idx] = Object.assign({}, s.password_reset_requests[idx], cloudPwr);
              } else {
                s.password_reset_requests.push(cloudPwr);
              }
            });
            save(s);
          }
        } catch (e) {}
      }
      return (s.password_reset_requests || []).map(r => Object.assign({}, r, { new_password: '••••••' }));
    }),

    approvePasswordResetRequest: (requestId) => wrap(async () => {
      const s = load();
      const current = need(s, 'admin');
      if (!s.password_reset_requests) s.password_reset_requests = [];
      const req = s.password_reset_requests.find(r => r.id === requestId);
      if (!req) throw fail(404, 'NOT_FOUND', 'Password reset request not found.');
      if (req.status === 'APPROVED') throw fail(400, 'ALREADY_APPROVED', 'This password reset request is already approved.');

      const u = (s.users || []).find(x => x.id === req.user_id || x.username.toLowerCase() === req.username.toLowerCase());
      if (!u) throw fail(404, 'USER_NOT_FOUND', 'Target staff account not found.');

      u.password = req.new_password;
      if (s.reset_lockouts) {
        s.reset_lockouts[u.username.toLowerCase()] = { attempts: 0, locked_until: null };
      }

      req.status = 'APPROVED';
      req.reviewed_at = new Date().toISOString();
      req.reviewed_by = current.name;
      save(s);

      if (supabase) {
        try {
          await supabase.from('password_reset_requests').update({
            status: 'APPROVED',
            reviewed_at: req.reviewed_at,
            reviewed_by: req.reviewed_by
          }).eq('id', req.id);
        } catch (e) {}
      }

      logAudit('PASSWORD_RESET_APPROVED', `Staff #${u.id} (@${u.username})`, `Administrator ${current.name} approved verified password reset (${req.verification_method}) for ${u.name}.`, current);
      return { ok: true, user: { id: u.id, name: u.name, username: u.username, role: u.role } };
    }),

    rejectPasswordResetRequest: (requestId, reason) => wrap(async () => {
      const s = load();
      const current = need(s, 'admin');
      if (!s.password_reset_requests) s.password_reset_requests = [];
      const req = s.password_reset_requests.find(r => r.id === requestId);
      if (!req) throw fail(404, 'NOT_FOUND', 'Password reset request not found.');
      if (req.status === 'REJECTED') throw fail(400, 'ALREADY_REJECTED', 'This password reset request is already declined.');

      req.status = 'REJECTED';
      req.reviewed_at = new Date().toISOString();
      req.reviewed_by = current.name;
      req.reason = reason || 'Declined by Administrator';
      save(s);

      if (supabase) {
        try {
          await supabase.from('password_reset_requests').update({
            status: 'REJECTED',
            reviewed_at: req.reviewed_at,
            reviewed_by: req.reviewed_by,
            reason: req.reason
          }).eq('id', req.id);
        } catch (e) {}
      }

      logAudit('PASSWORD_RESET_REJECTED', `Reset #${req.id} (@${req.username})`, `Administrator ${current.name} declined password reset request for ${req.name} (@${req.username}).`, current);
      return { ok: true };
    }),

    getMySecuritySettings: () => wrap(() => {
      const s = load();
      const u = currentUser(s);
      return {
        username: u.username,
        name: u.name,
        role: u.role,
        security_question: u.security_question || 'What city or municipality were you born in?',
        has_pin: !!u.recovery_pin
      };
    }),

    updateMySecuritySettings: (payload) => wrap(() => {
      const s = load();
      const u = currentUser(s);
      const expectedPass = u.password || 'demo';
      if (String(payload.current_password || '') !== expectedPass) {
        throw fail(401, 'INVALID_PASSWORD', 'Current password is incorrect.');
      }
      const newPin = validateRecoveryPin(payload.recovery_pin);
      const newQ = String(payload.security_question || '').trim();
      const newA = normalizeSecurityAnswer(payload.security_answer);
      if (!newQ) throw fail(400, 'VALIDATION_ERROR', 'Please select a Security Question.');
      if (!newA || newA.length < 2) throw fail(400, 'VALIDATION_ERROR', 'Security Answer must be at least 2 characters.');

      u.recovery_pin = newPin;
      u.security_question = newQ;
      u.security_answer = newA;
      save(s);
      logAudit('SECURITY_CREDENTIALS_UPDATED', `Auth @${u.username}`, `${u.name} updated their 6-Digit Recovery PIN and Security Question.`, u);
      return { ok: true };
    }),

    /* ---------- MODULE 3: INTERACTIVE MCDA UTILITY WEIGHT ENGINE ---------- */
    getMcdaWeights: () => wrap(() => {
      const s = load();
      const cs = s.company_settings || {};
      return {
        cost: cs.mcda_cost_weight != null ? cs.mcda_cost_weight : 40,
        stock: cs.mcda_stock_weight != null ? cs.mcda_stock_weight : 30,
        freshness: cs.mcda_freshness_weight != null ? cs.mcda_freshness_weight : 20,
        consolidation: cs.mcda_consolidation_weight != null ? cs.mcda_consolidation_weight : 10,
      };
    }),

    saveMcdaWeights: (weights) => wrap(async () => {
      const s = load();
      const u = need(s, 'admin');
      const cost = parseInt(weights.cost, 10) || 0;
      const stock = parseInt(weights.stock, 10) || 0;
      const freshness = parseInt(weights.freshness, 10) || 0;
      const consolidation = parseInt(weights.consolidation, 10) || 0;
      const sum = cost + stock + freshness + consolidation;

      if (sum !== 100) {
        throw fail(422, 'INVALID_WEIGHTS', `MCDA utility weights must sum exactly to 100% (currently ${sum}%).`);
      }

      s.company_settings = s.company_settings || {};
      s.company_settings.mcda_cost_weight = cost;
      s.company_settings.mcda_stock_weight = stock;
      s.company_settings.mcda_freshness_weight = freshness;
      s.company_settings.mcda_consolidation_weight = consolidation;
      s.company_settings.updated_at = new Date().toISOString();
      save(s);

      if (supabase) {
        try {
          await supabase.from('company_settings').upsert([s.company_settings]);
        } catch (e) {}
      }

      logAudit('POLICY_UPDATE', 'MCDA Utility Weights', `Adjusted MCDA weights: Cost=${cost}%, Stock=${stock}%, Freshness=${freshness}%, Consolidation=${consolidation}%`, u);
      return { cost, stock, freshness, consolidation };
    }),

    /* ---------- MODULE 4: AUDIT TRAIL LOGGING & SNAPSHOT VERIFICATION ---------- */
    listAuditLogs: () => wrap(async () => {
      const s = load();
      need(s, 'admin');
      if (supabase) {
        try {
          const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(25);
          if (!error && data && data.length) {
            return data;
          }
        } catch (e) {}
      }
      return (s.audit_logs || []).slice(-25).reverse();
    }),

    /* ---------- POLICY RULES ---------- */
    getPolicy: () => wrap(() => load().policy),

    setPolicy: (max_age_days, currency) => wrap(async () => {
      const s = load();
      const u = currentUser(s);
      if (!Number.isInteger(max_age_days) || max_age_days < 0) {
        throw fail(422, 'INVALID_INPUT', 'Age limit must be a positive number of days.', { max_age_days: 'Enter 0 or more.' });
      }
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw fail(422, 'INVALID_INPUT', 'Currency must be a 3-letter code (e.g. PHP).', { currency: 'Use PHP.' });
      }
      s.counters.policy = (s.counters.policy || 0) + 1;
      s.policy = { 
        version: 'POL-ENT-' + String(s.counters.policy).padStart(2, '0'), 
        max_age_days, 
        currency, 
        synthetic: false 
      };
      
      if (s.company_settings) {
        s.company_settings.max_quote_age_days = max_age_days;
        s.company_settings.currency_code = currency;
      }
      save(s);
      
      logAudit('POLICY_UPDATE', 'Global Quote Freshness', `Set max age threshold to ${max_age_days} days (${currency})`, u);
      return s.policy;
    }),

    /* ---------- CATALOG & OFFERS ---------- */
    listParts: () => wrap(() => { 
      const s = load(); 
      currentUser(s); 
      return s.parts; 
    }),

    listSuppliers: () => wrap(() => { 
      const s = load(); 
      currentUser(s); 
      return s.suppliers || []; 
    }),

    createSupplier: (data) => wrap(async () => {
      const s = load();
      const u = need(s, 'catalog');
      const name = (data.name || '').trim();
      const location = (data.location || '').trim() || 'Philippines';
      const contact = (data.contact || '').trim();
      const accredited = data.accredited !== false;

      if (!name) throw fail(400, 'VALIDATION_ERROR', 'Supplier company name is required.');
      if (!s.suppliers) s.suppliers = [];
      const dup = s.suppliers.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (dup) throw fail(409, 'SUPPLIER_EXISTS', `A supplier named "${name}" is already registered.`);

      const sup = {
        id: nextId(s, 's'),
        name,
        location,
        contact,
        accredited
      };
      s.suppliers.push(sup);
      save(s);

      if (supabase) {
        try {
          await supabase.from('suppliers').insert([sup]);
        } catch (e) {}
      }

      logAudit('SUPPLIER_CREATED', `Supplier #${sup.id}`, `Registered new accredited vendor: "${sup.name}" (${sup.location})`, u);
      return { ok: true, supplier: sup };
    }),

    updateSupplier: (id, data) => wrap(async () => {
      const s = load();
      const u = need(s, 'catalog');
      if (!s.suppliers) s.suppliers = [];
      const sup = s.suppliers.find(x => x.id === id);
      if (!sup) throw fail(404, 'NOT_FOUND', 'Supplier not found.');

      const name = (data.name || '').trim();
      if (!name) throw fail(400, 'VALIDATION_ERROR', 'Supplier company name is required.');
      const dup = s.suppliers.find(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase());
      if (dup) throw fail(409, 'SUPPLIER_EXISTS', `Another supplier named "${name}" is already registered.`);

      sup.name = name;
      if (data.location !== undefined) sup.location = (data.location || '').trim() || 'Philippines';
      if (data.contact !== undefined) sup.contact = (data.contact || '').trim();
      if (data.accredited !== undefined) sup.accredited = !!data.accredited;
      save(s);

      if (supabase) {
        try {
          await supabase.from('suppliers').upsert([sup]);
        } catch (e) {}
      }

      logAudit('SUPPLIER_UPDATED', `Supplier #${sup.id}`, `Updated vendor profile for "${sup.name}"`, u);
      return { ok: true, supplier: sup };
    }),

    toggleSupplierStatus: (id) => wrap(async () => {
      const s = load();
      const u = need(s, 'catalog');
      if (!s.suppliers) s.suppliers = [];
      const sup = s.suppliers.find(x => x.id === id);
      if (!sup) throw fail(404, 'NOT_FOUND', 'Supplier not found.');

      sup.accredited = !sup.accredited;
      save(s);

      if (supabase) {
        try {
          await supabase.from('suppliers').update({ accredited: sup.accredited }).eq('id', sup.id);
        } catch (e) {}
      }

      logAudit('SUPPLIER_STATUS_CHANGED', `Supplier #${sup.id}`, `Changed accreditation for "${sup.name}" to ${sup.accredited ? 'Accredited' : 'Suspended'}`, u);
      return { ok: true, supplier: sup };
    }),

    createPart: (p) => wrap(() => {
      const s = load();
      const u = need(s, 'catalog');
      const fe = {};
      const id = (p.exact_id || '').trim().toUpperCase();
      if (!id) fe.exact_id = 'Exact part ID is required.';
      else if (s.parts.some((x) => x.exact_id.toUpperCase() === id)) fe.exact_id = 'This part ID already exists.';
      if (Object.keys(fe).length) throw fail(422, 'INVALID_INPUT', 'Please fix highlighted fields.', fe);
      
      const part = {
        id: nextId(s, 'p'),
        exact_id: id,
        description: (p.description || '').trim(),
        unit: 'piece',
        active: true,
        category: p.category || 'General'
      };
      s.parts.push(part);
      save(s);
      logAudit('CREATE_PART', `Part #${part.exact_id}`, `Registered new part ${part.exact_id} - ${part.description}`, u);
      return part;
    }),

    listOffers: () => wrap(() => { 
      const s = load(); 
      need(s, 'catalog'); 
      return s.offers; 
    }),

    saveOffer: (o) => wrap(() => {
      const s = load();
      const u = need(s, 'catalog');
      const fe = {};
      if (!o.part_id) fe.part_id = 'Choose a part.';
      if (!o.supplier_id) fe.supplier_id = 'Choose a supplier.';
      if (o.price_minor != null && (!Number.isInteger(o.price_minor) || o.price_minor < 0)) fe.price = 'Price must be 0 or more.';
      if (o.recorded_quantity != null && (!Number.isInteger(o.recorded_quantity) || o.recorded_quantity < 0)) fe.recorded_quantity = 'Quantity must be a whole number, 0 or more.';
      if (o.checked_date && !/^\d{4}-\d{2}-\d{2}$/.test(o.checked_date)) fe.checked_date = 'Use a valid date (YYYY-MM-DD).';
      if (Object.keys(fe).length) throw fail(422, 'INVALID_INPUT', 'Please fix highlighted fields.', fe);

      const clean = {
        part_id: o.part_id,
        supplier_id: o.supplier_id,
        price_minor: o.price_minor,
        currency: (o.currency || s.policy.currency || 'PHP').toUpperCase(),
        price_basis: o.price_basis || 'per_piece',
        recorded_quantity: o.recorded_quantity,
        checked_date: o.checked_date || null,
        source_reference: (o.source_reference || '').trim() || null,
        active: o.active !== false,
      };

      let resultOffer = null;
      if (o.id) {
        const cur = s.offers.find((x) => x.id === o.id);
        if (!cur) throw fail(404, 'NOT_FOUND', 'Offer not found.');
        if (cur.revision !== o.revision) {
          throw fail(409, 'REVISION_CONFLICT', 'This offer was modified by another user. Reload and retry.');
        }
        Object.assign(cur, clean, { revision: cur.revision + 1 });
        resultOffer = cur;
      } else {
        const created = Object.assign({ id: nextId(s, 'o'), revision: 1, synthetic: false }, clean);
        s.offers.push(created);
        resultOffer = created;
      }
      save(s);

      // Async sync to Supabase Cloud
      if (supabase) {
        (async () => {
          try {
            const sup = s.suppliers.find(x => x.id === resultOffer.supplier_id);
            const prt = s.parts.find(x => x.id === resultOffer.part_id);
            const supName = sup ? sup.name : (resultOffer.source || 'Direct Accredited Supplier');
            const exactPartId = prt ? prt.exact_id : resultOffer.part_id;

            const payload = {
              part_id: exactPartId,
              source: supName,
              price_minor: resultOffer.price_minor,
              qty: resultOffer.recorded_quantity || 0,
              checked_date: resultOffer.checked_date || new Date().toISOString().slice(0, 10),
              active: resultOffer.active !== false
            };

            const { data: existing } = await supabase.from('catalog_offers').select('id, part_id, source').eq('part_id', exactPartId);
            const match = (existing || []).find(e => (e.source || '').toLowerCase() === supName.toLowerCase());
            if (match) {
              await supabase.from('catalog_offers').update(payload).eq('id', match.id);
            } else {
              await supabase.from('catalog_offers').insert([payload]);
            }
          } catch (e) {
            console.warn('Supabase catalog_offers sync notice:', e);
          }
        })();
      }

      logAudit(o.id ? 'UPDATE_OFFER' : 'CREATE_OFFER', `Offer #${resultOffer.id}`, `${o.id ? 'Updated' : 'Created'} quote for part #${resultOffer.part_id}`, u);
      return resultOffer;
    }),

    bumpOfferForDemo: (offerId) => wrap(() => {
      const s = load();
      const o = s.offers.find((x) => x.id === offerId);
      if (o) {
        o.revision = (o.revision || 1) + 1;
        if (o.price_minor != null) o.price_minor += 2500; // bump by ₱25.00
        save(s);
      }
      return {};
    }),

    /* ---------- BULK CSV SUPPLIER CATALOG UPLOAD & UPSERT ---------- */
    bulkUpsertOffers: (items, fileName) => wrap(async () => {
      const s = load();
      const u = need(s, 'catalog');
      if (!Array.isArray(items) || !items.length) {
        throw fail(400, 'EMPTY_BATCH', 'No valid catalog items to import.');
      }

      const today = new Date().toISOString().slice(0, 10);
      let addedCount = 0;
      let updatedCount = 0;
      const updatedOffers = [];

      for (const item of items) {
        if (!item.part_id || !item.source) continue;

        const partIdTrimmed = String(item.part_id).trim();
        const sourceTrimmed = String(item.source).trim();
        const cleanPrice = parseFloat(String(item.unit_price).replace(/[^0-9.-]+/g, '')) || 0;
        const priceMinor = Number.isInteger(item.price_minor) ? item.price_minor : Math.round(cleanPrice * 100);
        const stockInt = parseInt(String(item.stock).replace(/[^0-9-]+/g, ''), 10) || 0;
        const attrSource = (item.attributed_source || '').trim() || fileName || 'Bulk CSV Upload';

        // 1. Ensure Part exists in s.parts
        let part = s.parts.find((p) => 
          (p.exact_id && p.exact_id.toLowerCase() === partIdTrimmed.toLowerCase()) || 
          (p.id && p.id.toLowerCase() === partIdTrimmed.toLowerCase())
        );
        if (!part) {
          part = {
            id: nextId(s, 'p'),
            exact_id: partIdTrimmed,
            description: item.description || partIdTrimmed,
            unit: 'piece',
            active: true,
            category: 'General'
          };
          s.parts.push(part);
        } else if (item.description && (!part.description || part.description === part.exact_id)) {
          part.description = item.description;
        }

        // 2. Ensure Supplier exists in s.suppliers
        let sup = s.suppliers.find((sp) => 
          (sp.name && sp.name.toLowerCase() === sourceTrimmed.toLowerCase()) || 
          (sp.id && sp.id.toLowerCase() === sourceTrimmed.toLowerCase())
        );
        if (!sup) {
          sup = {
            id: nextId(s, 's'),
            name: sourceTrimmed,
            location: 'Philippines',
            accredited: true
          };
          s.suppliers.push(sup);
        }

        // 3. Smart upsert matching on (part_id + source) case-insensitively
        const existingOffer = s.offers.find((o) => {
          const oPart = s.parts.find((p) => p.id === o.part_id);
          const oExactId = oPart ? oPart.exact_id : o.part_id;
          const oSup = s.suppliers.find((sp) => sp.id === o.supplier_id);
          const oSupName = oSup ? oSup.name : (o.source || o.supplier_id || '');
          return oExactId.toLowerCase() === partIdTrimmed.toLowerCase() &&
                 oSupName.toLowerCase() === sourceTrimmed.toLowerCase();
        });

        if (existingOffer) {
          existingOffer.price_minor = priceMinor;
          existingOffer.recorded_quantity = stockInt;
          existingOffer.qty = stockInt;
          existingOffer.checked_date = today;
          existingOffer.source_reference = attrSource;
          existingOffer.active = true;
          existingOffer.currency = 'PHP';
          existingOffer.price_basis = 'per_piece';
          existingOffer.revision = (existingOffer.revision || 1) + 1;
          if (item.description && part) {
            part.description = item.description;
          }
          updatedOffers.push(existingOffer);
          updatedCount++;
        } else {
          const newOffer = {
            id: nextId(s, 'o'),
            part_id: part.id,
            supplier_id: sup.id,
            source: sourceTrimmed,
            price_minor: priceMinor,
            currency: 'PHP',
            price_basis: 'per_piece',
            recorded_quantity: stockInt,
            qty: stockInt,
            checked_date: today,
            source_reference: attrSource,
            active: true,
            is_active: true,
            revision: 1,
            synthetic: false
          };
          s.offers.push(newOffer);
          updatedOffers.push(newOffer);
          addedCount++;
        }
      }

      save(s);

      // 4. Supabase Synchronization
      if (supabase) {
        try {
          const { data: cloudOffers } = await supabase.from('catalog_offers').select('id, part_id, source');
          for (const item of items) {
            const partIdTrimmed = String(item.part_id).trim();
            const sourceTrimmed = String(item.source).trim();
            const cleanPrice = parseFloat(String(item.unit_price).replace(/[^0-9.-]+/g, '')) || 0;
            const priceMinor = Number.isInteger(item.price_minor) ? item.price_minor : Math.round(cleanPrice * 100);
            const stockInt = parseInt(String(item.stock).replace(/[^0-9-]+/g, ''), 10) || 0;
            const attrSource = (item.attributed_source || '').trim() || fileName || 'Bulk CSV Upload';

            const payload = {
              part_id: partIdTrimmed,
              source: sourceTrimmed,
              price_minor: priceMinor,
              qty: stockInt,
              checked_date: today,
              active: true
            };

            const existingCloud = (cloudOffers || []).find((co) => 
              co.part_id && co.part_id.toLowerCase() === partIdTrimmed.toLowerCase() &&
              co.source && co.source.toLowerCase() === sourceTrimmed.toLowerCase()
            );

            if (existingCloud) {
              await supabase.from('catalog_offers').update(payload).eq('id', existingCloud.id);
            } else {
              await supabase.from('catalog_offers').insert([payload]);
            }
          }
        } catch (cloudErr) {
          console.warn('Supabase bulk upsert notice:', cloudErr);
        }
      }

      // 5. Audit Logging
      logAudit(
        'CATALOG_CSV_UPLOAD',
        'Catalog Offers',
        `Bulk CSV Upload (${fileName || 'supplier_catalog.csv'}): ${addedCount} added, ${updatedCount} updated (${items.length} total rows processed)`,
        u
      );

      return {
        success: true,
        addedCount,
        updatedCount,
        totalProcessed: items.length,
        fileName: fileName || 'supplier_catalog.csv'
      };
    }),

    /* ---------- BOM LISTS & WORKSPACES ---------- */
    listLists: () => wrap(() => { 
      const s = load(); 
      const u = need(s, 'lists'); 
      if (u.role === 'administrator' || u.role === 'admin') return s.lists;
      return s.lists.filter((l) => l.owner_id === u.id); 
    }),

    getList: (id) => wrap(() => { 
      const s = load(); 
      const u = need(s, 'lists'); 
      return ownList(s, u, id); 
    }),

    createList: (title) => wrap(() => {
      const s = load();
      const u = need(s, 'lists');
      if (!(title || '').trim()) {
        throw fail(422, 'INVALID_INPUT', 'Title is required.', { title: 'Enter a project title.' });
      }
      const l = { 
        id: nextId(s, 'l'), 
        owner_id: u.id, 
        title: title.trim(), 
        revision: 1, 
        archived: false, 
        lines: [] 
      };
      s.lists.push(l);
      save(s);
      logAudit('CREATE_BOM_LIST', `BOM #${l.id}`, `Created new parts list "${l.title}"`, u);
      return l;
    }),

    updateList: (id, revision, title, lines, archived) => wrap(() => {
      const s = load();
      const u = need(s, 'lists');
      const l = ownList(s, u, id);
      if (l.revision !== revision) {
        throw fail(409, 'REVISION_CONFLICT', 'This list was changed by another session. Reload to see latest version.');
      }
      const fe = validateLines(s, lines);
      const te = (title || '').trim() ? null : 'Enter a project title.';
      if (te || Object.keys(fe).length) {
        throw fail(422, 'INVALID_INPUT', 'Please fix highlighted line fields.', { title: te, lines: fe });
      }
      l.title = title.trim();
      l.archived = !!archived;
      l.lines = lines.map((ln) => ({ 
        id: ln.id || nextId(s, 'ln'), 
        part_id: ln.part_id, 
        quantity: ln.quantity 
      }));
      l.revision += 1;
      save(s);

      // Async sync to Supabase Cloud
      if (supabase && l.lines.length > 0) {
        (async () => {
          try {
            const bomRows = l.lines.map(ln => {
              const p = s.parts.find(x => x.id === ln.part_id);
              return {
                list_id: l.id,
                part_id: p ? p.exact_id : ln.part_id,
                name: p ? p.description : ln.part_id,
                qty: ln.quantity,
                quantity: ln.quantity,
                updated_at: new Date().toISOString()
              };
            });
            await supabase.from('bom_items').insert(bomRows);
          } catch (e) {}
        })();
      }

      logAudit('UPDATE_BOM_LIST', `BOM #${l.id}`, `Saved changes to "${l.title}" (${l.lines.length} lines, Rev ${l.revision})`, u);
      return l;
    }),

    compare: (listId, selections) => wrap(() => {
      const s = load();
      const u = need(s, 'lists');
      const l = ownList(s, u, listId);
      return buildComparison(s, l, selections || {});
    }),

    saveSummary: (listId, payload) => wrap(() => {
      const s = load();
      const u = need(s, 'lists');
      const l = ownList(s, u, listId);
      
      const dup = s.summaries.find((x) => x.owner_id === u.id && x.save_token === payload.save_token);
      if (dup) return dup;

      const result = buildComparison(s, l, payload.selections || {});
      if (payload.list_revision !== result.list_revision || 
          payload.policy_version !== result.policy_version || 
          payload.review_fingerprint !== result.review_fingerprint) {
        throw fail(409, 'INPUT_CHANGED', 'Catalog, list, or policy rules changed since your review. Sourcing summary was not saved.');
      }

      let aiExplanation = '';
      if (window.PC_AI && typeof window.PC_AI.generateExecutiveSummary === 'function') {
        aiExplanation = window.PC_AI.generateExecutiveSummary(result, l.title, s.company_settings);
      }

      const sm = {
        id: nextId(s, 'sm'),
        owner_id: u.id,
        author_name: u.name,
        list_id: l.id,
        title: l.title,
        created_at: new Date().toISOString(),
        save_token: payload.save_token,
        status: result.summary.status,
        comparison: result,
        ai_executive_summary: aiExplanation,
      };

      s.summaries.push(sm);
      save(s);

      // Async sync frozen snapshot to Supabase Cloud
      if (supabase) {
        (async () => {
          try {
            await supabase.from('sourcing_summaries').insert([{
              id: sm.id,
              save_token: sm.save_token,
              name: sm.title || sm.name || 'Job Sourcing Decision',
              author_name: sm.author_name,
              saved_date: sm.saved_date,
              subtotal_minor: result.summary.subtotal_minor,
              status: result.summary.status,
              total_lines: sm.total_lines,
              resolved_count: sm.resolved_count,
              unresolved_count: sm.unresolved_count,
              ai_executive_summary: sm.ai_executive_summary,
              drift_notice: sm.drift_notice || 'Original calculation snapshot.',
              lines: sm.lines || [],
              created_at: sm.created_at || new Date().toISOString()
            }]);
          } catch (e) {}
        })();
      }

      logAudit('SUMMARY_SAVE', `Sourcing Decision #${sm.id}`, `Preserved job estimate (${sm.status}, ₱${(result.summary.subtotal_minor / 100).toFixed(2)})`, u);
      return sm;
    }),

    listSummaries: () => wrap(() => {
      const s = load();
      const u = need(s, 'summaries');
      const filtered = (u.role === 'administrator' || u.role === 'admin') 
        ? s.summaries 
        : s.summaries.filter((x) => x.owner_id === u.id);

      return filtered
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((x) => ({
          id: x.id,
          title: x.title,
          created_at: x.created_at,
          status: x.status,
          subtotal_minor: x.comparison.summary.subtotal_minor,
          unresolved_count: x.comparison.summary.unresolved_count,
          currency: x.comparison.currency,
          author_name: x.author_name || 'BOM Preparer'
        }));
    }),

    getSummary: (id) => wrap(() => {
      const s = load();
      const u = need(s, 'summaries');
      const x = s.summaries.find((y) => y.id === id);
      if (!x) throw fail(404, 'NOT_FOUND', 'Sourcing summary not found.');
      if (u.role !== 'administrator' && u.role !== 'admin' && x.owner_id !== u.id) {
        throw fail(403, 'FORBIDDEN', 'Access denied to this summary.');
      }
      return x;
    }),

    /* ---------- SUPABASE CLOUD SYNC & STATUS API ---------- */
    getCloudStatus: async () => {
      if (!supabase) {
        return { connected: false, message: 'Supabase client not loaded. Running in local storage mode.' };
      }
      try {
        const start = performance.now();
        const { count, error } = await supabase.from('catalog_offers').select('*', { count: 'exact', head: true });
        const latency = Math.round(performance.now() - start);
        if (error) {
          return { connected: false, url: SUPABASE_URL, message: 'Supabase query error: ' + error.message };
        }
        return {
          connected: true,
          url: SUPABASE_URL,
          latencyMs: latency,
          offersCount: count || 0,
          message: `Connected to Supabase PostgreSQL (${latency}ms ping)`
        };
      } catch (err) {
        return { connected: false, url: SUPABASE_URL, message: err.message };
      }
    },

    syncToCloud: async () => {
      if (!supabase) throw new Error('Supabase client unavailable.');
      const s = load();
      let offersSynced = 0;
      let listsSynced = 0;
      let summariesSynced = 0;

      // 1. Sync Offers (ensuring source and qty are provided to satisfy non-null constraints)
      try {
        const { data: cloudOffers } = await supabase.from('catalog_offers').select('id, part_id, source');
        for (const off of s.offers) {
          const prt = s.parts.find(p => p.id === off.part_id);
          const sup = s.suppliers.find(x => x.id === off.supplier_id);
          const exactPartId = prt ? prt.exact_id : off.part_id;
          const supName = sup ? sup.name : (off.source || 'Direct Accredited Supplier');

          const payload = {
            part_id: exactPartId,
            source: supName,
            price_minor: off.price_minor || 0,
            qty: off.recorded_quantity || off.qty || 0,
            checked_date: off.checked_date || new Date().toISOString().slice(0, 10),
            active: off.active !== false
          };

          const existing = (cloudOffers || []).find(co => 
            co.part_id && co.part_id.toLowerCase() === exactPartId.toLowerCase() &&
            co.source && co.source.toLowerCase() === supName.toLowerCase()
          );

          if (existing) {
            const { error: updErr } = await supabase.from('catalog_offers').update(payload).eq('id', existing.id);
            if (!updErr) offersSynced++;
          } else {
            const { error: insErr } = await supabase.from('catalog_offers').insert([payload]);
            if (!insErr) offersSynced++;
          }
        }
      } catch (offErr) {
        console.warn('Offers sync notice:', offErr);
      }

      // 2. Sync BOM Items
      try {
        const { data: cloudBoms } = await supabase.from('bom_items').select('id, part_id, name');
        for (const l of s.lists) {
          if (Array.isArray(l.lines)) {
            for (const ln of l.lines) {
              const prt = s.parts.find(p => p.id === ln.part_id);
              const exactPartId = prt ? prt.exact_id : ln.part_id;
              const bomPayload = {
                part_id: exactPartId,
                name: prt ? prt.description : exactPartId,
                qty: ln.quantity
              };

              const found = (cloudBoms || []).find(cb => cb.part_id === exactPartId && cb.name === bomPayload.name);
              if (found) {
                await supabase.from('bom_items').update(bomPayload).eq('id', found.id);
              } else {
                await supabase.from('bom_items').insert([bomPayload]);
              }
            }
          }
          listsSynced++;
        }
      } catch (bomErr) {
        console.warn('BOM items sync notice:', bomErr);
      }

      // 3. Sync Sourcing Summaries
      if (Array.isArray(s.summaries) && s.summaries.length) {
        try {
          const { data: cloudSums } = await supabase.from('sourcing_summaries').select('id');
          for (const sm of s.summaries) {
            const found = (cloudSums || []).find(cs => cs.id === sm.id);
            if (!found) {
              const sumPayload = {
                id: sm.id,
                save_token: sm.save_token,
                name: sm.title || sm.name || 'Job Sourcing Decision',
                author_name: sm.author_name,
                saved_date: sm.saved_date,
                subtotal_minor: sm.subtotal_minor,
                status: sm.status,
                total_lines: sm.total_lines,
                resolved_count: sm.resolved_count,
                unresolved_count: sm.unresolved_count,
                ai_executive_summary: sm.ai_executive_summary,
                drift_notice: sm.drift_notice || 'Original calculation snapshot.',
                lines: sm.lines || [],
                created_at: sm.created_at || new Date().toISOString()
              };
              const { error } = await supabase.from('sourcing_summaries').insert([sumPayload]);
              if (!error) summariesSynced++;
            }
          }
        } catch (sumErr) {
          console.warn('Summaries sync notice:', sumErr);
        }
      }

      // 4. Sync Company Settings (safe against missing table)
      let companySettingsSynced = false;
      if (s.company_settings) {
        try {
          const csPayload = {
            id: 1,
            business_name: s.company_settings.business_name || 'AMGC Airconditioning Services',
            business_type: s.company_settings.business_type || 'Commercial & Industrial HVAC Services',
            location: s.company_settings.location || 'V.V. Soliven Ave. II, Cainta, Rizal, Philippines',
            currency_code: s.company_settings.currency_code || 'PHP',
            currency_symbol: s.company_settings.currency_symbol || '₱',
            max_quote_age_days: s.company_settings.max_quote_age_days || 14,
            mcda_cost_weight: (s.company_settings.mcda_cost_weight || 40) / 100,
            mcda_stock_weight: (s.company_settings.mcda_stock_weight || 30) / 100,
            mcda_freshness_weight: (s.company_settings.mcda_freshness_weight || 20) / 100,
            mcda_consolidation_weight: (s.company_settings.mcda_consolidation_weight || 10) / 100,
            updated_at: new Date().toISOString()
          };
          const { error: csErr } = await supabase.from('company_settings').upsert([csPayload]);
          if (!csErr) companySettingsSynced = true;
        } catch (csEx) {
          console.warn('Company settings table sync skipped:', csEx);
        }
      }

      // 5. Sync Account Provisioning & Verified Password Reset Requests
      if (s.account_requests && s.account_requests.length) {
        try {
          await supabase.from('account_requests').upsert(s.account_requests, { onConflict: 'id' });
        } catch (arEx) {}
      }
      if (s.password_reset_requests && s.password_reset_requests.length) {
        try {
          await supabase.from('password_reset_requests').upsert(s.password_reset_requests, { onConflict: 'id' });
        } catch (pwrEx) {}
      }
      if (s.suppliers && s.suppliers.length) {
        try {
          await supabase.from('suppliers').upsert(s.suppliers, { onConflict: 'id' });
        } catch (supEx) {}
      }

      return {
        success: true,
        offersSynced,
        listsSynced,
        summariesSynced,
        companySettingsSynced
      };
    },

    newToken: uuid,
  };

  // Realtime Supabase Channel
  let realtimeChannel = null;
  function setupRealtime() {
    if (!supabase || typeof supabase.channel !== 'function') return;
    try {
      realtimeChannel = supabase
        .channel('public-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'catalog_offers' },
          (payload) => {
            console.log('⚡ Realtime catalog_offers event:', payload);
            window.dispatchEvent(new CustomEvent('pc:realtime-catalog', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'company_settings' },
          (payload) => {
            console.log('⚡ Realtime company_settings event:', payload);
            if (payload && payload.new) {
              const s = load();
              s.company_settings = Object.assign({}, s.company_settings, payload.new);
              save(s);
              window.dispatchEvent(new CustomEvent('pc:realtime-branding', { detail: payload.new }));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'audit_logs' },
          (payload) => {
            console.log('⚡ Realtime audit_logs event:', payload);
            window.dispatchEvent(new CustomEvent('pc:realtime-audit', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'account_requests' },
          (payload) => {
            window.dispatchEvent(new CustomEvent('pc:realtime-audit', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'password_reset_requests' },
          (payload) => {
            window.dispatchEvent(new CustomEvent('pc:realtime-audit', { detail: payload }));
          }
        )
        .subscribe((status) => {
          console.log('⚡ Supabase Realtime channel status:', status);
          window.__pc_realtime_status = status;
          window.dispatchEvent(new CustomEvent('pc:realtime-status', { detail: status }));
        });
    } catch (e) {
      console.warn('Realtime channel error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', setupRealtime);
    } else {
      setupRealtime();
    }
  }

  window.PC_API = api;
})();
