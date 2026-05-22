const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    use: {
        baseURL: 'http://localhost:3001',
        headless: true,
    },
    webServer: {
        command: 'node test-server.js',
        port: 3001,
        reuseExistingServer: true,
        env: {
            PORT: '3001',
            GHL_API_KEY: 'test-key-placeholder',
            SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site/rest/v1',
            SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
            ALLOWED_ORIGIN: 'http://localhost:3001',
        },
    },
    projects: [
        { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
        { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    ],
});
