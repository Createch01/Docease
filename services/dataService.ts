
import { DoctorInfo, Medicine, Patient, Prescription, DailyReport, MedicineCategory, MealTiming, Task, Appointment, AppointmentPriority } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const STORAGE_KEYS = {
  DOCTOR_INFO: 'meddoc_doctor_info',
  PATIENTS: 'meddoc_patients',
  PRESCRIPTIONS: 'meddoc_prescriptions',
  DAILY_REPORTS: 'meddoc_daily_reports',
  MEDICINES: 'meddoc_medicines',
  QUEUE: 'meddoc_today_queue',
  TASKS: 'meddoc_tasks',
  APPOINTMENTS: 'meddoc_appointments',
  CAPACITIES: 'meddoc_capacities',
  LAST_BACKUP: 'meddoc_last_backup'
};

const DEFAULT_MEDICINES: Medicine[] = [
  // --- SÉRIE DOLIPRANE & ANTALGIQUES ---
  { id: 'm-doli-1', name: 'DOLIPRANE 500 mg cp', category: 'Antalgique', defaultDosage: '1 à 2 cp x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-doli-2', name: 'DOLIPRANE 1000 mg cp', category: 'Antalgique', defaultDosage: '1 cp x 3/j', defaultTiming: 'Après repas' },
  { id: 'm-doli-3', name: 'DOLIPRANE SP', category: 'Sirop', defaultDosage: '1 dose poids x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-dolig', name: 'DOLIGRIPPE sachet', category: 'Autre', defaultDosage: '1 SA x 3/j (eau chaude)', defaultTiming: 'Indifférent' },
  { id: 'm-dolir-cp', name: 'DOLIRHUME cp', category: 'Autre', defaultDosage: '1 cp x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-dolir-sp', name: 'DOLIRHUME SP', category: 'Sirop', defaultDosage: '1 càc x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-dolis-500', name: 'DOLISTOP 500 mg cp', category: 'Antalgique', defaultDosage: '1 cp x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-dolis-1000', name: 'DOLISTOP 1000 mg cp', category: 'Antalgique', defaultDosage: '1 cp x 2/j', defaultTiming: 'Indifférent' },

  // --- SÉRIE ACARBOSE / ACARD / ACCUPRIL ---
  { id: 'm-acarb-100', name: 'ACARBOSE 100 mg cp', category: 'Autre', defaultDosage: '1 cp x 3/j', defaultTiming: 'Pendant repas' },
  { id: 'm-acard-50', name: 'ACARD 50 mg cp', category: 'Antalgique', defaultDosage: '1 cp/j', defaultTiming: 'Après repas' },
  { id: 'm-accu-5', name: 'ACCUPRIL 5 mg cp', category: 'Autre', defaultDosage: '1 cp le matin', defaultTiming: 'Avant repas' },
  { id: 'm-accu-20', name: 'ACCUPRIL 20 mg cp', category: 'Autre', defaultDosage: '1 cp le matin', defaultTiming: 'Avant repas' },

  // --- SÉRIE ACLAV & ANTIBIOTIQUES ---
  { id: 'm-aclav-500', name: 'ACLAV 500/62.5 mg SA', category: 'Antibiotique', defaultDosage: '1 SA x 2/j', defaultTiming: 'Pendant repas', interactionGroup: 'amoxicilline' },
  { id: 'm-aclav-1g', name: 'ACLAV 1 g/125 mg SA', category: 'Antibiotique', defaultDosage: '1 SA x 2/j', defaultTiming: 'Pendant repas', interactionGroup: 'amoxicilline' },
  { id: 'm-aclav-inj', name: 'ACLAV 1 g inj', category: 'Antibiotique', defaultDosage: '1 inj chaque 12h', defaultTiming: 'Indifférent' },
  { id: 'm-amox-1g', name: 'AMOXIL 1 g cp', category: 'Antibiotique', defaultDosage: '1 cp x 2/j', defaultTiming: 'Pendant repas', interactionGroup: 'amoxicilline' },

  // --- SÉRIE DIGESTION ---
  { id: 'm-acdig', name: 'ACDIGEST gel', category: 'Sirop', defaultDosage: '1 càc après repas x 3/j', defaultTiming: 'Après repas' },
  { id: 'm-actid', name: 'ACTIDIGEST cp', category: 'Autre', defaultDosage: '1 cp après repas x 3/j', defaultTiming: 'Après repas' },
  { id: 'm-domp-cp', name: 'DOMPERIDONE 10 mg cp', category: 'Autre', defaultDosage: '1 cp x 3/j', defaultTiming: 'Avant repas' },
  { id: 'm-domp-sp', name: 'DOMPERIDONE SP', category: 'Sirop', defaultDosage: '1 dose poids x 3/j', defaultTiming: 'Avant repas' },
  { id: 'm-duphalac', name: 'DUPHALAC SP', category: 'Sirop', defaultDosage: '1 càs x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-duspat-135', name: 'DUSPATALIN 135 mg cp', category: 'Autre', defaultDosage: '1 cp matin et soir', defaultTiming: 'Avant repas' },

  // --- SÉRIE CORTICOÏDES & THYROÏDE ---
  { id: 'm-euth-25', name: 'EUTHYROX 25 µg cp', category: 'Autre', defaultDosage: '1 cp/j le matin à jeun', defaultTiming: 'Avant repas' },
  { id: 'm-euth-50', name: 'EUTHYROX 50 µg cp', category: 'Autre', defaultDosage: '1 cp/j le matin à jeun', defaultTiming: 'Avant repas' },
  { id: 'm-euth-75', name: 'EUTHYROX 75 µg cp', category: 'Autre', defaultDosage: '1 cp/j le matin à jeun', defaultTiming: 'Avant repas' },
  { id: 'm-euth-100', name: 'EUTHYROX 100 µg cp', category: 'Autre', defaultDosage: '1 cp/j le matin à jeun', defaultTiming: 'Avant repas' },

  // --- SÉRIE VITAMINES ---
  { id: 'm-acfol', name: 'ACFOL 5 mg cp', category: 'Vitamine', defaultDosage: '1 cp/j', defaultTiming: 'Indifférent' },
  { id: 'm-addmag', name: 'ADDITIVA MAGNESIUM cp', category: 'Vitamine', defaultDosage: '1 cp/j', defaultTiming: 'Après repas' },
  { id: 'm-actimag', name: 'ACTIMAG cp', category: 'Vitamine', defaultDosage: '1 cp/j', defaultTiming: 'Après repas' },

  // --- SÉRIE DERMATO ---
  { id: 'm-acno-10', name: 'ACNO 10 mg cp', category: 'Autre', defaultDosage: '1 cp/j le soir', defaultTiming: 'Indifférent' },
  { id: 'm-acno-20', name: 'ACNO 20 mg cp', category: 'Autre', defaultDosage: '1 cp/j le soir', defaultTiming: 'Indifférent' },
  { id: 'm-acnelyse', name: 'ACNELYSE crème', category: 'Autre', defaultDosage: '1 app locale le soir', defaultTiming: 'Indifférent' },

  // --- SÉRIE ALLERGIE ---
  { id: 'm-aerius-cp', name: 'AERIUS 5 mg cp', category: 'Autre', defaultDosage: '1 cp/j', defaultTiming: 'Indifférent' },
  { id: 'm-aerius-sp', name: 'AERIUS sirop', category: 'Sirop', defaultDosage: '1 dose poids x 1/j', defaultTiming: 'Indifférent' },

  // --- SÉRIE RESPIRATOIRE ---
  { id: 'm-exomuc-200', name: 'EXOMUC 200 mg SA', category: 'Autre', defaultDosage: '1 SA x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-fluim-200', name: 'FLUIMUCIL 200 mg SA', category: 'Autre', defaultDosage: '1 SA x 3/j', defaultTiming: 'Indifférent' },
  { id: 'm-aeroline', name: 'AEROLINE spray', category: 'Autre', defaultDosage: '1 à 2 bouffées si crise', defaultTiming: 'Indifférent' },

  // --- SÉRIE GYNÉCO ---
  { id: 'm-duf-10', name: 'DUFASTON 10 mg cp', category: 'Autre', defaultDosage: 'Selon schéma gynécologique', defaultTiming: 'Indifférent' },
  { id: 'm-adepal', name: 'ADEPAL cp', category: 'Autre', defaultDosage: '1 cp/j pendant 21 jours', defaultTiming: 'Indifférent' }
];

const notifyUpdate = (key: string) => {
  window.dispatchEvent(new CustomEvent('meddoc_data_update', { detail: { key } }));
};

export const CATEGORY_POSOLOGY: Record<MedicineCategory, { dosage: string; timing: MealTiming }> = {
  'Antibiotique': { dosage: '1 cp x 2/j', timing: 'Pendant repas' },
  'Vitamine': { dosage: '1 cp/j', timing: 'Avant repas' },
  'Antalgique': { dosage: '1 cp si douleur', timing: 'Après repas' },
  'Anti-inflammatoire': { dosage: '1 cp x 3/j', timing: 'Pendant repas' },
  'Sirop': { dosage: '1 càs x 3/j', timing: 'Indifférent' },
  'Autre': { dosage: '', timing: 'Indifférent' }
};

export const dataService = {
  getMedicines: (): Medicine[] => {
    const data = localStorage.getItem(STORAGE_KEYS.MEDICINES);
    return data ? JSON.parse(data) : DEFAULT_MEDICINES;
  },

  saveMedicine: (medicine: Medicine) => {
    const medicines = dataService.getMedicines();
    const index = medicines.findIndex(m => m.id === medicine.id);
    if (index !== -1) {
      medicines[index] = medicine;
    } else {
      medicines.push(medicine);
    }
    localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(medicines));
    notifyUpdate(STORAGE_KEYS.MEDICINES);
  },

  deleteMedicine: (id: string) => {
    const medicines = dataService.getMedicines().filter(m => m.id !== id);
    localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(medicines));
    notifyUpdate(STORAGE_KEYS.MEDICINES);
  },

  importMedicines: (newMedicines: Medicine[]) => {
    const existing = dataService.getMedicines();
    const merged = [...existing];
    newMedicines.forEach(nm => {
      if (!merged.some(m => m.name.toLowerCase() === nm.name.toLowerCase())) {
        merged.push({
          ...nm,
          id: nm.id || Date.now().toString() + Math.random().toString(36).substr(2, 5)
        });
      }
    });
    localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(merged));
    notifyUpdate(STORAGE_KEYS.MEDICINES);
  },

  checkInteractions: (currentMedNames: string[], newInteractionGroup?: string): string | undefined => {
    if (!newInteractionGroup) return undefined;
    const allMeds = dataService.getMedicines();
    for (const name of currentMedNames) {
      const med = allMeds.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (med && med.interactionGroup && med.interactionGroup.toLowerCase() === newInteractionGroup.toLowerCase()) {
        return med.name;
      }
    }
    return undefined;
  },

  getDatabaseStats: () => {
    const patients = JSON.parse(localStorage.getItem(STORAGE_KEYS.PATIENTS) || '[]');
    const prescriptions = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS) || '[]');
    const medicines = dataService.getMedicines();
    const appointments = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPOINTMENTS) || '[]');

    return {
      patientCount: patients.length,
      prescriptionCount: prescriptions.length,
      medicineCount: medicines.length,
      appointmentCount: appointments.length,
      lastBackup: localStorage.getItem(STORAGE_KEYS.LAST_BACKUP)
    };
  },

  exportFullBackup: () => {
    const backup: Record<string, any> = {};
    Object.keys(STORAGE_KEYS).forEach(key => {
      const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS];
      const data = localStorage.getItem(storageKey);
      if (data) backup[storageKey] = JSON.parse(data);
    });

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `SAUVEGARDE_CABINET_${date}.json`;
    link.click();
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString());
  },

  importFullBackup: (jsonData: string) => {
    try {
      const backup = JSON.parse(jsonData);
      Object.keys(backup).forEach(key => {
        localStorage.setItem(key, JSON.stringify(backup[key]));
      });
      notifyUpdate('all');
      return true;
    } catch (e) {
      return false;
    }
  },

  getDoctorInfo: (): DoctorInfo => {
    const data = localStorage.getItem(STORAGE_KEYS.DOCTOR_INFO);
    const defaultLogo = "/logo.png";

    return data ? JSON.parse(data) : {
      nameAr: '***SUPPRIME***',
      specialtyAr: '***SUPPRIME***',
      diplomasAr: '***SUPPRIME***',
      nameFr: '***SUPPRIME***',
      specialtyFr: '***SUPPRIME***',
      diplomasFr: '***SUPPRIME***',
      addressAr: '***SUPPRIME***',
      addressFr: '***SUPPRIME***',
      phone: '***SUPPRIME***',
      email: '***SUPPRIME***',
      logoUrl: defaultLogo,
      logoOpacity: 0.1,
      logoScale: 120,
      logoPosition: 'center',
      footerColor: '#10b981',
      currency: 'DH',
      showBarcode: true,
      barcodeContent: 'DocEase-SECURE-ID',
      barcodePosition: 'bottom-left',
      barcodeSize: 80,
      pinEnabled: false,
      pin: '',
      qrCodeContent: 'https://docease.pro',
      qrCodePosition: 'top-right'
      ,
      showQRCode: true
    };
  },

  saveDoctorInfo: (info: DoctorInfo) => {
    localStorage.setItem(STORAGE_KEYS.DOCTOR_INFO, JSON.stringify(info));
    notifyUpdate(STORAGE_KEYS.DOCTOR_INFO);
  },

  getAllPatients: (): Patient[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PATIENTS);
    return data ? JSON.parse(data) : [];
  },

  searchPatients: (term: string): Patient[] => {
    const patients = dataService.getAllPatients();
    if (!term) return [];
    const lowerTerm = term.toLowerCase();
    return patients.filter(p =>
      p.name.toLowerCase().includes(lowerTerm) ||
      (p.phone && p.phone.includes(term))
    ).slice(0, 5);
  },

  getPatientProfile: (name: string): Patient | null => {
    const patients = dataService.getAllPatients();
    return patients.find(p => p.name.toUpperCase() === name.toUpperCase()) || null;
  },

  savePatientProfile: (patient: Patient) => {
    const patients = dataService.getAllPatients();
    const nameUpper = patient.name.toUpperCase();
    const index = patients.findIndex(p => p.name.toUpperCase() === nameUpper);
    if (index !== -1) {
      patients[index] = { ...patients[index], ...patient };
    } else {
      patients.push({ ...patient, id: patient.id || Date.now().toString() });
    }
    localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients));
    notifyUpdate(STORAGE_KEYS.PATIENTS);
  },

  getTodayQueue: (): Patient[] => {
    const data = localStorage.getItem(STORAGE_KEYS.QUEUE);
    const queue: Patient[] = data ? JSON.parse(data) : [];
    const today = new Date().toISOString().split('T')[0];
    return queue.filter(p => p.registeredDate === today);
  },

  registerPatient: (patient: Patient) => {
    const queue = dataService.getTodayQueue();
    const fullPatient = {
      ...patient,
      id: patient.id || Date.now().toString(),
      registeredDate: new Date().toISOString().split('T')[0]
    };
    queue.push(fullPatient);
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    dataService.savePatientProfile(fullPatient);
    notifyUpdate(STORAGE_KEYS.QUEUE);
  },

  deleteFromQueue: (id: string) => {
    const queue = dataService.getTodayQueue().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    notifyUpdate(STORAGE_KEYS.QUEUE);
  },

  updatePatientInQueue: (id: string, patient: Patient) => {
    const data = localStorage.getItem(STORAGE_KEYS.QUEUE);
    let queue: Patient[] = data ? JSON.parse(data) : [];
    const index = queue.findIndex(p => p.id === id);
    if (index !== -1) {
      queue[index] = { ...patient, id };
      localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
      dataService.savePatientProfile(queue[index]);
      notifyUpdate(STORAGE_KEYS.QUEUE);
    }
  },

  getPrescriptions: (): Prescription[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS);
    return data ? JSON.parse(data) : [];
  },

  savePrescription: (prescription: Prescription) => {
    const prescriptions = dataService.getPrescriptions();
    prescriptions.push(prescription);
    localStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(prescriptions));

    const patient = dataService.getPatientProfile(prescription.patientId);
    if (patient) {
      dataService.savePatientProfile({
        ...patient,
        age: prescription.patientAge || patient.age,
        weight: prescription.patientWeight || patient.weight
      });
    }
    notifyUpdate(STORAGE_KEYS.PRESCRIPTIONS);
  },

  archiveDay: () => {
    const prescriptions = dataService.getPrescriptions();
    const today = new Date().toISOString().split('T')[0];
    const todaysPrescriptions = prescriptions.filter(p => p.date === today);
    if (todaysPrescriptions.length === 0) return;
    const totalRevenue = todaysPrescriptions.reduce((sum, p) => sum + p.amount, 0);
    const reports = dataService.getDailyReports();
    reports.push({ date: today, totalRevenue, prescriptionsCount: todaysPrescriptions.length });
    localStorage.setItem(STORAGE_KEYS.DAILY_REPORTS, JSON.stringify(reports));
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify([]));
    dataService.exportFullBackup();
    notifyUpdate('archive');
  },

  getDailyReports: (): DailyReport[] => {
    const data = localStorage.getItem(STORAGE_KEYS.DAILY_REPORTS);
    return data ? JSON.parse(data) : [];
  },

  getTasks: (): Task[] => {
    const data = localStorage.getItem(STORAGE_KEYS.TASKS);
    return data ? JSON.parse(data) : [];
  },

  saveTask: (task: Task) => {
    const tasks = dataService.getTasks();
    const existingIndex = tasks.findIndex(t => t.id === task.id);
    if (existingIndex !== -1) {
      tasks[existingIndex] = task;
    } else {
      tasks.push(task);
    }
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    notifyUpdate(STORAGE_KEYS.TASKS);
  },

  deleteTask: (id: string) => {
    const tasks = dataService.getTasks().filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    notifyUpdate(STORAGE_KEYS.TASKS);
  },

  getAppointments: (): Appointment[] => {
    const data = localStorage.getItem(STORAGE_KEYS.APPOINTMENTS);
    return data ? JSON.parse(data) : [];
  },

  getAppointmentsByDate: (date: string): Appointment[] => {
    return dataService.getAppointments().filter(app => app.date === date);
  },

  saveAppointment: (appointment: Appointment) => {
    const appointments = dataService.getAppointments();
    const index = appointments.findIndex(a => a.id === appointment.id);
    if (index !== -1) {
      appointments[index] = appointment;
    } else {
      appointments.push(appointment);
    }
    localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));
    notifyUpdate(STORAGE_KEYS.APPOINTMENTS);
  },

  deleteAppointment: (id: string) => {
    const appointments = dataService.getAppointments().filter(app => app.id !== id);
    localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));
    notifyUpdate(STORAGE_KEYS.APPOINTMENTS);
  },

  getDailyCapacity: (date: string): number => {
    const data = localStorage.getItem(STORAGE_KEYS.CAPACITIES);
    const capacities = data ? JSON.parse(data) : {};
    return capacities[date] || 15;
  },

  setDailyCapacity: (date: string, limit: number) => {
    const data = localStorage.getItem(STORAGE_KEYS.CAPACITIES);
    const capacities = data ? JSON.parse(data) : {};
    capacities[date] = limit;
    localStorage.setItem(STORAGE_KEYS.CAPACITIES, JSON.stringify(capacities));
    notifyUpdate(STORAGE_KEYS.CAPACITIES);
  },

  classifyAppointmentPriority: async (note: string): Promise<{ priority: AppointmentPriority, reason: string }> => {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyses cette raison de visite médicale et détermines l'ordre de priorité (URGENT, INITIAL, ou ROUTINE). 
        - URGENT: Douleurs thoraciques, détresse respiratoire, forte fièvre, blessures graves.
        - INITIAL: Première consultation, nouveaux symptômes non critiques.
        - ROUTINE: Renouvellement, suivi régulier, contrôle de routine.
        Raison: "${note}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              priority: { type: Type.STRING, enum: ['URGENT', 'INITIAL', 'ROUTINE'] },
              reason: { type: Type.STRING }
            },
            required: ['priority', 'reason']
          }
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      return { priority: 'ROUTINE', reason: "Classification automatique indisponible" };
    }
  }
};
