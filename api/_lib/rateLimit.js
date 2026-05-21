// Sliding window rate limiter — in-memory, per IP+key namespace
// Works with Vercel Fluid Compute (instance reuse). No external deps.

// store: namespace -> Map<ip, timestamp[]>
const stores = new Map();

const WINDOW_MS = 60_000; // 1 minute

function getStore(namespace) {
    if (!stores.has(namespace)) stores.set(namespace, new Map());
    return stores.get(namespace);
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {string} ip
 * @param {number} [maxRequests=10] - max requests per window
 * @param {string} [namespace='default'] - separate counters per endpoint
 */
function isRateLimited(ip, maxRequests = 10, namespace = 'default') {
    const store = getStore(namespace);
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    const timestamps = (store.get(ip) || []).filter(t => t > windowStart);

    if (timestamps.length >= maxRequests) {
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
