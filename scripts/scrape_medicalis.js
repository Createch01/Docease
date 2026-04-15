const fs = require('fs');
const path = require('path');

async function scrapePage(letter, page) {
    const url = `https://medicalis.ma/recherchemedicament/${letter}?page=${page}`;
    console.log(`Scraping ${url}...`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            console.error(`Failed to fetch ${url}: ${response.statusText}`);
            return null;
        }

        const html = await response.text();

        // Regex to find medication links and their subtext
        // Link: <a id="link" href="/...">NAME</a>
        // Subtext: <p>Commercialisé - Boite de ... - ... dhs</p> (based on screenshot, it's a paragraph or div below the link)
        // Let's use a broad regex to capture the groups.

        const meds = [];
        const medicRegex = /<a id="link" href="([^"]+)">([^<]+)<\/a>\s*<p>([^<]+)<\/p>/g;
        let match;

        while ((match = medicRegex.exec(html)) !== null) {
            const href = match[1];
            const fullName = match[2].trim();
            const subtext = match[3].trim();

            // Parse fullName: "ACARBOSE LAPROPHAN 50 MG, Comprimé"
            const nameParts = fullName.split(',');
            const brandWithStrength = nameParts[0].trim();
            const form = nameParts[1] ? nameParts[1].trim() : '';

            // Extract strength from brandWithStrength (e.g. "50 MG")
            const strengthMatch = brandWithStrength.match(/(\d+\s*(?:MG|µG|G|ML|UI|%|µg|ml|g|mg).*)$/i);
            const strength = strengthMatch ? strengthMatch[1] : '';
            const brandName = strength ? brandWithStrength.replace(strength, '').trim() : brandWithStrength;

            // Parse subtext: "Commercialisé - Boite de 90 - 64.40 dhs"
            const subParts = subtext.split('-').map(s => s.trim());
            const status = subParts[0] || '';
            const packaging = subParts[1] || '';
            const priceStr = subParts[2] || '';
            const price = parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;

            meds.push({
                brand_name: brandName,
                strength: strength,
                form: form,
                status: status,
                packaging: packaging,
                price_mad: price,
                url: href
            });
        }

        // Check for total pages if on page 1
        let totalPages = 1;
        const paginationRegex = /page=(\d+)">>>/g;
        const pageMatch = paginationRegex.exec(html);
        if (pageMatch) {
            totalPages = parseInt(pageMatch[1]);
        } else {
            // Fallback: look for the highest page number in the list
            const allPagesRegex = /page=(\d+)/g;
            let m;
            while ((m = allPagesRegex.exec(html)) !== null) {
                const p = parseInt(m[1]);
                if (p > totalPages) totalPages = p;
            }
        }

        return { meds, totalPages };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return null;
    }
}

async function main() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const allMeds = [];

    for (const letter of letters) {
        console.log(`--- Letter ${letter} ---`);
        let currentPage = 1;
        let totalPages = 1;

        do {
            const result = await scrapePage(letter, currentPage);
            if (result) {
                allMeds.push(...result.meds);
                totalPages = result.totalPages;
                console.log(`Added ${result.meds.length} meds from page ${currentPage}/${totalPages}. Total so far: ${allMeds.length}`);
            }
            currentPage++;
            // Small delay to be nice
            await new Promise(r => setTimeout(r, 500));
        } while (currentPage <= totalPages);

        // Save intermediate results after each letter to avoid data loss
        fs.writeFileSync('medicaments_raw.json', JSON.stringify(allMeds, null, 2));
    }

    console.log(`Scraping complete. Total medications found: ${allMeds.length}`);
}

main();
