
/**
 * Utility to convert numbers to French words for honorary notes.
 */
export const numberToFrenchWords = (n: number): string => {
    const ones = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
    const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingts', 'quatre-vingt-dix'];

    if (n === 0) return 'zéro';
    if (n < 0) return 'moins ' + numberToFrenchWords(Math.abs(n));

    let words = '';

    if (Math.floor(n / 1000000) > 0) {
        words += numberToFrenchWords(Math.floor(n / 1000000)) + ' million' + (Math.floor(n / 1000000) > 1 ? 's ' : ' ');
        n %= 1000000;
    }

    if (Math.floor(n / 1000) > 0) {
        if (Math.floor(n / 1000) === 1) {
            words += 'mille ';
        } else {
            words += numberToFrenchWords(Math.floor(n / 1000)) + ' mille ';
        }
        n %= 1000;
    }

    if (Math.floor(n / 100) > 0) {
        if (Math.floor(n / 100) === 1) {
            words += 'cent ';
        } else {
            words += ones[Math.floor(n / 100)] + ' cent' + (n % 100 === 0 ? 's ' : ' ');
        }
        n %= 100;
    }

    if (n > 0) {
        if (n < 10) {
            words += ones[n];
        } else if (n < 20) {
            words += teens[n - 10];
        } else if (n < 70) {
            words += tens[Math.floor(n / 10)];
            if (n % 10 > 0) {
                words += (n % 10 === 1 ? ' et ' : '-') + ones[n % 10];
            }
        } else if (n < 80) {
            words += 'soixante-';
            if (n % 10 === 1) {
                words += 'et-onze';
            } else {
                words += teens[n - 60 - 10];
            }
        } else if (n < 90) {
            words += 'quatre-vingt' + (n % 10 === 0 ? 's ' : '-');
            if (n % 10 > 0) {
                words += ones[n % 10];
            }
        } else {
            words += 'quatre-vingt-dix-';
            if (n % 10 === 1) {
                words += 'et-onze';
            } else {
                words += teens[n - 80 - 10];
            }
        }
    }

    return words.trim();
};

export const formatCurrencyToWords = (amount: number, currency: string = 'Dirhams'): string => {
    const mainPart = Math.floor(amount);
    const decimalPart = Math.round((amount - mainPart) * 100);

    let result = numberToFrenchWords(mainPart);
    result = result.charAt(0).toUpperCase() + result.slice(1) + ' ' + currency;

    if (decimalPart > 0) {
        result += ' et ' + numberToFrenchWords(decimalPart) + ' Centimes';
    }

    return result;
};
