/**
 * Scrape medicament.ma A-Z listing
 * Extracts all medications with: brand name, strength, form, packaging, price, laboratory
 * Handles pagination (site has ~20 items/page, up to 29 pages per letter)
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://medicament.ma/listing-des-medicaments/';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DELAY_MS = 800; // Polite delay between requests

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Parse medication entries from HTML text
 * Format: [BRAND STRENGTH, Form\n  Packaging - PPV: price dhs - LAB](url)
 */
function parseMedicationsFromHtml(html) {
    const meds = [];

    // Match list items with medication links
    // Pattern: <a href="url">BRAND STRENGTH, Form\n  Packaging - PPV: price - LAB</a>
    const linkRegex = /<a[^>]*href="(https:\/\/medicament\.ma\/medicament\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
        const url = match[1];
        const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

        if (!text || text.length < 3) continue;

        // Parse the text: "BRAND STRENGTH, Form Packaging - PPV: price dhs - LAB"
        const med = parseEntryText(text, url);
        if (med && med.brand_name) {
            meds.push(med);
        }
    }

    return meds;
}

function parseEntryText(text, url) {
    try {
        // Split on first comma to get brand+strength vs rest
        const commaIdx = text.indexOf(',');
        if (commaIdx === -1) return null;

        const brandPart = text.substring(0, commaIdx).trim();
        const restPart = text.substring(commaIdx + 1).trim();

        // Extract brand name and strength from brandPart
        // Pattern: "DOLIPRANE 500 MG" or "ACLAV 1 G / 125 MG"
        const strengthMatch = brandPart.match(/^(.+?)\s+(\d[\d\s.,\/µ%]*(?:mg|g|ml|µg|ui|%|mg\/ml|g\/ml|µg\/h)[^,]*)/i);
        let brand_name, strength;
        if (strengthMatch) {
            brand_name = strengthMatch[1].trim();
            strength = strengthMatch[2].trim();
        } else {
            brand_name = brandPart.trim();
            strength = null;
        }

        // Extract form, packaging, price, lab from restPart
        const parts = restPart.split(' - ').map(s => s.trim());

        let form = parts[0] || null;
        // Clean form: remove packaging info if it starts with form
        const formPackSplit = form ? form.split(/\s+(?=Boi|Fla|Blis|Tube|Sac|Pla|Pack|Ampo|Car)/i) : [''];
        form = formPackSplit[0].trim();

        let packaging = null;
        let price_ppv = null;
        let price_ph = null;
        let lab = null;

        for (const part of parts) {
            if (/^Boi|^Fla|^Blis|^Tube|^Sac|^Pla|^\d+ (?:comp|gél|sach|amp|fla)/i.test(part)) {
                packaging = part;
            }
            const ppvMatch = part.match(/PPV:\s*([\d.,]+)\s*dhs/i);
            if (ppvMatch) price_ppv = parseFloat(ppvMatch[1].replace(',', '.'));

            const phMatch = part.match(/PH:\s*([\d.,]+)\s*dhs/i);
            if (phMatch) price_ph = parseFloat(phMatch[1].replace(',', '.'));

            // Lab is usually the last part
            if (!ppvMatch && !phMatch && !/^Boi|^Fla|^Blis|^PPV|^PH|^PPC/i.test(part) && part.length > 2) {
                lab = part;
            }
        }

        // Build raw_label
        const raw_label = strength ? `${brand_name} ${strength} ${form || ''}`.trim() : `${brand_name} ${form || ''}`.trim();

        return {
            brand_name: brand_name.toUpperCase(),
            strength,
            form: form || null,
            raw_label,
            packaging,
            price_ppv,
            price_ph,
            laboratory: lab,
            url
        };
    } catch (e) {
        return null;
    }
}

/**
 * Detect total pages from the HTML pagination
 */
function detectTotalPages(html) {
    // Look for pagination links like page/29/
    const pageLinks = html.match(/page\/(\d+)\//g);
    if (!pageLinks) return 1;

    let maxPage = 1;
    pageLinks.forEach(link => {
        const num = parseInt(link.match(/page\/(\d+)\//)[1]);
        if (num > maxPage) maxPage = num;
    });
    return maxPage;
}

async function fetchPage(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (e) {
        console.error(`  ❌ Error fetching ${url}: ${e.message}`);
        return null;
    }
}

async function scrapeLetter(letter) {
    const meds = [];

    // First page
    const firstUrl = `${BASE_URL}?lettre=${letter}`;
    console.log(`\n📋 Scraping letter ${letter}...`);

    const firstHtml = await fetchPage(firstUrl);
    if (!firstHtml) return meds;

    // Count results
    const countMatch = firstHtml.match(/(\d+)\s*résultats?/i);
    const totalCount = countMatch ? parseInt(countMatch[1]) : '?';
    console.log(`   ${totalCount} medications found`);

    // Get first page meds
    const firstPageMeds = parseMedicationsFromHtml(firstHtml);
    meds.push(...firstPageMeds);

    // Detect total pages
    const totalPages = detectTotalPages(firstHtml);
    console.log(`   ${totalPages} pages to scrape`);

    // Scrape remaining pages
    for (let page = 2; page <= totalPages; page++) {
        await sleep(DELAY_MS);
        const pageUrl = `${BASE_URL}page/${page}/?lettre=${letter}`;
        const html = await fetchPage(pageUrl);
        if (html) {
            const pageMeds = parseMedicationsFromHtml(html);
            meds.push(...pageMeds);
            process.stdout.write(`   Page ${page}/${totalPages} (${pageMeds.length} meds) `);
        }
    }

    console.log(`\n   ✅ Letter ${letter}: ${meds.length} medications scraped`);
    return meds;
}

async function main() {
    console.log('🏥 Starting Medicament.ma A-Z Scraper');
    console.log('====================================\n');

    const allMeds = [];

    for (const letter of LETTERS) {
        const letterMeds = await scrapeLetter(letter);
        allMeds.push(...letterMeds);
        await sleep(1000); // Extra delay between letters
    }

    // Deduplicate by url (same medication URL = same entry)
    const seen = new Set();
    const uniqueMeds = allMeds.filter(m => {
        if (seen.has(m.url)) return false;
        seen.add(m.url);
        return true;
    });

    console.log(`\n====================================`);
    console.log(`📊 Total scraped: ${allMeds.length}`);
    console.log(`📊 Unique medications: ${uniqueMeds.length}`);

    // Save output
    const outputPath = path.join(__dirname, '..', 'medicaments', 'medicaments_raw_az.json');
    const output = {
        scraped_at: new Date().toISOString(),
        source: 'https://medicament.ma',
        total_count: uniqueMeds.length,
        items: uniqueMeds
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n💾 Saved to: ${outputPath}`);
}

main().catch(console.error);
