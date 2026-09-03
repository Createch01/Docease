// ─── Medicament admin: overlay persistence + audit trail ────────────────────
//
// Add/edit tool for the repertoire never touches the 26 generated
// public/medicaments/medicament_<L>_final.json files directly (those are
// scraped/regenerated data, and a future re-run of that pipeline must not
// silently discard manual clinical corrections). Instead, every create/edit
// is written to a separate overlay file via the existing Tauri
// save_json/load_json commands (see storageService.ts — already falls back
// to localStorage when Tauri isn't available, e.g. `vite dev` in a browser).
// drugCatalogService.ts merges this overlay on top of the base catalog at
// read time (override by `id`, or appended if the id doesn't exist yet).
//
// Every write also appends one audit-log row per changed field — never a
// silent overwrite (see AuditEntry below).

import { storageService } from './storageService';
import { dataService } from './dataService';
import type { Medicament } from './drugCatalogService';

export interface OverrideRecord extends Medicament {
    needs_manual_review?: boolean;
    manual_review_note?: string;
}

/** letter → record id → record */
type OverridesFile = Record<string, Record<string, OverrideRecord>>;

export interface AuditEntry {
    record_id: string;
    brand_name: string;
    letter: string;
    action: 'create' | 'update';
    field: string;
    old_value: unknown;
    new_value: unknown;
    changed_at: string;
    changed_by: string;
}

const OVERRIDES_FILE = 'medicament_overrides';
const AUDIT_LOG_FILE = 'medicament_audit_log';

/**
 * storageService.save() (services/storageService.ts) always writes the
 * localStorage fallback before re-throwing whatever error `invoke('save_json', …)`
 * produced — including "Tauri unavailable" when running in a plain browser
 * (e.g. `vite dev` outside the desktop shell). Every dataService.ts method
 * has this same shape and none of them guard against it either; the data is
 * already durably written by the time the throw happens, so treat it as
 * non-fatal here rather than leaving the editor UI stuck as if nothing saved.
 */
async function safeSave(filename: string, data: unknown): Promise<void> {
    try {
        await storageService.save(filename, data);
    } catch (err) {
        console.warn(`[medicamentAdminService] save('${filename}') fell back to local storage:`, err);
    }
}

// Clinical fields whose edit forces a fresh manual review — see spec §5.
const CLINICAL_REVIEW_FIELDS = new Set([
    'contraindications', 'pregnancy', 'children', 'interactions', 'renal_adjustment',
]);

// ─── Overlay cache ────────────────────────────────────────────────────────────

let overridesCache: OverridesFile | null = null;
let overridesLoadPromise: Promise<OverridesFile> | null = null;

export async function loadOverrides(): Promise<OverridesFile> {
    if (overridesCache) return overridesCache;
    if (overridesLoadPromise) return overridesLoadPromise;
    overridesLoadPromise = storageService.load<OverridesFile>(OVERRIDES_FILE, {}).then(data => {
        overridesCache = data;
        overridesLoadPromise = null;
        return data;
    });
    return overridesLoadPromise;
}

/** Synchronous read of whatever overlay is already cached (empty until loadOverrides() resolves once). */
export function getLetterOverridesSync(letter: string): Record<string, OverrideRecord> {
    return overridesCache?.[letter.toUpperCase()] ?? {};
}

// ─── Audit log cache ──────────────────────────────────────────────────────────

let auditCache: AuditEntry[] | null = null;

export async function loadAuditLog(): Promise<AuditEntry[]> {
    if (auditCache) return auditCache;
    auditCache = await storageService.load<AuditEntry[]>(AUDIT_LOG_FILE, []);
    return auditCache;
}

export async function getAuditTrail(recordId: string): Promise<AuditEntry[]> {
    const log = await loadAuditLog();
    return log
        .filter(e => e.record_id === recordId)
        .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
}

async function appendAuditEntries(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const log = await loadAuditLog();
    auditCache = [...log, ...entries];
    await safeSave(AUDIT_LOG_FILE, auditCache);
}

// ─── Diffing ──────────────────────────────────────────────────────────────────

interface FieldChange {
    field: string;
    old_value: unknown;
    new_value: unknown;
}

function diffFields(oldRecord: Partial<Medicament> | undefined, newRecord: Medicament): FieldChange[] {
    const fields = new Set<string>([
        ...(oldRecord ? Object.keys(oldRecord) : []),
        ...Object.keys(newRecord),
    ]);
    fields.delete('needs_manual_review'); // tracked implicitly via the clinical-field changes that trigger it
    fields.delete('manual_review_note');

    const changes: FieldChange[] = [];
    for (const field of fields) {
        const oldVal = (oldRecord as any)?.[field];
        const newVal = (newRecord as any)[field];
        if (JSON.stringify(oldVal ?? null) !== JSON.stringify(newVal ?? null)) {
            changes.push({ field, old_value: oldVal ?? null, new_value: newVal ?? null });
        }
    }
    return changes;
}

function getChangedBy(): string {
    const user = dataService.getActiveUser();
    if (user?.name) return user.name;
    const doctor = dataService.getDoctorInfo();
    return doctor?.nameFr || 'Utilisateur inconnu';
}

// ─── Save ─────────────────────────────────────────────────────────────────────

/**
 * Persists a create or edit to the overlay and appends audit-log rows for
 * every changed field. `baseRecord` is the record being replaced — the
 * previously merged (base catalog + overlay) version — or undefined for a
 * brand-new record. `needs_manual_review` is forced to true on create or
 * when any of CLINICAL_REVIEW_FIELDS changed; otherwise it carries forward
 * from `record.needs_manual_review` (lets `markReviewed` clear it explicitly).
 */
export async function saveMedicament(
    record: Medicament,
    letter: string,
    baseRecord: Medicament | undefined,
): Promise<OverrideRecord> {
    const L = letter.toUpperCase();
    const overrides = await loadOverrides();
    const letterOverrides = { ...(overrides[L] ?? {}) };

    const isCreate = !baseRecord;
    const changes = diffFields(baseRecord, record);
    const touchesClinicalField = changes.some(c => CLINICAL_REVIEW_FIELDS.has(c.field));

    const finalRecord: OverrideRecord = {
        ...record,
        needs_manual_review: isCreate || touchesClinicalField
            ? true
            : (record as OverrideRecord).needs_manual_review,
    };

    letterOverrides[finalRecord.id] = finalRecord;
    const nextOverrides: OverridesFile = { ...overrides, [L]: letterOverrides };
    overridesCache = nextOverrides;
    await safeSave(OVERRIDES_FILE, nextOverrides);

    if (changes.length > 0) {
        const now = new Date().toISOString();
        const changedBy = getChangedBy();
        await appendAuditEntries(changes.map(c => ({
            record_id: finalRecord.id,
            brand_name: finalRecord.brand_name,
            letter: L,
            action: isCreate ? 'create' : 'update',
            field: c.field,
            old_value: c.old_value,
            new_value: c.new_value,
            changed_at: now,
            changed_by: changedBy,
        })));
    }

    return finalRecord;
}

/** Second-reviewer action: clears needs_manual_review without touching any clinical field, still logged. */
export async function markReviewed(record: OverrideRecord, letter: string): Promise<OverrideRecord> {
    return saveMedicament({ ...record, needs_manual_review: false }, letter, record);
}

// ─── Duplicate / consistency checks (spec §4) ─────────────────────────────────

export interface BrandCollision {
    record: Medicament;
    isNewRecord: boolean; // false = same record being edited, never a "collision" with itself
}

/** Existing records sharing the same brand_name within the same letter, excluding the record being edited. */
export function findBrandCollisions(
    brandName: string,
    excludeId: string | undefined,
    lettersRecords: Medicament[],
): Medicament[] {
    const name = brandName.trim().toLowerCase();
    if (!name) return [];
    return lettersRecords.filter(r =>
        r.brand_name?.trim().toLowerCase() === name && r.id !== excludeId
    );
}

/**
 * Lightweight signal for the AMEP-style error class: composition lists an
 * active ingredient that shares no word with generic_name, or vice versa.
 * Non-blocking — surfaced as a warning, never a hard validation error, since
 * legitimate combination products can genuinely diverge in naming.
 */
export function checkCompositionConsistency(
    compositionNames: string[],
    genericName: string,
): boolean {
    const gn = genericName.trim().toLowerCase();
    if (!gn || compositionNames.length === 0) return true;
    const gnWords = gn.split(/[\s+/,]+/).filter(w => w.length > 3);
    return compositionNames.some(name => {
        const n = name.trim().toLowerCase();
        if (!n) return false;
        return gn.includes(n) || n.includes(gn) || gnWords.some(w => n.includes(w));
    });
}
