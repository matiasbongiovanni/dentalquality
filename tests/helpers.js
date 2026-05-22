const PROFESIONALES_MOCK = [
    { profesional: 'Dra. López', sede: 'Lanus', calendar_id: 'cal_lanus_001', especialidades: '- odontolog' },
    { profesional: 'Dr. García', sede: 'Lomas', calendar_id: 'cal_lomas_001', especialidades: '- estet' },
];

function buildSlotsMock() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const d1 = tomorrow.toISOString().slice(0, 10);
    const d2 = new Date(tomorrow.getTime() + 86400000).toISOString().slice(0, 10);
    return {
        slots: {
            [d1]: { slots: [{ time: `${d1}T10:00:00-03:00` }, { time: `${d1}T11:00:00-03:00` }] },
            [d2]: { slots: [{ time: `${d2}T14:00:00-03:00` }] }
        }
    };
}

const TEST_PATIENT = {
    dni: '46591162',
    nombre: 'Matias',
    apellido: 'Bongiovanni',
    telefono: '3516000000',
    obraSocial: '',
};

module.exports = { PROFESIONALES_MOCK, buildSlotsMock, TEST_PATIENT };
