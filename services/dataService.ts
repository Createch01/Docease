import { sessionService } from './sessionService';
import { VaccinationRecord, DoctorInfo, Medicine, Patient, Prescription, DailyReport, MedicineCategory, MealTiming, Task, Appointment, AppointmentPriority, AppointmentSettings, Expense, AppUser, UserRole, MedicalResource, ResourceType, ClinicalConsultation, LabRequest, MedicalResult, HonoraryNote, HonoraryMasterService, MedicalCertificate } from '../types';
import { storageService } from './storageService';
import { aiService } from './aiService';
import { normalizeAppointmentSettings } from './appointmentDefaults';
import { resetSentOnReschedule } from './messaging/reminders';
import { migrateLegacyVaccinations } from './vaccinationMigration';
import { hasLegacyAttachments, migrateResultAttachments, sha256Hex } from './attachmentMigration';
import { attachmentService } from './attachmentService';
import { todayLocal } from '../utils/localDate';

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
  APPOINTMENT_SETTINGS: 'meddoc_appointment_settings',
  EXPENSES: 'meddoc_expenses',
  MEDICAL_RESOURCES: 'meddoc_medical_resources',
  CONSULTATIONS: 'meddoc_consultations',
  LAB_REQUESTS: 'meddoc_lab_requests',
  MEDICAL_RESULTS: 'meddoc_medical_results',
  HONORARY_NOTES: 'meddoc_honorary_notes',
  HONORARY_MASTER_SERVICES: 'meddoc_honorary_master_services',
  MEDICAL_CERTIFICATES: 'meddoc_medical_certificates',
  // Carnets de vaccination (médecin seulement : absent de la liste blanche de l'assistante côté Rust).
  VACCINATIONS: 'meddoc_vaccinations'
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
  nameAr: '',
  specialtyAr: '',
  diplomasAr: '',
  nameFr: '',
  specialtyFr: '',
  diplomasFr: '',
  addressAr: '',
  addressFr: '',
  phone: '',
  email: '',
  // Vide par défaut : aucun document n'affiche le logo DocEase.
  logoUrl: undefined,
  logoOpacity: 0.1,
  logoScale: 120,
  logoPosition: 'center',
  footerColor: '#10b981',
  currency: 'DH',
  showBarcode: true,
  barcodeContent: 'DocEase-SECURE-ID',
  barcodePosition: 'bottom-left',
  barcodeSize: 80,
  qrCodeContent: 'https://docease.pro',
  qrCodePosition: 'top-right',
  showQRCode: true,
  ordreNumber: '',
  inpe: '',
  hours: '',
  mapsUrl: ''
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
  // Verrouillage / changement d'utilisateur : plus aucune donnée du compte précédent
  // ne doit rester en mémoire côté interface.
  reset: () => {
    cache = {};
    isInitialized = false;
    initPromise = null;
  },

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
                key === 'APPOINTMENT_SETTINGS' ? null :
                  [];
        const loaded = await storageService.load(storageKey, defaultValue);
        // L'assistante ne reçoit qu'un sous-ensemble de la fiche cabinet : on le complète
        // avec les valeurs par défaut pour que l'affichage ne rencontre pas de champ absent.
        cache[storageKey] = key === 'DOCTOR_INFO' && sessionService.isAssistant()
          ? { ...DEFAULT_DOCTOR_INFO, ...(loaded as object) }
          : loaded;
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

      // Anciens carnets (localStorage, en clair, hors sauvegarde) → stockage chiffré. Médecin seulement :
      // l'assistante n'a ni accès au fichier ni raison de toucher aux anciennes clés.
      if (sessionService.isMedecin()) {
        try {
          const report = await migrateLegacyVaccinations({
            legacy: localStorage,
            current: cache[STORAGE_KEYS.VACCINATIONS] || [],
            save: records => storageService.save(STORAGE_KEYS.VACCINATIONS, records),
            load: () => storageService.load<VaccinationRecord[] | null>(STORAGE_KEYS.VACCINATIONS, null),
          });
          cache[STORAGE_KEYS.VACCINATIONS] = report.records;
          if (report.migrated || report.kept.length) console.log(`💉 Carnets de vaccination : ${report.migrated} repris, ${report.removedKeys} ancienne(s) clé(s) supprimée(s), ${report.kept.length} conservée(s).`);
        } catch (error) {
          console.error('Migration des carnets de vaccination : anciennes clés conservées.', error);
        }
      }

      // Anciennes pièces des résultats (data: base64 dans le JSON) → stockage chiffré de Rust. Médecin seulement,
      // application Tauri seulement ; non destructif (relecture de contrôle avant remplacement), relançable.
      if (sessionService.isMedecin() && typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' && hasLegacyAttachments(cache[STORAGE_KEYS.MEDICAL_RESULTS] || [])) {
        try {
          const report = await migrateResultAttachments({
            results: [...(cache[STORAGE_KEYS.MEDICAL_RESULTS] || [])],
            today: todayLocal(),
            list: attachmentService.list,
            add: attachmentService.add,
            read: attachmentService.read,
            sha256: sha256Hex,
            saveResult: r => dataService.saveMedicalResult(r),
          });
          if (report.migrated || report.reused || report.skipped.length) console.log(`📎 Pièces des résultats : ${report.migrated} migrée(s), ${report.reused} déjà présente(s), ${report.skipped.length} laissée(s) en l'état.`);
        } catch (error) {
          console.error('Migration des pièces des résultats : anciennes pièces conservées.', error);
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
    };
  },

  // Sauvegarde et restauration : voir services/backupService.ts et src-tauri/src/backup.rs.

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

  /** Consentement WhatsApp d'un patient. `whatsappConsentAt` est provisoire ici : Rust pose la date et l'auteur à l'enregistrement. */
  setWhatsAppConsent: async (patientId: string, value: 'yes' | 'no' | undefined): Promise<Patient | null> => {
    const p = dataService.getPatientProfile(patientId);
    if (!p || p.whatsappConsent === value) return p;
    return dataService.savePatientProfile({ ...p, whatsappConsent: value, whatsappConsentAt: value ? new Date().toISOString() : undefined });
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

  getVaccinationRecords: (): VaccinationRecord[] => cache[STORAGE_KEYS.VACCINATIONS] || [],

  /** Remplace la liste complète des carnets (mémoire immédiate, puis écriture chiffrée). */
  saveVaccinationRecords: async (records: VaccinationRecord[]) => {
    const storageKey = STORAGE_KEYS.VACCINATIONS;
    cache[storageKey] = records;
    notifyUpdate(storageKey);
    await storageService.save(storageKey, records);
  },

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
    const current = dataService.getAppointments();
    const now = new Date().toISOString();
    const idx = current.findIndex(a => a.id === appointment.id);
    // Reprogrammation : l'état local suit la règle de Rust (qui fait foi à l'enregistrement).
    if (idx !== -1) appointment = resetSentOnReschedule(current[idx], appointment);
    const all = idx !== -1
      ? current.map((a, i) => i === idx ? { ...appointment, createdAt: a.createdAt || appointment.createdAt, updatedAt: now } : a)
      : [...current, { ...appointment, createdAt: appointment.createdAt || now, updatedAt: now }];
    cache[storageKey] = all;
    await storageService.save(storageKey, all);
    notifyUpdate(storageKey);
  },

  /** Remplace un RDV du cache par la version renvoyée par Rust (traçabilité d'envoi), sans réécrire le fichier. */
  applyServerAppointment: (updated: Appointment) => {
    const storageKey = STORAGE_KEYS.APPOINTMENTS;
    cache[storageKey] = dataService.getAppointments().map(a => a.id === updated.id ? { ...a, ...updated } : a);
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

  // Réglages du module Rendez-vous (horaires, mode, capacité, types, fermetures).
  // L'ancien meddoc_capacities est repris comme surcharges par date, sans être supprimé.
  getAppointmentSettings: (): AppointmentSettings => {
    const raw = cache[STORAGE_KEYS.APPOINTMENT_SETTINGS];
    const legacy = cache[STORAGE_KEYS.CAPACITIES];
    // Toujours complété (fichier partiel ou ancien) ; résultat mémorisé pour garder une référence stable.
    if (!cache.__apptSettingsMemo || cache.__apptSettingsMemo.raw !== raw || cache.__apptSettingsMemo.legacy !== legacy) {
      cache.__apptSettingsMemo = { raw, legacy, out: normalizeAppointmentSettings(raw, legacy) };
    }
    return cache.__apptSettingsMemo.out as AppointmentSettings;
  },

  saveAppointmentSettings: async (settings: AppointmentSettings) => {
    const storageKey = STORAGE_KEYS.APPOINTMENT_SETTINGS;
    cache[storageKey] = settings;
    await storageService.save(storageKey, settings);
    notifyUpdate(storageKey);
  },

  getDailyCapacity: (date: string): number => {
    const s = dataService.getAppointmentSettings();
    return s.dayOverrides[date]?.maxPerDay ?? s.maxPerDay;
  },

  setDailyCapacity: async (date: string, limit: number) => {
    const s = dataService.getAppointmentSettings();
    await dataService.saveAppointmentSettings({
      ...s, dayOverrides: { ...s.dayOverrides, [date]: { maxPerDay: Math.max(1, limit) } },
    });
  },

  // Fin de consultation : le RDV du jour du patient passe à « Terminé ».
  markAppointmentDone: async (patientId: string) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const app = dataService.getAppointments().find(a =>
      a.patientId === patientId && a.date === today && (a.status === 'IN_CONSULTATION' || a.status === 'ARRIVED'));
    if (app) await dataService.saveAppointment({ ...app, status: 'DONE' });
  },

  findPatientsByPhone: (phone: string): Patient[] => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return [];
    return dataService.getAllPatients().filter(p => (p.phone || '').replace(/\D/g, '') === digits);
  },

  // Suggestion IA facultative : sans IA activée ou en cas d'échec, priorité ROUTINE.
  classifyAppointmentPriority: async (note: string): Promise<{ priority: AppointmentPriority; reason: string }> => {
    try {
      const r = await aiService.classifyPriority(note);
      if (['URGENT', 'INITIAL', 'ROUTINE'].includes(r.priority)) {
        return { priority: r.priority as AppointmentPriority, reason: r.reason || '' };
      }
    } catch { /* IA désactivée ou indisponible */ }
    return { priority: 'ROUTINE', reason: "Analyse automatique indisponible" };
  }
};

(window as any).dataService = dataService;
