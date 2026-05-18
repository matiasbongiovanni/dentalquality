const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar';

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // La anon key de Supabase es pública por diseño (row-level security la protege)
    res.status(200).json({
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
    });
};
