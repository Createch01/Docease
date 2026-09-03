import { DoctorInfo, Medicine, Patient, Prescription, DailyReport, MedicineCategory, MealTiming, Task, Appointment, AppointmentPriority, Expense, AppUser, UserRole, MedicalResource, ResourceType, ClinicalConsultation, LabRequest, MedicalResult, HonoraryNote, HonoraryMasterService, MedicalCertificate } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { storageService } from './storageService';
import { cryptoService } from './cryptoService';

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
  EXPENSES: 'meddoc_expenses',
  LAST_BACKUP: 'meddoc_last_backup',
  MEDICAL_RESOURCES: 'meddoc_medical_resources',
  CONSULTATIONS: 'meddoc_consultations',
  LAB_REQUESTS: 'meddoc_lab_requests',
  MEDICAL_RESULTS: 'meddoc_medical_results',
  HONORARY_NOTES: 'meddoc_honorary_notes',
  HONORARY_MASTER_SERVICES: 'meddoc_honorary_master_services',
  MEDICAL_CERTIFICATES: 'meddoc_medical_certificates'
};

const DEFAULT_HONORARY_SERVICES: HonoraryMasterService[] = [
  { id: 'h-1', name: 'Consultation spécialisée', price: 300 },
  { id: 'h-2', name: 'Echographie abdominale', price: 400 },
  { id: 'h-3', name: 'Suivi', price: 150 },
  { id: 'h-4', name: 'Bilan', price: 500 },
  { id: 'h-5', name: 'Urgence', price: 500 },
  { id: 'h-6', name: 'Pansement', price: 100 },
  { id: 'h-7', name: 'Petite chirurgie', price: 500 }
];

// Single source of truth for a brand-new install's doctor/security record. Used
// both by initialize() (populates the in-memory cache on first load) and by
// getDoctorInfo()'s fallback. Previously these were two different, divergent
// objects — initialize()'s version omitted `pin`/`users` entirely, so once it
// populated the cache (which always runs), getDoctorInfo()'s richer fallback
// below became dead code and `doctor.pin` stayed `undefined` forever until a
// PIN was explicitly saved. Any read that landed on the default (e.g. a failed
// load of the encrypted store) therefore made every PIN comparison fail — the
// exact "PIN incorrect" symptom reported after a rebuild.
const DEFAULT_DOCTOR_INFO: DoctorInfo = {
  nameAr: 'الدكتور مولاي رشيد البلغيتي',
  specialtyAr: 'اختصاصي في أمراض القلب والشرايين',
  diplomasAr: 'رئيس سابق بقسم أمراض القلب بمستشفى أكادير وتارودانت\nدبلوم الفحص بالصدى بوردو فرنسا',
  nameFr: 'Docteur My Rachid El BELGHITI',
  specialtyFr: 'Cardiologie Adulte - Pédiatrique, maladies Vasculaire et Hypertension Artérielle',
  diplomasFr: 'Ex. Chef de service de Cardiologie de l\'hôpital d\'Agadir\nDiplôme universitaire d\'échographie (Bordeaux)',
  addressAr: 'شارع محمد الشيخ السعدي عمارة سارور شقة رقم 6 الطابق 1 تالبرجت الجديدة - أكادير',
  addressFr: 'Av. Mohammed Cheikh Saâdi, Imm. Sarour, N° 6, 1er étage Nouveau Talborjt - Agadir',
  phone: '05 28 82 82 29 / Gsm: 06 66 40 72 68',
  email: 'dr.elbelghiticardio@gmail.com',
  logoUrl: '/logo.png',
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
  qrCodePosition: 'top-right',
  showQRCode: true,
  ordreNumber: '',
  hours: '',
  mapsUrl: '',
  users: [],
  activeUser: undefined
};

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

// IN-MEMORY CACHE
let cache: Record<string, any> = {};
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export const dataService = {
  initialize: async () => {
    if (isInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      // Load all data into memory
      const keys = Object.keys(STORAGE_KEYS) as (keyof typeof STORAGE_KEYS)[];
      const loadPromises = keys.map(async (key) => {
        const storageKey = STORAGE_KEYS[key];
        const defaultValue = key === 'PATIENTS' ? [] :
          key === 'PRESCRIPTIONS' ? [] :
            key === 'QUEUE' ? [] :
              key === 'DOCTOR_INFO' ? DEFAULT_DOCTOR_INFO :
                [];
        cache[storageKey] = await storageService.load(storageKey, defaultValue);
      });

      await Promise.all(loadPromises);

      // Automatic Cleanup: Deduplicate local medicines by name
      const medKey = STORAGE_KEYS.MEDICINES;
      if (cache[medKey] && Array.isArray(cache[medKey])) {
        const originalCount = cache[medKey].length;
        const seen = new Set<string>();
        const uniqueMeds: Medicine[] = [];

        cache[medKey].forEach((m: Medicine) => {
          const norm = m.name.trim().toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            uniqueMeds.push(m);
          }
        });

        if (uniqueMeds.length !== originalCount) {
          cache[medKey] = uniqueMeds;
          await storageService.save(medKey, uniqueMeds);
          console.log(`🧹 Cleaned up ${originalCount - uniqueMeds.length} duplicate medications from storage.`);
        }
      }

      isInitialized = true;
      notifyUpdate('all');
      console.log("🚀 DataService initialized successfully");
    })();

    return initPromise;
  },

  getMedicines: (): Medicine[] => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    const localMedicines: Medicine[] = cache[storageKey] || [];

    // Deduplicate by name
    const seen = new Set<string>();
    const result: Medicine[] = [];

    // 1. Add local medicines
    localMedicines.forEach(m => {
      const normalized = m.name?.trim().toLowerCase();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(m);
      }
    });

    return result;
  },

  getTherapeuticGroups: (): string[] => {
    const medicines = dataService.getMedicines();
    const groups = new Set<string>();
    medicines.forEach(m => {
      if (m.category) groups.add(m.category);
    });
    return Array.from(groups).sort((a, b) => a.localeCompare(b, 'fr'));
  },

  getMedicinesByCategory: (category: string): Medicine[] => {
    const medicines = dataService.getMedicines();
    if (category === 'Tous') return medicines;
    return medicines.filter(m => m.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  },

  saveMedicine: async (medicine: Medicine) => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    const localMedicines: Medicine[] = cache[storageKey] || [];

    // Normalize name for comparison
    const targetName = medicine.name.trim().toLowerCase();

    // Check if we are updating an existing entry by ID OR by same name
    const index = localMedicines.findIndex(m =>
      m.id === medicine.id || m.name.trim().toLowerCase() === targetName
    );

    let updatedLocal;
    if (index !== -1) {
      // Preserve the original ID if it was a name match but different ID
      const originalId = localMedicines[index].id;
      updatedLocal = localMedicines.map((m, i) => i === index ? { ...medicine, id: originalId } : m);
    } else {
      updatedLocal = [...localMedicines, medicine];
    }

    cache[storageKey] = updatedLocal;
    await storageService.save(storageKey, updatedLocal);
    notifyUpdate(storageKey);
  },

  deleteMedicine: async (id: string) => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    // Note: We can only delete from LOCAL storage
    const localMedicines = (cache[storageKey] || []).filter((m: Medicine) => m.id !== id);
    cache[storageKey] = localMedicines;
    await storageService.save(storageKey, localMedicines);
    notifyUpdate(storageKey);
  },

  clearAllMedicines: async () => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    cache[storageKey] = [];
    await storageService.save(storageKey, []);
    notifyUpdate(storageKey);
  },

  cleanPersonalRepertoire: async () => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    const localMedicines: Medicine[] = cache[storageKey] || [];
    const originalCount = localMedicines.length;

    // Filter out:
    // 1. Medicines flagged as isAdultOnly (Red background)
    // 2. Medicines with corrupted categories starting with "("
    const cleanedLocal = localMedicines.filter(m => {
      const isRed = m.isAdultOnly === true;
      const isCorruptedCategory = m.category?.trim().startsWith('(');
      return !isRed && !isCorruptedCategory;
    });

    const removedCount = originalCount - cleanedLocal.length;

    if (removedCount > 0) {
      cache[storageKey] = cleanedLocal;
      await storageService.save(storageKey, cleanedLocal);
      notifyUpdate(storageKey);
    }

    return removedCount;
  },

  importMedicines: async (newMedicines: Medicine[]) => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    const localMedicines: Medicine[] = cache[storageKey] || [];

    const updatedLocal = [...localMedicines];
    let addedCount = 0;

    newMedicines.forEach(nm => {
      if (!nm.name) return;

      const normalizedName = nm.name.trim().toLowerCase();

      // Check if already in local
      const alreadyInLocal = updatedLocal.some(m => m.name?.trim().toLowerCase() === normalizedName);

      if (!alreadyInLocal) {
        updatedLocal.push({
          ...nm,
          id: nm.id || `C-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      cache[storageKey] = updatedLocal;
      await storageService.save(storageKey, updatedLocal);
      notifyUpdate(storageKey);
    }
    console.log(`📥 Import: ${addedCount} medicines added (skipped ${newMedicines.length - addedCount} duplicates)`);
  },

  deduplicateMedicines: async () => {
    const storageKey = STORAGE_KEYS.MEDICINES;
    const localMedicines = cache[storageKey] || [];
    const originalCount = localMedicines.length;

    const seen = new Set<string>();
    const uniqueMeds: Medicine[] = [];

    localMedicines.forEach((m: Medicine) => {
      const norm = m.name.trim().toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueMeds.push(m);
      }
    });

    if (uniqueMeds.length !== originalCount) {
      cache[storageKey] = uniqueMeds;
      await storageService.save(storageKey, uniqueMeds);
      notifyUpdate(storageKey);
      return originalCount - uniqueMeds.length;
    }
    return 0;
  },

  getDatabaseStats: () => {
    const patients = dataService.getAllPatients();
    const prescriptions = dataService.getPrescriptions();
    const medicines = dataService.getMedicines();
    const appointments = dataService.getAppointments();
    return {
      patientCount: patients.length,
      prescriptionCount: prescriptions.length,
      medicineCount: medicines.length,
      appointmentCount: appointments.length,
      lastBackup: localStorage.getItem(STORAGE_KEYS.LAST_BACKUP)
    };
  },

  // Exported backups contain full medical/financial records, so the file itself is
  // encrypted (AES-GCM, passphrase-derived) rather than dropped as plaintext JSON —
  // it will typically land in Downloads or on a USB key, outside the app's own
  // encrypted storage. The same passphrase is required to re-import it.
  exportFullBackup: async (passphrase: string) => {
    const backup: Record<string, any> = {};
    Object.keys(STORAGE_KEYS).forEach(key => {
      const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS];
      const data = cache[storageKey];
      if (data) backup[storageKey] = data;
    });

    const envelope = await cryptoService.encryptJSON(backup, passphrase);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([envelope], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DOCEASE_SAUVEGARDE_${timestamp}.json`;
    link.click();

    await storageService.save(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString());
  },

  importFullBackup: async (encryptedText: string, passphrase: string): Promise<boolean> => {
    try {
      const backup = await cryptoService.decryptJSON(encryptedText, passphrase);
      Object.keys(backup).forEach(key => {
        localStorage.setItem(key, JSON.stringify(backup[key]));
      });
      notifyUpdate('all');
      return true;
    } catch (e) {
      console.error('Backup import failed:', e);
      return false;
    }
  },

  getDoctorInfo: (): DoctorInfo => {
    const storageKey = STORAGE_KEYS.DOCTOR_INFO;
    return cache[storageKey] || DEFAULT_DOCTOR_INFO;
  },

  saveDoctorInfo: async (info: DoctorInfo) => {
    const storageKey = STORAGE_KEYS.DOCTOR_INFO;
    cache[storageKey] = info;
    await storageService.save(storageKey, info);
    notifyUpdate(storageKey);
  },

  getAllPatients: (): Patient[] => cache[STORAGE_KEYS.PATIENTS] || [],

  // --- USER MANAGEMENT ---
  getUsers: (): AppUser[] => {
    const info = dataService.getDoctorInfo();
    return info.users || [];
  },

  saveUser: async (user: AppUser) => {
    const info = dataService.getDoctorInfo();
    const users = [...(info.users || [])];
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) users[index] = user;
    else users.push({ ...user, id: user.id || Date.now().toString() });
    await dataService.saveDoctorInfo({ ...info, users });
  },

  deleteUser: async (id: string) => {
    const info = dataService.getDoctorInfo();
    const users = (info.users || []).filter(u => u.id !== id);
    await dataService.saveDoctorInfo({ ...info, users });
  },

  getActiveUser: (): AppUser | undefined => {
    const info = dataService.getDoctorInfo();
    return info.activeUser;
  },

  setActiveUser: async (user: AppUser | undefined) => {
    const info = dataService.getDoctorInfo();
    await dataService.saveDoctorInfo({ ...info, activeUser: user });
  },

  // Clears the identification PIN layer (admin PIN + all collaborator accounts)
  // without touching the master encryption PIN or any patient data. Used as the
  // "forgot PIN" recovery path from the lock screen — safe because it only ever
  // removes an access gate, never data, and re-enabling it requires setting a
  // fresh PIN from Settings again.
  resetIdentificationPins: async () => {
    const info = dataService.getDoctorInfo();
    await dataService.saveDoctorInfo({ ...info, pinEnabled: false, pin: '', users: [], activeUser: undefined });
  },

  // Self-service: change the currently signed-in user's own PIN. Works for the
  // admin (stored on DoctorInfo.pin) as well as any collaborator (stored on their
  // AppUser record). Requires the correct current PIN.
  changeOwnPin: async (currentPin: string, newPin: string): Promise<boolean> => {
    const info = dataService.getDoctorInfo();
    const active = info.activeUser;
    if (!active || active.id === 'admin') {
      if (info.pin && currentPin !== info.pin) return false;
      await dataService.saveDoctorInfo({ ...info, pin: newPin });
      return true;
    }
    const users = info.users || [];
    const target = users.find(u => u.id === active.id);
    if (!target || target.pin !== currentPin) return false;
    await dataService.saveUser({ ...target, pin: newPin });
    if (info.activeUser) await dataService.setActiveUser({ ...info.activeUser, pin: newPin });
    return true;
  },

  // Admin-only: reset another collaborator's PIN without knowing their old one.
  resetUserPin: async (userId: string, newPin: string) => {
    const info = dataService.getDoctorInfo();
    const target = (info.users || []).find(u => u.id === userId);
    if (!target) return;
    await dataService.saveUser({ ...target, pin: newPin });
  },

  searchPatients: (term: string): Patient[] => {
    const patients = dataService.getAllPatients();
    if (!term) return [];
    const lowerTerm = term.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(lowerTerm) || (p.phone && p.phone.includes(term))).slice(0, 5);
  },

  getPatientProfile: (idOrName: string): Patient | null => {
    const patients = dataService.getAllPatients();
    // 1. Try match by ID
    const byId = patients.find(p => p.id === idOrName);
    if (byId) return byId;
    // 2. Fallback to name (backward compatibility)
    return patients.find(p => p.name.toUpperCase() === idOrName.toUpperCase()) || null;
  },

  savePatientProfile: async (patient: Patient) => {
    const storageKey = STORAGE_KEYS.PATIENTS;
    const patients = dataService.getAllPatients();

    const updatedPatient = {
      ...patient,
      id: patient.id || Date.now().toString(),
      registeredDate: patient.registeredDate || new Date().toISOString()
    };

    const index = patients.findIndex(p => p.id === updatedPatient.id);
    let updatedPatients;

    if (index !== -1) {
      updatedPatients = patients.map((p, i) => i === index ? { ...p, ...updatedPatient } : p);
    } else {
      updatedPatients = [...patients, updatedPatient];
    }

    cache[storageKey] = updatedPatients;
    await storageService.save(storageKey, updatedPatients);
    notifyUpdate(storageKey);
    return updatedPatient;
  },

  registerPatient: async (patient: Patient) => {
    // 1. Permanent storage
    const saved = await dataService.savePatientProfile(patient);
    // 2. Add to today's queue
    await dataService.saveToQueue(saved);
  },

  getTodayQueue: (): Patient[] => cache[STORAGE_KEYS.QUEUE] || [],

  saveToQueue: async (patient: Patient) => {
    const storageKey = STORAGE_KEYS.QUEUE;
    const queue = dataService.getTodayQueue();
    if (!queue.some(p => p.id === patient.id)) {
      const updatedQueue = [...queue, patient];
      cache[storageKey] = updatedQueue;
      await storageService.save(storageKey, updatedQueue);
      notifyUpdate(storageKey);
    }
  },

  deleteFromQueue: async (id: string) => {
    const storageKey = STORAGE_KEYS.QUEUE;
    const queue = dataService.getTodayQueue().filter(p => p.id !== id);
    cache[storageKey] = queue;
    await storageService.save(storageKey, queue);
    notifyUpdate(storageKey);
  },

  updatePatientInQueue: async (id: string, patient: Patient) => {
    const storageKey = STORAGE_KEYS.QUEUE;
    const queue = dataService.getTodayQueue();
    const index = queue.findIndex(p => p.id === id);
    if (index !== -1) {
      const updatedItem = { ...patient, id };
      const updatedQueue = queue.map((p, i) => i === index ? updatedItem : p);
      cache[storageKey] = updatedQueue;
      await storageService.save(storageKey, updatedQueue);
      await dataService.savePatientProfile(updatedItem);
      notifyUpdate(storageKey);
    }
  },

  getPrescriptions: (): Prescription[] => {
    const storageKey = STORAGE_KEYS.PRESCRIPTIONS;
    return cache[storageKey] || [];
  },

  savePrescription: async (prescription: Prescription) => {
    const storageKey = STORAGE_KEYS.PRESCRIPTIONS;
    const prescriptions = dataService.getPrescriptions();
    const updatedPrescriptions = [...prescriptions, prescription];

    cache[storageKey] = updatedPrescriptions;
    await storageService.save(storageKey, updatedPrescriptions);

    const patient = dataService.getPatientProfile(prescription.patientId);
    if (patient) await dataService.savePatientProfile({ ...patient, age: prescription.patientAge || patient.age, weight: prescription.patientWeight || patient.weight });

    notifyUpdate(storageKey);
  },

  updatePrescription: async (prescription: Prescription) => {
    const storageKey = STORAGE_KEYS.PRESCRIPTIONS;
    const prescriptions = dataService.getPrescriptions();
    const index = prescriptions.findIndex(p => p.id === prescription.id);
    if (index !== -1) {
      const updatedPrescriptions = prescriptions.map((p, i) => i === index ? prescription : p);
      cache[storageKey] = updatedPrescriptions;
      await storageService.save(storageKey, updatedPrescriptions);
      notifyUpdate(storageKey);
    }
  },

  deletePrescription: async (id: string) => {
    const storageKey = STORAGE_KEYS.PRESCRIPTIONS;
    const prescriptions = dataService.getPrescriptions().filter(p => p.id !== id);
    cache[storageKey] = prescriptions;
    await storageService.save(storageKey, prescriptions);
    notifyUpdate(storageKey);
  },

  getExpenses: (): Expense[] => cache[STORAGE_KEYS.EXPENSES] || [],

  saveExpense: async (expense: Expense) => {
    const storageKey = STORAGE_KEYS.EXPENSES;
    const expenses = dataService.getExpenses();
    const index = expenses.findIndex(e => e.id === expense.id);
    let updatedExpenses;

    if (index !== -1) {
      updatedExpenses = expenses.map((e, i) => i === index ? expense : e);
    } else {
      updatedExpenses = [...expenses, { ...expense, id: expense.id || Date.now().toString() }];
    }
    cache[storageKey] = updatedExpenses;
    await storageService.save(storageKey, updatedExpenses);
    notifyUpdate(storageKey);
  },

  deleteExpense: async (id: string) => {
    const storageKey = STORAGE_KEYS.EXPENSES;
    const expenses = dataService.getExpenses().filter(e => e.id !== id);
    cache[storageKey] = expenses;
    await storageService.save(storageKey, expenses);
    notifyUpdate(storageKey);
  },

  getDailyReports: (): DailyReport[] => cache[STORAGE_KEYS.DAILY_REPORTS] || [],

  getTasks: (): Task[] => cache[STORAGE_KEYS.TASKS] || [],

  saveTask: async (task: Task) => {
    const storageKey = STORAGE_KEYS.TASKS;
    const tasks = dataService.getTasks();
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) tasks[idx] = task; else tasks.push(task);
    cache[storageKey] = tasks;
    await storageService.save(storageKey, tasks);
    notifyUpdate(storageKey);
  },

  deleteTask: async (id: string) => {
    const storageKey = STORAGE_KEYS.TASKS;
    const tasks = dataService.getTasks().filter(t => t.id !== id);
    cache[storageKey] = tasks;
    await storageService.save(storageKey, tasks);
    notifyUpdate(storageKey);
  },

  getAppointments: (): Appointment[] => cache[STORAGE_KEYS.APPOINTMENTS] || [],

  saveAppointment: async (appointment: Appointment) => {
    const storageKey = STORAGE_KEYS.APPOINTMENTS;
    const all = dataService.getAppointments();
    const idx = all.findIndex(a => a.id === appointment.id);
    if (idx !== -1) all[idx] = appointment; else all.push(appointment);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  getMedicalResources: (): MedicalResource[] => cache[STORAGE_KEYS.MEDICAL_RESOURCES] || [],

  saveMedicalResource: async (res: MedicalResource) => {
    const storageKey = STORAGE_KEYS.MEDICAL_RESOURCES;
    const all = dataService.getMedicalResources();
    const idx = all.findIndex(r => r.id === res.id);
    if (idx !== -1) all[idx] = res; else all.push({ ...res, id: res.id || Date.now().toString() });
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  deleteMedicalResource: async (id: string) => {
    const storageKey = STORAGE_KEYS.MEDICAL_RESOURCES;
    const all = dataService.getMedicalResources().filter(r => r.id !== id);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  // --- NEW DOSSIER ENTITIES ---
  getConsultations: (patientId?: string): ClinicalConsultation[] => {
    const storageKey = STORAGE_KEYS.CONSULTATIONS;
    const all: ClinicalConsultation[] = cache[storageKey] || [];
    return patientId ? all.filter(c => c.patientId === patientId) : all;
  },

  saveConsultation: async (consultation: ClinicalConsultation) => {
    const storageKey = STORAGE_KEYS.CONSULTATIONS;
    const all = dataService.getConsultations();
    const index = all.findIndex(c => c.id === consultation.id);
    if (index !== -1) all[index] = consultation;
    else all.push(consultation);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  getLabRequests: (patientId?: string): LabRequest[] => {
    const storageKey = STORAGE_KEYS.LAB_REQUESTS;
    const all: LabRequest[] = cache[storageKey] || [];
    return patientId ? all.filter((r: LabRequest) => r.patientId === patientId) : all;
  },

  saveLabRequest: async (req: LabRequest) => {
    const storageKey = STORAGE_KEYS.LAB_REQUESTS;
    const all = dataService.getLabRequests();
    const index = all.findIndex(l => l.id === req.id);
    if (index !== -1) all[index] = req; else all.push(req);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  getMedicalResults: (patientId?: string): MedicalResult[] => {
    const storageKey = STORAGE_KEYS.MEDICAL_RESULTS;
    const all: MedicalResult[] = cache[storageKey] || [];
    return patientId ? all.filter(r => r.patientId === patientId) : all;
  },

  saveMedicalResult: async (result: MedicalResult) => {
    const storageKey = STORAGE_KEYS.MEDICAL_RESULTS;
    const all = dataService.getMedicalResults();
    const index = all.findIndex(r => r.id === result.id);
    if (index !== -1) all[index] = result; else all.push(result);

    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  // --- HONORARY NOTES ---
  getHonoraryNotes: (patientId?: string): HonoraryNote[] => {
    const storageKey = STORAGE_KEYS.HONORARY_NOTES;
    const all: HonoraryNote[] = cache[storageKey] || [];
    return patientId ? all.filter(n => n.patientId === patientId) : all;
  },

  saveHonoraryNote: async (note: HonoraryNote) => {
    const storageKey = STORAGE_KEYS.HONORARY_NOTES;
    const all = dataService.getHonoraryNotes();
    const index = all.findIndex(n => n.id === note.id);
    if (index !== -1) all[index] = note;
    else all.push(note);

    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  deleteHonoraryNote: async (id: string) => {
    const storageKey = STORAGE_KEYS.HONORARY_NOTES;
    const all = dataService.getHonoraryNotes().filter(n => n.id !== id);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  getHonoraryMasterServices: (): HonoraryMasterService[] => {
    const storageKey = STORAGE_KEYS.HONORARY_MASTER_SERVICES;
    return cache[storageKey] || DEFAULT_HONORARY_SERVICES;
  },

  saveHonoraryMasterService: async (service: HonoraryMasterService) => {
    const storageKey = STORAGE_KEYS.HONORARY_MASTER_SERVICES;
    const all = dataService.getHonoraryMasterServices();
    const index = all.findIndex(s => s.id === service.id);
    if (index !== -1) all[index] = service;
    else all.push(service);

    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  deleteHonoraryMasterService: async (id: string) => {
    const storageKey = STORAGE_KEYS.HONORARY_MASTER_SERVICES;
    const all = dataService.getHonoraryMasterServices().filter(s => s.id !== id);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  // --- MEDICAL CERTIFICATES ---
  getMedicalCertificates: (patientId?: string): MedicalCertificate[] => {
    const storageKey = STORAGE_KEYS.MEDICAL_CERTIFICATES;
    const all: MedicalCertificate[] = cache[storageKey] || [];
    return patientId ? all.filter(c => c.patientId === patientId) : all;
  },

  saveMedicalCertificate: async (cert: MedicalCertificate) => {
    const storageKey = STORAGE_KEYS.MEDICAL_CERTIFICATES;
    const all = dataService.getMedicalCertificates();
    const index = all.findIndex(c => c.id === cert.id);
    if (index !== -1) all[index] = cert;
    else all.push({ ...cert, id: cert.id || Date.now().toString() });

    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  deleteMedicalCertificate: async (id: string) => {
    const storageKey = STORAGE_KEYS.MEDICAL_CERTIFICATES;
    const all = dataService.getMedicalCertificates().filter(c => c.id !== id);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  archiveDay: async () => {
    const storageKey = STORAGE_KEYS.QUEUE;
    cache[storageKey] = [];
    await storageService.save(storageKey, []);
    notifyUpdate(storageKey);
  },

  getAppointmentsByDate: (date: string): Appointment[] => {
    return dataService.getAppointments().filter(a => a.date === date);
  },

  deleteAppointment: async (id: string) => {
    const storageKey = STORAGE_KEYS.APPOINTMENTS;
    const all = dataService.getAppointments().filter(a => a.id !== id);
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  getDailyCapacity: (date: string): number => {
    const data = localStorage.getItem(STORAGE_KEYS.CAPACITIES);
    const capacities = data ? JSON.parse(data) : {};
    return capacities[date] || 15; // Default 15
  },

  setDailyCapacity: async (date: string, limit: number) => {
    const storageKey = STORAGE_KEYS.CAPACITIES;
    const capacities = cache[storageKey] || {};
    capacities[date] = limit;
    cache[storageKey] = capacities;
    await storageService.save(storageKey, capacities);
    notifyUpdate(storageKey);
  },

  classifyAppointmentPriority: async (note: string): Promise<{ priority: AppointmentPriority; reason: string }> => {
    const genAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '', apiVersion: 'v1' });

    const prompt = `
      Analyse ce motif de rendez-vous médical et détermine la priorité :
      Motif: "${note}"
      
      Priorités possibles : 
      - URGENT : Menace vitale, douleur intense, détresse respiratoire, etc.
      - INITIAL : Premier rendez-hui ou nouveau problème.
      - ROUTINE : Suivi, renouvellement, contrôle.
      
      Réponds au format JSON strict :
      { "priority": "URGENT" | "INITIAL" | "ROUTINE", "reason": "Bref raisonnement en français" }
    `;

    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      let text = response.text || "{}";
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Priority Error:", error);
      return { priority: 'ROUTINE', reason: "Analyse automatique indisponible" };
    }
  }
};

(window as any).dataService = dataService;
