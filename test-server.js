const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT || '3001', 10);

const SECURITY_HEADERS = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://devsupabase-dentalquality.surovianiasystems.site",
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

const API_HANDLERS = {
    '/api/config': require('./api/config'),
    '/api/ghl': require('./api/ghl'),
    '/api/webhook-agendamiento': require('./api/webhook-agendamiento'),
    '/api/sync-registro': require('./api/sync-registro'),
};

function parseBody(req) {
    return new Promise(resolve => {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch { resolve(raw || {}); }
        });
    });
}

function patchRes(res) {
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.status = code => { res.statusCode = code; return res; };
    const _end = res.end.bind(res);
    res.json = data => {
        res.setHeader('Content-Type', 'application/json');
        _end(JSON.stringify(data));
    };
    return res;
}

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname.replace(/\/$/, '') || '/';

    const handler = API_HANDLERS[pathname];
    if (handler) {
        req.query = parsed.query;
        req.body = await parseBody(req);
        patchRes(res);
        return handler(req, res);
    }

    patchRes(res);
    const filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.statusCode = 200;
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}`);
});
