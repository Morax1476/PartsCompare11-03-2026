/* 
 * AMGC Airconditioning Services & Universal Enterprise PartsCompare
 * REAL PHILIPPINE HVAC FIXTURES & SEED DATA
 * Suppliers: Everwell Parts & Equipment Corp., C&C Airconditioning Supply, Manco Refrigeration Supply
 */
(function () {
  function dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  const o = (id, part_id, supplier_id, price_minor, qty, ago, src, active = true) => ({
    id,
    part_id,
    supplier_id,
    price_minor,
    currency: 'PHP',
    price_basis: 'per_piece',
    recorded_quantity: qty,
    checked_date: ago === null ? null : dateOffset(-ago),
    source_reference: src,
    active,
    revision: 1,
    synthetic: false,
  });

  window.PC_FIXTURES = {
    company_settings: {
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
    },
    users: [
      { id: 'u1', username: 'dave_pm', alias: 'preparer', name: 'Christian Dave D. Guiyab', role: 'preparer', is_active: true, recovery_pin: '240811', security_question: 'What city or municipality were you born in?', security_answer: 'cainta' },
      { id: 'u2', username: 'pearl_dba', alias: 'maintainer', name: 'Pearl Alexa J. Catequista', role: 'maintainer', is_active: true, recovery_pin: '350922', security_question: 'What city or municipality were you born in?', security_answer: 'quezon city' },
      { id: 'u3', username: 'karen_admin', alias: 'admin', name: 'Karen Reyes', role: 'administrator', is_active: true, recovery_pin: '890415', security_question: 'What city or municipality were you born in?', security_answer: 'manila' },
    ],
    account_requests: [
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
    ],
    password_reset_requests: [],
    reset_lockouts: {},
    suppliers: [
      { id: 's1', name: 'Everwell Parts & Equipment Corp.', location: 'Caloocan & Manila, Philippines', accredited: true },
      { id: 's2', name: 'C&C Airconditioning Supply', location: 'Quezon City & Rizal, Philippines', accredited: true },
      { id: 's3', name: 'Manco Refrigeration Supply', location: 'Mandaluyong & Cainta, Philippines', accredited: true },
    ],
    parts: [
      { id: 'p1', exact_id: 'CBB65-45UF-450V', description: 'Dual Run Motor Capacitor 45µF 450VAC (Round aluminum can)', unit: 'piece', active: true, category: 'Capacitors' },
      { id: 'p2', exact_id: 'HCC-1XU02AA', description: 'Heavy Duty Defrost Contactor 30A 1-Pole 240V Coil', unit: 'piece', active: true, category: 'Contactors' },
      { id: 'p3', exact_id: 'R410A-CAN-1KG', description: 'Virgin Refrigerant R410A Sealed Canister 1 kg', unit: 'piece', active: true, category: 'Refrigerants' },
      { id: 'p4', exact_id: 'NTC-10K-COPPER', description: 'Precision Temperature Sensor Probe NTC 10kΩ Copper Head', unit: 'piece', active: true, category: 'Sensors' },
      { id: 'p5', exact_id: 'QD-U11A', description: 'Universal Split-Type A/C Digital Control Board System & Remote', unit: 'piece', active: true, category: 'PCBs' },
      { id: 'p6', exact_id: 'RPG20B', description: 'Indoor Blower Fan Motor 20W 220V 4-Speed (Welling/Midea)', unit: 'piece', active: true, category: 'Motors' },
    ],
    offers: [
      // p1: CBB65-45UF-450V (Capacitor)
      o('o1', 'p1', 's1', 38000, 45, 2, 'Everwell Parts Official Wholesale Quotation #EW-2026-4491'), // ₱380.00 - Lowest
      o('o2', 'p1', 's2', 42000, 30, 4, 'C&C Airconditioning Supply Catalog Sheet #CC-8820'),         // ₱420.00
      o('o3', 'p1', 's3', 39500, 3,  1, 'Manco Refrigeration Price Bulletin #MB-1102'),             // ₱395.00 (Low stock: 3 pcs)

      // p2: HCC-1XU02AA (Contactor)
      o('o4', 'p2', 's1', 48000, 25, 3, 'Everwell Parts Official Wholesale Quotation #EW-2026-4491'), // ₱480.00
      o('o5', 'p2', 's2', 45000, 40, 1, 'C&C Airconditioning Supply Catalog Sheet #CC-8820'),         // ₱450.00 - Lowest
      o('o6', 'p2', 's3', 51000, 20, 28, 'Manco Refrigeration Stale Slip #MB-9941'),                   // ₱510.00 (Stale: 28 days ago)

      // p3: R410A-CAN-1KG (Refrigerant)
      o('o7', 'p3', 's1', 75000, 60, 2, 'Everwell Parts Bulk Refrigerant List #EW-GAS-09'),           // ₱750.00
      o('o8', 'p3', 's2', 72000, 50, 2, 'C&C Wholesale Refrigerant Price Bulletin #CC-GAS-14'),       // ₱720.00 - Lowest
      o('o9', 'p3', 's3', 78000, 15, 5, 'Manco Retail Quotation #MB-4021'),                           // ₱780.00

      // p4: NTC-10K-COPPER (Sensor Probe)
      o('o10', 'p4', 's1', 14000, 80, 1, 'Everwell Parts Sensors & Thermistors #EW-SEN-301'),         // ₱140.00
      o('o11', 'p4', 's2', 12500, 100, 2, 'C&C Sensor Price List #CC-SEN-102'),                       // ₱125.00 - Lowest
      o('o12', 'p4', 's3', 13500, 60, 3, 'Manco Refrigeration Electronic Probes #MB-SEN-44'),        // ₱135.00

      // p5: QD-U11A (Universal Control Board)
      o('o13', 'p5', 's1', 115000, 18, 3, 'Everwell Parts Universal Boards Catalog #EW-PCB-88'),       // ₱1,150.00 - Lowest
      o('o14', 'p5', 's2', 125000, 25, 2, 'C&C Airconditioning Universal PCB #CC-PCB-99'),            // ₱1,250.00
      o('o15', 'p5', 's3', 130000, 10, 4, 'Manco Refrigeration Control Modules #MB-PCB-15'),          // ₱1,300.00

      // p6: RPG20B (Indoor Fan Motor)
      o('o16', 'p6', 's1', 165000, 12, 2, 'Everwell Parts HVAC Motors Dispatch #EW-MOT-55'),          // ₱1,650.00 - Lowest
      o('o17', 'p6', 's2', 175000, 15, 3, 'C&C Blower Motors Reference #CC-MOT-41'),                  // ₱1,750.00
      o('o18', 'p6', 's3', null,   8,  2, 'Manco Price Pending Inbound Shipment', true),              // Unpriced test case
    ],
    lists: [
      {
        id: 'l1',
        owner_id: 'u1',
        title: 'Split-Type AC Overhaul (Job #AC-2026-088)',
        revision: 1,
        archived: false,
        lines: [
          { id: 'ln1', part_id: 'p1', quantity: 2 }, // CBB65-45UF-450V x 2
          { id: 'ln2', part_id: 'p2', quantity: 1 }, // HCC-1XU02AA x 1
          { id: 'ln3', part_id: 'p3', quantity: 2 }, // R410A-CAN-1KG x 2
          { id: 'ln4', part_id: 'p4', quantity: 3 }, // NTC-10K-COPPER x 3
          { id: 'ln5', part_id: 'p5', quantity: 1 }, // QD-U11A x 1
        ],
      },
    ],
    summaries: [],
    policy: {
      version: 'POL-AMGC-01',
      max_age_days: 14,
      currency: 'PHP',
      synthetic: false,
    },
    counters: { id: 100, policy: 1 },
  };
})();