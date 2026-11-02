# PartsCompare — AMGC Airconditioning Services & ICCT Nexus

> **A Web-Based Bill of Materials Comparison & AI Sourcing Intelligence System**  
> *Collaboration between AMGC Airconditioning Services (Cainta, Rizal) & ICCT Colleges Project Nexus (CEDT)*

PartsCompare is an auditable decision-support and procurement intelligence system designed to reconcile exact-part HVAC BOMs against curated, dated quotations from accredited Philippine suppliers (**Everwell Parts & Equipment Corp.**, **C&C Airconditioning Supply**, and **Manco Refrigeration Supply**).

---

## Key Features & Modular Architecture

- **1. AI Part Normalization & CSV Import Engine (`js/ai.js`):**
  - Parses unstructured supplier text or pasted CSVs.
  - Normalizes varied descriptions into standardized exact-part catalog SKUs with confidence scoring and quantity extraction.
- **2. Multi-Objective AI Sourcing Strategies:**
  - ⚡ **Lowest Cost (₱):** Greedy cost minimizer selecting lowest eligible quotation per line.
  - 📦 **Single-Supplier Consolidation:** Concentrates orders with the primary Philippine distributor to minimize vendor management overhead.
  - 🛡️ **Stock Resilience:** Prioritizes suppliers with the highest recorded warehouse stock headroom.
  - ⚖️ **Balanced MCDA:** Multi-Criteria Decision Analysis balancing price (50%), stock availability (25%), and date freshness (25%).
- **3. Intelligent Sourcing Summary & Decision Explanation:**
  - Automatically compiles an AI executive narrative detailing financial verdicts, vendor allocations, and compliance explanations (14-day freshness rules, full-line quantity coverage).
  - Permanent snapshot freezing with cryptographic review fingerprints.
  - 1-click Markdown briefing export and AMGC printable sourcing job sheet.
- **4. Supabase Cloud PostgreSQL Sync (`js/adapter.js`):**
  - Live connection to Supabase Cloud (`https://xahcgiwwyaskazgbgejh.supabase.co`).
  - Tables: `catalog_offers`, `bom_items`, `sourcing_summaries`, `audit_logs`.
  - Offline-first local fallback ensuring zero downtime.
- **5. Interactive AI Copilot & Knowledge Drawer:**
  - Searchable FAQs, policy explainers, and instant interactive answers for HVAC part prices and procurement rules.

---

## Directory Layout

```text
├── index.html                   # HTML shell with Supabase SDK & modular scripts
├── supabase-schema.sql          # Cloud PostgreSQL schema, RLS policies, audit triggers
├── css/
│   └── styles.css               # Design system, dark/light theme, modals, print styles
├── js/
│   ├── fixtures.js              # Philippine HVAC parts, suppliers, users, default policy
│   ├── ai.js                    # AI Part Normalization, CSV Importer, MCDA & Executive Summaries
│   ├── adapter.js               # Data adapter, rule engine, snapshot freezing, Supabase sync
│   ├── art.js                   # Dynamic SVG graphics and circuit illustrations
│   ├── landing.js               # Public landing page with interactive eligibility simulator
│   ├── preparer.js              # Preparer workspace dashboard metrics & guidance
│   └── app.js                   # Router, views, modals, event delegation, and AI Copilot
└── scratch/
    └── test_comprehensive_suite.html # Headless Edge end-to-end verification suite (33/33 PASS)
```

---

## Demo Credentials

| Role | Username | Team Member | Primary Functions |
|---|---|---|---|
| **Preparer (Maker)** | `dave_pm` (or `preparer`) | Christian Dave D. Guiyab | Create BOMs, AI CSV import, run comparisons, freeze summaries |
| **Maintainer** | `pearl_dba` (or `maintainer`) | Pearl Alexa J. Catequista | Curate HVAC parts, log Philippine supplier quotations, track 14-day dates |
| **Administrator** | `karen_admin` (or `admin`) | Karen Reyes | Manage global policy, Supabase cloud sync, audit logs |

*Default password:* `demo`
