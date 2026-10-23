# Almsy Desk v1 (`projects/almsy/app/`)

Offline-first PWA for volunteer treasurers of Canadian registered charities, temples, gurdwaras, mosques, churches, sports clubs, and community organizations.

Upload a donation spreadsheet (`.csv` or `.xlsx`) → map columns → validate & fix errors inline → generate sequentially numbered Letter receipt PDFs on the organization's letterhead → download one `.zip` archive + a combined file-copy PDF + a permanent receipt register CSV. **Donor data never leaves the computer.**

---

## 1. Local Development & Testing

### Run Unit & Acceptance Tests (`node --test`)
```powershell
node --test projects/almsy/app/tests/*.test.mjs
```

### Serve Locally in Browser
```powershell
npx --yes serve projects/almsy/app -l 4174
```
Then open `http://localhost:4174` in Chrome/Edge.

---

## 2. Architecture & File Layout

```
projects/almsy/app/
  index.html              # Single-page PWA shell & step navigation
  styles.css              # Editorial dossier styling (--ink, --paper, --blue, --green, --red)
  app.js                  # 4-step UI controller (Profile -> Import & Map -> Validate -> Generate & Register)
  manifest.webmanifest    # Sub-path ready PWA manifest
  sw.js                   # Cache-first service worker (almsy-desk-v1)
  lib/
    cra-text.js           # All user-facing CRA & compliance wording (verified against canada.ca 2026-10-23)
    money.js              # Integer-cent CAD parser & en-CA formatter (English & French-Canadian formats)
    validate.js           # CRA reg-number regex, Canadian postal regex, date parser, row validator & manual review router
    db.js                 # IndexedDB wrapper (settings, orgProfile, permanent receipt register) + memory adapter
    org-profile.js        # Org profile validator, JSON export/import, and sample charity/club presets
    parse.js              # RFC-4180 CSV parser + SheetJS XLSX parser
    mapping.js            # Column auto-guess across 5+ spreadsheet header styles + saved mappings
    aggregate.js          # Per-gift vs Annual consolidated donor aggregation + merge confirmation list
    numbering.js          # Sequential receipt numbering (never reused, never decremented) + VOID trail + CSV export
    receipt-model.js      # Strict CRA §3 11-requirement receipt model builder & validator
    generate-run.js       # End-to-end batch runner (PDF generation + fflate ZIP + register commit)
  pdf/
    layout.js             # pdf-lib Letter (612x792) layout engine with embedded OFL fonts, logo, signature, and duplicate stub
  fixtures/
    sample-140.csv        # 140 realistic fake donor rows (with 20 repeat gifts to test both Per-Gift and Annual modes)
    messy.csv             # 12 rows covering every validation error type and out-of-scope manual review gift type
    sample.xlsx           # 25-row Excel workbook with split First/Middle/Last name columns
  fonts/                  # Self-hosted SIL OFL fonts (IBM Plex Serif + IBM Plex Sans TTF + OFL.txt)
  vendor/                 # Offline vendored ESM bundles (pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, fflate 0.8.2, xlsx 0.18.5 + LICENSES.txt)
  icons/                  # 192x192, 512x512, and maskable 512x512 PNG icons
  tests/                  # 11 Node test files (money, validate, db, org-profile, mapping, parse, aggregate, numbering, receipt-model, generate-run, acceptance)
```

---

## 3. Compliance & Safety Guardrails

1. **Two Strict Modes (`official` vs `acknowledgement`):**
   - **Official Donation Receipt (`official`):** Requires a valid CRA Registration Number (`^\d{9}RR\d{4}$`) and enforces all 11 CRA requirements in `lib/receipt-model.js`.
   - **Thank-You Acknowledgement (`acknowledgement`):** For non-registered clubs and community groups. Strips any registration number and prints an explicit non-tax statement (*"Thank-you acknowledgement — Not a tax receipt for income tax purposes."*).
2. **Centralized Wording (`lib/cra-text.js`):**
   - All CRA statements, `Canada Revenue Agency — canada.ca/charities-giving`, and the mandatory disclaimer footer (*"Almsy formats receipts from your records. Your organization is responsible for receipt eligibility. This is not tax advice."*) live in `lib/cra-text.js` (wording verified 2026-10-23 against the CRA pages linked in that file). Official receipts print the amount received, "Advantage received: None", and the eligible amount, because v1 only issues receipts for cash gifts with no advantage.
3. **Out-of-Scope Isolation ("Needs Manual Review"):**
   - Non-cash / in-kind gifts, split receipts with an advantage, and replacement receipts are automatically routed to the **"Needs Manual Review"** bucket and never enter generated receipts.
4. **Permanent Sequential Numbering & Void Trail:**
   - Stored in IndexedDB. Incremented only when receipts are generated, never decremented, and never reused even after a receipt is marked `VOID`.
5. **Re-prints come from the register snapshot:**
   - Each register entry stores the organization name/address/registration number, signer, payment method, and consolidated-gift list captured at issue time. The "PDF" button in the register re-renders from that snapshot, so a later profile edit never changes what an issued receipt says (logo and signature images come from the current profile).
6. **No double issue:**
   - After a run, the same row set cannot be generated again. Import a new spreadsheet to issue more, or re-print a single receipt from the register.
7. **Delivery note (CRA "Computer-generated receipts"):**
   - Printing and mailing the PDFs is fine. The CRA expects **emailed** receipts to be read-only, encrypted, and carry a secure electronic signature controlled by an authorized individual, and the charity must keep copies (the combined file-copy PDF + register CSV). Almsy v1 does not email receipts.

---

## 4. Review Log

- **2026-10-23 (Claude):** CRA wording verified; PDF layout fixes (long org names no longer overlap the serial box, signer line right-aligned and shrunk to fit, measured address wrapping, stub glyph fixed); ambiguous slash dates (`03/04/2026`) are now errors unless the column proves the order; register snapshot for faithful re-prints; official mode requires a signature image in the profile; annual merge confirmation and the double-issue guard are enforced on the Generate step; Void asks for confirmation; defaults derive from the current year. 27/27 tests.

---

## 5. Release rule

`sw.js` is cache-first. Computers that already installed the app keep serving the old shell until `CACHE_NAME` in `sw.js` changes, so bump it (`almsy-desk-v3`, `-v4`, ...) in every commit that is deployed.

## 6. Deploy (GitHub Pages, same pattern as Chanda)

Target: https://sakredstudio.github.io/almsy from a public repo `SakredStudio/almsy` that mirrors this folder (the monorepo stays the source of truth). From the sakred-os root, on master:

```powershell
git subtree push --prefix=projects/almsy/app https://github.com/SakredStudio/almsy.git main
```

`.github/workflows/deploy.yml` runs the 27 tests and publishes the folder. Enable Pages → Source: GitHub Actions on the repo once. Not deployed yet (2026-10-23): waiting on Soul's go and the domain decision (`almsy.ca`?).
