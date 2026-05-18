const ALLOWED_PATHS = [
    { pattern: /^contacts\/search\/duplicate$/, methods: ['GET'] },
    { pattern: /^contacts\/?$/, methods: ['POST'] },
    { pattern: /^calendars\/events\/appointments\/?$/, methods: ['GET', 'POST'] },
    { pattern: /^calendars\/events\/appointments\/[^/]+$/, methods: ['GET', 'PUT', 'PATCH'] },
    { pattern: /^calendars\/[^/]+\/free-slots$/, methods: ['GET'] },
];

function isAllowed(path, method) {
    const normalizedPath = path.replace(/^\/+/, '');
    const upperMethod = (method || 'GET').toUpperCase();
    return ALLOWED_PATHS.some(
        ({ pattern, methods }) => pattern.test(normalizedPath) && methods.includes(upperMethod)
    );
}

module.exports = { isAllowed };
