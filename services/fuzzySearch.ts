// ─── Typo-tolerant matching ──────────────────────────────────────────────────
//
// No fuzzy-matching library exists anywhere in this repo (confirmed by
// repo-wide search); this is a small, dependency-free bounded edit-distance
// matcher, sized for the drug catalogue (~2,000 consolidated brands).
// Used only as a FALLBACK when a plain substring search returns nothing —
// e.g. reading a name off a handwritten/scanned prescription.

function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, ''); // strip accents (combining diacritics after NFD)
}

/** Classic Levenshtein distance, computed with a single rolling row (O(n) memory). */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prevRow = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prevRow[j] = j;

    for (let i = 1; i <= a.length; i++) {
        const currRow = new Array(b.length + 1);
        currRow[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
                prevRow[j] + 1,       // deletion
                currRow[j - 1] + 1,   // insertion
                prevRow[j - 1] + cost, // substitution
            );
        }
        prevRow = currRow;
    }
    return prevRow[b.length];
}

/** Max edit distance tolerated for a query of the given length — proportionally looser for longer names. */
function maxDistanceFor(queryLen: number): number {
    if (queryLen <= 3) return 1;
    if (queryLen <= 6) return 2;
    return 3;
}

/**
 * Ranks `items` by typo-tolerant similarity of `query` against the strings
 * returned by `getFields(item)` (e.g. brand_name and generic_name). Returns
 * up to `limit` items whose best-matching field is within the edit-distance
 * threshold, closest matches first. Returns [] rather than guessing when
 * nothing is close enough — an empty result is safer than a wrong drug.
 */
export function fuzzyRank<T>(
    query: string,
    items: T[],
    getFields: (item: T) => string[],
    limit = 8,
): T[] {
    const q = normalize(query.trim());
    if (!q) return [];
    const threshold = maxDistanceFor(q.length);

    const scored: Array<{ item: T; dist: number }> = [];
    for (const item of items) {
        let best = Infinity;
        for (const field of getFields(item)) {
            if (!field) continue;
            const f = normalize(field);
            // Compare against whole field and against each word (handles
            // "DOLIPRAN" matching "Doliprane 1000" without needing an exact
            // full-string match).
            const candidates = [f, ...f.split(/\s+/)];
            for (const c of candidates) {
                if (Math.abs(c.length - q.length) > threshold) continue; // cheap prune
                const d = levenshtein(q, c);
                if (d < best) best = d;
            }
        }
        if (best <= threshold) scored.push({ item, dist: best });
    }

    scored.sort((a, b) => a.dist - b.dist);
    return scored.slice(0, limit).map(s => s.item);
}
