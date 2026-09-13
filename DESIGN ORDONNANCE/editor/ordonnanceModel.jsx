/* Ordonnance — appearance-driven prescription template + defaults.
   Every visual choice lives in `appearance`; doctor/patient/date/items stay
   pure data. This is the single source of truth the editor mutates and the
   printed document renders, in mm units so print output is exact.

   Exports (window): rxOrdDefaultAppearance, rxOrdDefaultDoctor,
                      rxOrdDefaultPatient, rxOrdDefaultItems, RX_ORD_FONTS
*/
(() => {

const RX_ORD_FONTS = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  arabic: "Cairo, 'Noto Naskh Arabic', Tajawal, sans-serif",
};

function rxOrdDefaultAppearance() {
  return {
    paperSize: 'A4',
    fontFamily: 'serif',

    header: {
      bg: '#FFFFFF', bgOpacity: 1,
      name: { fontSize: 24, color: '#0B2A5B', align: 'left' },
      speciality: { show: true, fontSize: 10.5 },
      logo: { show: true, url: '', position: 'left', size: 64 },
      arabic: {
        show: true, nameFontSize: 15, specialityFontSize: 9,
      },
    },

    badge: {
      text: 'ORDONNANCE', bg: '#12496B', color: '#FFFFFF',
      fontSize: 14, radius: 999, paddingX: 26, paddingY: 11,
    },

    patientLine: { style: 'dotted' },

    drugList: { style: 'bar', accentColor: '#12496B' },

    footer: {
      bg: '#E53E3E', textColor: '#FFFFFF',
      show: { phone: true, email: true, address: true, fax: false },
      showIcons: true,
      arabic: { show: true },
    },

    qr: { show: false, size: 50, value: '' },

    watermark: { show: false, opacity: 0.05, size: 180 },

    signature: { show: true, url: '', label: 'Cachet & Signature', size: 90, position: 'right' },
  };
}

function rxOrdDefaultDoctor() {
  return {
    name: 'CHOUKRI EL MAHDI',
    speciality: 'Cardiologie Adulte - Pédiatrique, maladies Vasculaire et Hypertension Artérielle',
    diplomasFr: "Chef de service de Cardiologie de l'Hôpital d'Agadir\nDiplôme universitaire d'échographie (Bordeaux)",
    nameAr: 'مولاي رشيد البلغيتي',
    specialityAr: 'اختصاصي في أمراض القلب والشرايين',
    diplomasAr: 'رئيس سابق بقسم أمراض القلب بمستشفى أكادير وقنوات\nدبلوم الفحص بالصدى (بوردو فرنسا)',
    addressFr: 'Av. Mohammed Cheikh Saâdi, Imm. Sarour, N° 6, 1er étage Nouveau Talborjt - Agadir',
    addressAr: 'شارع محمد الشيخ السعدي عمارة سارور شقة رقم 6 الطابق 1 تالبرجت الجديدة - أكادير',
    phone: '05 28 82 82 29',
    gsm: '06 66 40 72 68',
    fax: '',
    email: 'dr.elbeghiticardio@gmail.com',
    registrationNumber: '',
    inpe: '—', ice: '—', taxId: '—',
    logoUrl: '',
  };
}

function rxOrdDefaultPatient() { return { name: '', age: '', sex: '' }; }

function rxOrdDefaultItems() {
  return [
    { drugName: 'Amlodipine', strength: '5 mg', dosage: '1 comprimé le matin', duration: '30 jours' },
    { drugName: 'Metformine', strength: '850 mg', dosage: '1 comprimé matin et soir', duration: '30 jours' },
  ];
}

Object.assign(window, { rxOrdDefaultAppearance, rxOrdDefaultDoctor, rxOrdDefaultPatient, rxOrdDefaultItems, RX_ORD_FONTS });

})();
