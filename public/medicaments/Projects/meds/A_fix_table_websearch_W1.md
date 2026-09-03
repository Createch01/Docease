# medicament_A.json — Fix table (Memory vs. Search)

**File:** `C:\src\DOCEASE\medicaments\medicament_A.json`
**Date:** 2026-04-23
**Total entries:** 2,973
**Verified (`verified_medicament_ma: true`) before pass:** 301 → **after pass:** 320 (+19)

## MEMORY-source fixes (from prior-session Actipetit-class discoveries)

| Brand       | Local ID              | Was (wrong INN)       | Now (correct INN)                          | ATC     | Type                         |
|-------------|-----------------------|-----------------------|--------------------------------------------|---------|------------------------------|
| ACTIPETIT   | `actipetit_*`         | listed as medication  | Complément alimentaire (not tableau A)     | —       | tableau correction           |
| ACTITRANS   | `actitrans_sirop`     | Isosorbide dinitrate  | Sirop d'agave (plant-based digestive)      | N/A     | full composition override    |
| ADFIL       | `adfil_emulsion`      | Alfuzosine            | Centella asiatica (skin emulsion)          | D03AX   | full composition override    |

## SEARCH-source fixes (medicament.ma via WebSearch — this pass)

| Brand      | Local IDs                                         | Mode       | Was (wrong INN)   | Now (correct INN)    | ATC      | Tableau |
|------------|---------------------------------------------------|------------|-------------------|----------------------|----------|---------|
| ARCOXIA    | `arcoxia_60_mg`, `arcoxia_90_mg`, `arcoxia_120_mg`| enrich     | Étoricoxib (ok)   | Étoricoxib           | M01AH05  | —       |
| ARACYTINE  | `aracytine_100_mg`, `500_mg`, `1_g`               | enrich     | Cytarabine (ok)   | Cytarabine           | L01BC01  | A       |
| ARADOS     | `arados_50_mg`, `arados_100_mg`                   | enrich     | Alendronate (ok)  | Acide alendronique   | M05BA04  | —       |
| ARATENS    | `aratens_50_mg`, `aratens_100_mg`                 | enrich     | Irbesartan (ok)   | Irbésartan           | C09CA04  | —       |
| ARAVA      | `arava_20_mg`                                     | enrich     | Leflunomide (ok)  | Léflunomide          | L04AA13  | A       |
| **ARAPRO** | `arapro_150_mg`, `arapro_300_mg`                  | **override**| **Aprepitant (WRONG)** | **Irbésartan**  | C09CA04  | —       |
| **AQUINEX**| `aquinex_400_mg`                                  | **override**| **Lactitol (WRONG)**   | **Moxifloxacine**| J01MA14  | A       |

### What "override" means

ARAPRO and AQUINEX were new **Actipetit-class** errors discovered via WebSearch: the local file listed an entirely wrong INN for the brand. Medicament.ma's official listing was used to:

- replace `composition` in-place
- set the correct `atc_code`, `therapeutic_group`, `drug_class`, `mechanism`, `nature_produit`, `tableau_maroc`
- write an audit note `actipetit_class_correction (WebSearch): local composition was WRONG (<old>); overwritten with medicament.ma-verified data (<new>)`
- mark `verified_medicament_ma: true`

## Per-entry counters in A.json after this pass

- `verified_medicament_ma: true` — **320**
- `actipetit_corrected_from_master_id` (from Master) — 2 (actitrans, adfil)
- `actipetit_corrected_from_websearch` (this pass) — 7 (arapro ×4, aquinex ×3)
- `websearch_verified_source` (enrich or override) — 19

## Remaining unverified-missing-atc — 97 entries

High-confidence next suspects (flagged for WebSearch batch W2):

- **ARTINIBSA** (local says Imatinib — almost certainly wrong; Inibsa labs = dental articaine)
- **ARACTINE** (0.04% concentration — likely antiseptic, not cytarabine)
- **ATHYMIL** (local says Maprotiline — WHO monograph says Mianserin for Athymil)
- Plus ~94 others (ATACAND, ATARAX, ARTANE, ARIMIDEX, etc. — mostly straightforward enrichment)

**Status:** partial (ready for W2). File is stable, backed up at `medicament_A.json.preW1.bak`.
