import { Video } from '@google/genai';


export type MedicineCategory = string;
export type MealTiming = 'Avant repas' | 'Pendant repas' | 'Après repas' | 'Indifférent';
export type PatientType = 'Adult' | 'Child' | 'Woman';
export type UserRole = 'Admin' | 'Medecin' | 'Assistant' | 'User';
export type Permission =
  | 'ACCESS_DASHBOARD'
  | 'MANAGE_PATIENTS' // Salle d'attente + informations administratives (rôle Assistant/Accueil)
  | 'MANAGE_MEDICAL_RECORDS' // Dossier médical : pathologies, allergies, historique (rôle Médecin)
  | 'CREATE_PRESCRIPTION'
  | 'MANAGE_APPOINTMENTS'
  | 'VIEW_FINANCES'
  | 'MANAGE_SETTINGS'
  | 'USE_AI_ASSISTANT';

// Permissions par défaut proposées selon le rôle choisi à la création d'un collaborateur
// (§9 du cahier des charges : séparation Assistant/Accueil vs Médecin).
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  Admin: ['ACCESS_DASHBOARD', 'MANAGE_PATIENTS', 'MANAGE_MEDICAL_RECORDS', 'CREATE_PRESCRIPTION', 'MANAGE_APPOINTMENTS', 'VIEW_FINANCES', 'MANAGE_SETTINGS', 'USE_AI_ASSISTANT'],
  Medecin: ['ACCESS_DASHBOARD', 'MANAGE_PATIENTS', 'MANAGE_MEDICAL_RECORDS', 'CREATE_PRESCRIPTION', 'MANAGE_APPOINTMENTS', 'VIEW_FINANCES', 'USE_AI_ASSISTANT'],
  Assistant: ['ACCESS_DASHBOARD', 'MANAGE_PATIENTS', 'MANAGE_APPOINTMENTS'],
  User: [],
};

export type LabRequestStatus = 'DRAFT' | 'REQUESTED' | 'RECEIVED' | 'INTERPRETED' | 'CLOSED';
export type MedicalResultType = 'biologie' | 'imagerie' | 'autre';

export interface AppUser {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  permissions: Permission[];
  createdAt: string;
}

export interface MedicineRestriction {
  status: 'interdit' | 'attention' | 'autorise';
  minAge?: number;
  maxAge?: number;
  reason?: string;
}

export interface MedicineInteraction {
  with: string;
  risk: string;
  severity: 'absolute' | 'relative';
}

export interface MedicineContraindication {
  type: string;
  severity: 'absolute' | 'relative';
  message: string;
  minWeeks?: number;
  maxWeeks?: number;
}

export interface MedicinePresentation {
  id: string;
  packaging?: string | null;
  laboratory?: string | null;
  route?: string;
  pricePpvDhs?: number | null;
}

export interface Medicine {
  id: string;
  name: string;
  category: MedicineCategory;
  form?: string;
  strength?: string;
  active_ingredient?: string; // New: for exact matching
  route?: string;
  packaging?: string | null; // Selected/default présentation-conditionnement (e.g. "Boîte de 8")
  presentations?: MedicinePresentation[]; // All distinct présentations available for this médicament (same DCI/dosage/forme)
  defaultDosage: string;
  defaultTiming: MealTiming;
  isAdultOnly?: boolean;
  isPregnantForbidden?: boolean;
  isBreastfeedingForbidden?: boolean;
  isHeartForbidden?: boolean;
  isKidneyForbidden?: boolean;
  isLiverForbidden?: boolean;
  interactionGroup?: string;
  atcCode?: string;
  nature?: string;
  clinicalFlags?: string[];
  restriction?: MedicineRestriction;
  incompatibleWith?: string[]; // Liste des noms de médicaments ou groupes incompatibles
  contraindications?: MedicineContraindication[]; // New
  contraindicationNotes?: string[]; // Raw free-text contraindications from the catalog, used for allergy keyword matching and display
  majorInteractions?: MedicineInteraction[]; // New
  pregnancyLactation?: any; // New
  isHospitalOnly?: boolean; // smart_flags includes RESERVE_HOPITAL / USAGE_HOSPITALIER(_UNIQUEMENT)
  pediatricDoseRule?: string; // children.dose_rule, e.g. "25-50 mg/kg/j en 2-3 prises"
}

export interface DoctorInfo {
  name?: string;
  nameAr: string;
  specialtyAr: string;
  diplomasAr: string;
  nameFr: string;
  specialtyFr: string;
  diplomasFr: string;
  addressAr: string;
  addressFr: string;
  phone: string;
  email: string;
  logoUrl?: string;
  logoOpacity: number;
  logoScale: number;
  logoPosition: 'left' | 'center' | 'right';
  footerColor: string;
  currency: string;
  showBarcode: boolean;
  barcodeContent: string;
  barcodeImageUrl?: string;
  barcodePosition: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center-right';
  barcodeSize: number;
  showQRCode?: boolean;
  // Security
  pinEnabled: boolean;
  pin?: string;
  // QR Code
  qrCodeContent: string;
  qrCodePosition: 'top-right' | 'bottom-right' | 'none';

  // Professional IDs
  patente?: string;
  rc?: string;
  inpe?: string;
  ice?: string;
  taxId?: string;
  ordreNumber?: string;

  // Cabinet
  hours?: string;
  mapsUrl?: string;
  standardConsultationFee?: number;

  // Multi-user
  users?: AppUser[];
  activeUser?: AppUser;

}

export type CertificateType = 'REPOS' | 'APTITUDE' | 'PROLONGATION' | 'CUSTOM';

export interface MedicalCertificate {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  type: CertificateType;
  content: string;
  duration?: number; // Days of rest if applicable
  startDate?: string;
  doctorName?: string;
}

export interface ClinicalConsultation {
  id: string;
  date: string;
  time: string;
  motif: string;
  symptoms: string;
  clinicalExam: string;
  diagnostic: string;
  treatmentPlan: string;
  notes: string;
  doctorName?: string;
  patientId: string;
}

export interface LabRequest {
  id: string;
  date: string;
  title: string;
  tests: string[];
  status: LabRequestStatus;
  notes?: string;
  patientId: string;
}

export interface MedicalResultAttachment {
  name: string;
  type: string;
  url: string; // data: URL (base64) of the file
}

export interface MedicalResult {
  id: string;
  date: string;
  receivedDate: string;
  title: string;
  interpretation: string;
  doctorNotes?: string;
  resultType: MedicalResultType;
  prescriberName?: string;
  analysisId?: string; // Link to LabRequest
  attachments: MedicalResultAttachment[];
  patientId: string;
}

export interface HonoraryService {
  name: string;
  price?: number;
  checked: boolean;
}

export interface HonoraryMasterService {
  id: string;
  name: string;
  price: number;
}

export interface HonoraryNote {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientCin?: string;
  visitId?: string;
  prescriptionId?: string; // Link to the Prescription that generated this invoice
  date: string;
  invoiceNumber: string;
  services: HonoraryService[];
  totalAmount: number;
  totalInWords: string;
  status: 'PAID' | 'UNPAID' | 'PARTIAL';
  amountPaid?: number; // Only meaningful when status === 'PARTIAL'
  paymentMode: 'CASH' | 'CARD' | 'TRANSFER';
  includeCin?: string;
  includePhone?: string;
}

export type FontSizeOption = 'small' | 'medium' | 'large';

// --- CUSTOM TEMPLATE EDITOR TYPES ---
// Config for the doctor's own from-scratch prescription design, built in
// CustomTemplateEditor.tsx and rendered by components/templates/CustomTemplate.tsx.
// Fully isolated from the 9 built-in Claude Design templates.
export type RxElementType = 'text' | 'contact' | 'logo' | 'line' | 'icon' | 'body';

export interface RxEditorElement {
  id: string;
  type: RxElementType;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  rotation?: number;

  // text / contact
  bind?: string;
  text?: string;
  width?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
  uppercase?: boolean;
  rtl?: boolean;

  // contact / icon
  field?: string;
  iconStyle?: 'outline' | 'filled';
  iconSize?: number;
  iconColor?: string;
  iconGap?: number;
  showIcon?: boolean;

  // logo
  src?: string;
  w?: number;

  // line
  length?: number;
  thickness?: number;

  // body
  h?: number;
}

export interface RxLayoutConfig {
  version: number;
  page: {
    size: string;
    width: number;
    height: number;
    background: string;
  };
  elements: RxEditorElement[];
}

export interface CustomTemplateConfig {
  headerStyle: 'minimal' | 'bande' | 'encadre';
  headerColor: string;
  logoUrl?: string | null;
  logoPosition: 'left' | 'center' | 'right';
  logoSize: number;
  showName: boolean;
  namePosition: 'left' | 'center' | 'right';
  nameFontSize: number;
  showSpeciality: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
  showOrdreNumber: boolean;
  showWebsite: boolean;
  website?: string;
  drugListStyle: 'barre' | 'simple' | 'puces';
  accentColor: string;
  fontFamily: 'serif' | 'sans' | 'mono';
  footerStyle: 'simple' | 'bande' | 'vague';
  showStamp: boolean;
  stampUrl?: string | null;
  stampPosition: 'left' | 'right';
  showSignature: boolean;
  signatureUrl?: string | null;
  enableQrCode: boolean;
  qrCodePosition: 'left' | 'right';
  qrCodeContent: string;
  watermark: 'none' | 'initials' | 'cross';
  watermarkOpacity: number;

  // Element-based layout configuration from the custom prescription editor
  layoutConfig?: RxLayoutConfig;
}

export interface PrescriptionAppearance {
  primaryColor: string;
  fontSize: FontSizeOption;
  logoUrl?: string;
  logoScale: number;
  fontFamily: 'serif' | 'sans' | 'mono';
  headerLayout: 'classic' | 'modern' | 'minimal';
  watermarkOpacity: number;
  showBorder: boolean;
  footerColor: string;
  footerVerticalOffset?: number; // Simplified adjustment
  contentVerticalPadding?: number;
  enableQrCode?: boolean;
  qrCodeSize?: number;
  logoPosition?: 'left' | 'center' | 'right';
  secondaryColor?: string;
  customQrUrl?: string;
  qrCodeType?: 'AUTOMATIC' | 'VCARD' | 'URL' | 'WHATSAPP';
  qrCodeStyle?: 'square' | 'dots' | 'rounded';
  qrCodeColor?: string;
  layoutPreset?: 'classic' | 'modern' | 'elegant';
  showSignature?: boolean;
  signatureLabel?: string;
  paperSize?: 'A4' | 'A5';
  paperMode?: 'blank' | 'letterhead';
  signatureImageUrl?: string;
  stampImageUrl?: string;
  selectedTemplate?: 'letterhead_simple' | 'pediatric' | 'navy_wave' | 'purple_heart' | 'script_elegant' | 'cardio_ecg' | 'gyneco_pink' | 'teal_hospital' | 'corporate_clean' | 'custom';
  // Doctor's own from-scratch design, saved when selectedTemplate === 'custom'.
  customTemplateConfig?: CustomTemplateConfig;
  // QR code position on the printed page (content/type are covered by qrCodeType/customQrUrl above).
  qrCodePosition?: 'bottom-left' | 'bottom-right';
  // Coordonnées affichées — which doctor-profile fields to surface on the document.
  // Undefined means "shown" (default), consistent with existing templates rendering them unconditionally.
  showPhone?: boolean;
  showEmail?: boolean;
  showAddress?: boolean;
  showOrdreNumber?: boolean;
  showWebsite?: boolean;
  website?: string;
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  genericName?: string;
  category?: string;
  form?: string;
  strength?: string;
  route?: string;
  packaging?: string | null; // Présentation/conditionnement retenu pour cette prescription
  dosage: string;
  referenceDosage?: string;
  timing: MealTiming;
  duration?: string;
  frequency?: string;
  warning?: string;
  interactionGroup?: string;
  overriddenByDoctor?: boolean;
  overrideReason?: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  dateOfBirth?: string;
  cin?: string;
  sex: 'M' | 'F';
  type: PatientType;
  phone?: string;
  address?: string;
  weight?: string;
  allergies?: string;
  pathologies?: string;
  pathologyTags?: string[];
  pathologiesOtherTags?: string[];
  allergyTags?: string[];
  allergiesOtherTags?: string[];
  chronicDiseases?: string[];
  consultationFee?: number;
  registeredDate?: string;
  isPregnant?: boolean;
  pregnancyWeeks?: number;
  isBreastfeeding?: boolean;
  lactationMonths?: number;
  isHeartPatient?: boolean;
  isKidneyPatient?: boolean;
  isLiverPatient?: boolean;
  currentMedications?: PrescriptionItem[];
  // Antécédents (onglet dossier patient)
  bloodType?: string;
  familyHistory?: string;
  surgicalHistory?: string;
  pregnanciesCount?: number;
  deliveriesCount?: number;
  miscarriagesCount?: number;
  smokingStatus?: 'Non' | 'Oui' | 'Ancien';
  smokingDetail?: string;
  alcoholUse?: 'Non' | 'Oui' | 'Occasionnel';
  physicalActivity?: string;
  profession?: string;
  vitalSigns?: VitalSign[];
}

export interface VitalSign {
  date: string; // ISO datetime, set automatically at entry time
  weight?: number; // kg
  height?: number; // cm
  systolic?: number; // mmHg
  diastolic?: number; // mmHg
  heartRate?: number; // bpm
  spO2?: number; // %
  temperature?: number; // °C
}

export type AppointmentPriority = 'URGENT' | 'INITIAL' | 'ROUTINE';
// PENDING/CONFIRMED = planifié (en attente ou confirmé par le cabinet) — statuts d'origine, conservés pour compat.
// ARRIVED/IN_CONSULTATION/DONE = cycle de vie salle d'attente ajouté pour l'agenda. REJECTED = annulé.
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'IN_CONSULTATION' | 'DONE' | 'REJECTED';
export type AppointmentType = 'Consultation' | 'Contrôle' | 'Urgence' | 'Vaccination' | 'Autre';

export interface Appointment {
  id: string;
  patientId?: string; // Lien optionnel vers un dossier patient existant
  patientName: string;
  phone: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm — optionnel pour compat avec les RDV existants sans heure
  duration?: number; // minutes (15/30/45/60), défaut 30
  consultationType?: AppointmentType;
  note: string; // Reason for visit
  priority: AppointmentPriority;
  status: AppointmentStatus;
  aiClassification?: string;
  bookedByDoctor?: boolean; // Indique si le médecin a pris le RDV lui-même
}

export interface DailyCapacity {
  date: string;
  limit: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  date: string;
  items: PrescriptionItem[];
  amount: number;
  patientType: PatientType;
  patientAge?: number;
  patientWeight?: string;
}

export interface PrescriptionDraft {
  patient: Partial<Patient>;
  items: PrescriptionItem[];
  amount: number;
  selectedTests: string[];
}

export const EXPENSE_CATEGORIES = [
  'Loyer & charges du local',
  'Salaires & charges sociales (CNSS)',
  'Fournitures médicales & consommables',
  'Équipement médical & amortissement',
  'Assurance professionnelle (RC médicale)',
  'Taxe professionnelle (patente)',
  'Frais comptable/juridique',
  'Formation continue',
  'Électricité/eau/téléphone/internet',
  'Autre',
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  categoryDetail?: string; // Required when category === 'Autre'
  label: string;
  amount: number;
  receiptDataUrl?: string; // Base64 photo/scan of the justificatif
  noReceiptConfirmed?: boolean; // Explicit "sans justificatif" acknowledgement
}

export type ResourceType = 'JSON' | 'PDF' | 'Word' | 'Manuel';

export interface MedicalResource {
  id: string;
  title: string;
  type: ResourceType;
  description?: string;
  filePath?: string; // Path for PDF/Word
  content?: string; // Content for Manuel or JSON text
  tags?: string[];
  createdAt: string;
}

export interface DailyReport {
  date: string;
  totalRevenue: number;
  totalExpenses: number;
  prescriptionsCount: number;
}

export type NotificationType = 'info' | 'warning' | 'success' | 'date';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  actionLink?: string; // Route to navigate to (e.g., patient dossier)
  patientId?: string;
  isRead: boolean;
}

export type TaskPriority = 'Haute' | 'Moyenne' | 'Basse';
export type TaskCategory = 'Medical' | 'Admin' | 'FollowUp';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  category?: TaskCategory;
  assignedTo?: string; // User ID or Name
  dueDate: string;
  isCompleted: boolean;
  createdAt: string;
  patientId?: string; // Optional link to a patient
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
}

export enum Resolution {
  P720 = '720p',
  P1080 = '1080p',
  P4K = '4K',
}

export enum VeoModel {
  VEO = 'veo-3.1-generate-preview',
  VEO_FAST = 'veo-3.1-fast-generate-preview',
}

export enum GenerationMode {
  TEXT_TO_VIDEO = 'Text-to-Video',
  FRAMES_TO_VIDEO = 'Image-to-Video',
  REFERENCES_TO_VIDEO = 'References-to-Video',
  EXTEND_VIDEO = 'Extend Video',
}

export interface ImageFile {
  file: File;
  base64: string;
}

export interface VideoFile {
  file: File;
  base64: string;
}

export interface GenerateVideoParams {
  prompt: string;
  model: VeoModel;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: GenerationMode;
  startFrame: ImageFile | null;
  endFrame: ImageFile | null;
  referenceImages: ImageFile[];
  styleImage: ImageFile | null;
  inputVideo: VideoFile | null;
  inputVideoObject: Video | null;
  isLooping: boolean;
  duration?: number;
  fps?: number;
  seed?: number;
}

// --- SMARTDOC TYPES ---

export interface SmartDocItem {
  type: 'OBSERVATION' | 'ACTION' | 'ALERT';
  content: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SmartDocAnalysis {
  summary: string;
  patientName?: string;
  date?: string;
  items: SmartDocItem[];
  suggestedActions?: string[];
}

export interface SmartDocSession {
  id: string;
  date: string;
  originalFileName: string;
  analysis: SmartDocAnalysis;
}

// --- VACCINATION TYPES ---

export interface Vaccine {
  id: string;
  name: string;
  targetAgeMonths: number; // Age in months (0 = birth)
  description?: string;
  mandatory: boolean;
  diseasePrevented: string;
}

export interface VaccinationRecord {
  id: string;
  patientId: string;
  vaccineId: string;
  dateAdministered: string;
  batchNumber?: string;
  status: 'DONE' | 'MISSED' | 'REFUSED';
  nextDueDate?: string;
  notes?: string;
}

