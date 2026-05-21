// Sliding window rate limiter — in-memory, per IP
// Works with Vercel Fluid Compute (instance reuse). No external deps.
const store = new Map(); // ip -> [timestamp, ...]

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    const timestamps = (store.get(ip) || []).filter(t => t > windowStart);

    if (timestamps.length >= MAX_REQUESTS) {
        store.set(ip, timestamps);
        return true;
    }

    timestamps.push(now);
    store.set(ip, timestamps);

    // Cleanup IPs older than 10 minutes to avoid memory leak
    if (store.size > 5000) {
        for (const [key, ts] of store) {
            if (ts[ts.length - 1] < now - 10 * WINDOW_MS) store.delete(key);
        }
    }

    return false;
}

module.exports = { isRateLimited, getClientIp };
