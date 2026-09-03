// Encrypts/decrypts the full-backup export using the browser's native Web Crypto
// API (AES-GCM + PBKDF2) — no external dependency, since this only needs to protect
// a single exported file, not the whole on-disk store (that's handled in Rust —
// see src-tauri/src/lib.rs).

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
};

const fromB64 = (b64: string): Uint8Array => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

interface EncryptedEnvelope {
    v: 1;
    salt: string;
    iv: string;
    ciphertext: string;
}

export const cryptoService = {
    encryptJSON: async (data: any, passphrase: string): Promise<string> => {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(passphrase, salt);
        const plaintext = new TextEncoder().encode(JSON.stringify(data));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
        const envelope: EncryptedEnvelope = { v: 1, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ciphertext) };
        return JSON.stringify(envelope);
    },

    decryptJSON: async (envelopeText: string, passphrase: string): Promise<any> => {
        const envelope: EncryptedEnvelope = JSON.parse(envelopeText);
        if (envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
            throw new Error('Fichier de sauvegarde invalide ou non chiffré.');
        }
        const key = await deriveKey(passphrase, fromB64(envelope.salt));
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.ciphertext));
        return JSON.parse(new TextDecoder().decode(plaintext));
    },
};
