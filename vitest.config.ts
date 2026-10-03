import { defineConfig } from 'vitest/config';

// Config dédiée aux tests : environnement node, indépendante de vite.config.ts (PWA, etc.).
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
});
