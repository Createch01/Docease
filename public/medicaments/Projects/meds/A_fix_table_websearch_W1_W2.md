# medicament_A.json — Cumulative Fix Table (Memory + Search W1 + W2)

**File:** `C:\src\DOCEASE\medicaments\medicament_A.json`
**Date:** 2026-04-23
**Total entries:** 2,973
**Verified at start → after W1 → after W2 → after W3:** 301 → 320 → 338 → **352** (+51 over three passes)

Backups: `medicament_A.json.preW1.bak`, `medicament_A.json.preW2.bak`, `medicament_A.json.preW3.bak`

---

## Memory-source fixes (prior-session discoveries)

| Brand | Was (wrong) | Now (correct) | ATC | Type |
|---|---|---|---|---|
| ACTIPETIT | medication tableau A | complément alimentaire | — | tableau correction |
| ACTITRANS | Isosorbide dinitrate | Sirop d'agave (plant digestive) | — | full override |
| ADFIL | Alfuzosine | Centella asiatica (skin emulsion) | D03AX | full override |

## W1 — medicament.ma via WebSearch (7 brands, 19 entries)

| Brand | IDs | Mode | Was | Now | ATC | Tab |
|---|---|---|---|---|---|---|
| ARCOXIA | ×4 | enrich | Étoricoxib | Étoricoxib | M01AH05 | — |
| ARACYTINE | ×3 | enrich | Cytarabine | Cytarabine | L01BC01 | A |
| ARADOS | ×2 | enrich | Alendronate | Acide alendronique | M05BA04 | — |
| ARATENS | ×2 | enrich | Irbesartan | Irbésartan | C09CA04 | — |
| ARAVA | ×1 | enrich | Leflunomide | Léflunomide | L04AA13 | A |
| **ARAPRO** | ×4 | **override** | **Aprepitant ❌** | **Irbésartan ✅** | C09CA04 | — |
| **AQUINEX** | ×3 | **override** | **Lactitol ❌** | **Moxifloxacine ✅** | J01MA14 | A |

## W3 — medicament.ma via WebSearch (9 brands, 14 entries; 1 skip)

| Brand | IDs | Mode | Was | Now | ATC | Tab |
|---|---|---|---|---|---|---|
| **ASTAPH** | ×5 | **override** | **Cloxacilline ❌** | **Flucloxacilline ✅** | J01CF05 | — |
| **ASUMATE** | ×1 | **override** | Lévonorgestrel (seul) | **Lévonorgestrel + Éthinylestradiol** | G03AA07 | C |
| **ARTYX** | ×2 | **override** | **Celecoxib ❌** | **Méloxicam ✅** | M01AC06 | — |
| **ASCABIOL** | ×1 | **override** | Benzoate de benzyle (seul) | **Benzoate + Sulfirame** | P03AX01 | — |
| **ARGENT COLLOIDAL** | ×1 | **override** | **Nitrate d'argent ❌** | **Argent colloïdal ✅** | C05AX | — |
| ASTHALIN | ×1 | enrich | Salbutamol | Salbutamol | R03AC02 | — |
| ATENOR | ×1 | enrich | Atenolol | Aténolol | C07AB03 | — |
| ARTROFOR | ×1 | enrich | Glucosamine | Glucosamine sulfate | M01AX05 | — |
| ARGININE VEYRON | ×1 | enrich | Arginine | Arginine | A14B | — |
| ~~ARITROZOLE~~ | — | skipped | — | no medicament.ma page found | — | — |

## W2 — medicament.ma via WebSearch (10 brands, 18 entries)

| Brand | IDs | Mode | Was | Now | ATC | Tab |
|---|---|---|---|---|---|---|
| **ARTINIBSA** | ×1 | **override** | **Imatinib ❌** | **Articaïne + Adrénaline ✅** | N01BB58 | — |
| **ARACTINE** | ×2 | **override** | **Cytarabine ❌** | **Cyproheptadine ✅** | R06AX02 | — |
| **ATHYMIL** | ×1 | **override** | **Maprotiline ❌** | **Miansérine ✅** | N06AX03 | — |
| **ARTEMON** | ×4 | **override** | **Artemether ❌** | **Périndopril + Amlodipine ✅** | C09BB04 | — |
| ATACAND | ×3 | enrich | Candesartan | Candésartan cilexétil | C09CA06 | — |
| ATARAX | ×2 | enrich | Hydroxyzine | Hydroxyzine | N05BB01 | — |
| ARIMIDEX | ×1 | enrich | Anastrozole | Anastrozole | L02BG03 | A |
| ARTANE | ×1 | enrich | Trihexyphenidyle | Trihexyphénidyle | N04AA01 | — |
| ARIXIB | ×2 | enrich | Etoricoxib | Étoricoxib | M01AH05 | — |
| AROMASINE | ×1 | enrich | Exemestane | Exémestane | L02BG06 | A |

## Running Actipetit-class scoreboard

Including prior Master-1-300 fixes (actipetit-class from medicament.ma listings):

| Source | Brands |
|---|---|
| Memory (actitrans, adfil) | 2 |
| WebSearch W1 | 2 (ARAPRO, AQUINEX) |
| WebSearch W2 | 4 (ARTINIBSA, ARACTINE, ATHYMIL, ARTEMON) |
| WebSearch W3 | **5 (ASTAPH, ASUMATE, ARTYX, ASCABIOL, ARGENT COLLOIDAL)** |
| **Total Actipetit-class errors caught** | **13** |

## Counters in A.json after W3

- `verified_medicament_ma: true` — **352**
- `actipetit_corrected_from_master_id` — 2
- `actipetit_corrected_from_websearch` — 25 entries (across 11 brands, pack duplicates included)
- `websearch_verified_source` — 51 entries

## What's left

Approximately ~65 unverified entries still missing `atc_code` after W3. Next batch candidates include: ATIVAN, AUGMENTIN, AVANDIA, AVELOX, AVODART, AZANTAC, AZELASTINE, AZERIO, AZOPT, AZILECT, etc.
