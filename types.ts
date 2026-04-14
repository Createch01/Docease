import { Video } from '@google/genai';


export type MedicineCategory = string;
export type MealTiming = 'Avant repas' | 'Pendant repas' | 'Après repas' | 'Indifférent';
export type PatientType = 'Adult' | 'Child' | 'Woman';
export type UserRole = 'Admin' | 'User';
export type Permission =
  | 'ACCESS_DASHBOARD'
  | 'MANAGE_PATIENTS'
  | 'CREATE_PRESCRIPTION'
  | 'MANAGE_APPOINTMENTS'
  | 'VIEW_FINANCES'
  | 'MANAGE_SETTINGS'
  | 'USE_AI_ASSISTANT';

export type LabRequestStatus = 'DRAFT' | 'REQUESTED' | 'RECEIVED' | 'INTERPRETED' | 'CLOSED';

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

export interface Medicine {
  id: string;
  name: string;
  category: MedicineCategory;
  form?: string;
  strength?: string;
  active_ingredient?: string; // New: for exact matching
  defaultDosage: string;
  defaultTiming: MealTiming;
  isAdultOnly?: boolean;
  isPregnantForbidden?: boolean;
  isBreastfeedingForbidden?: boolean;
  isHeartForbidden?: boolean;
  isKidneyForbidden?: boolean;
  isLiverForbidden?: boolean;
  interactionGroup?: string;
  restriction?: MedicineRestriction;
  incompatibleWith?: string[]; // Liste des noms de médicaments ou groupes incompatibles
  contraindications?: MedicineContraindication[]; // New
  majorInteractions?: MedicineInteraction[]; // New
  pregnancyLactation?: any; // New
}

export interface DoctorInfo {
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

  // Multi-user
  users?: AppUser[];
  activeUser?: AppUser;

  // New Dossier Storage Keys (Internal to dataService but tracked here)
  consultations?: ClinicalConsultation[];
  labRequests?: LabRequest[];
  medicalResults?: MedicalResult[];
  invoices?: PatientInvoice[];
  medicalCertificates?: MedicalCertificate[];
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
  url: string;
}

export interface MedicalResult {
  id: string;
  date: string;
  receivedDate: string;
  title: string;
  interpretation: string;
  doctorNotes?: string;
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
  date: string;
  invoiceNumber: string;
  services: HonoraryService[];
  totalAmount: number;
  totalInWords: string;
  status: 'PAID' | 'UNPAID';
  paymentMode: 'CASH' | 'CARD' | 'TRANSFER';
  includeCin?: string;
  includePhone?: string;
}

export interface PatientInvoice {
  id: string;
  date: string;
  items: { description: string; price: number }[];
  total: number;
  paid: number;
  balance: number;
  patientId: string;
}

export type FontSizeOption = 'small' | 'medium' | 'large';

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
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  category?: string;
  form?: string;
  strength?: string;
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
  sex: 'M' | 'F';
  type: PatientType;
  phone?: string;
  weight?: string;
  allergies?: string;
  pathologies?: string;
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
}

export type AppointmentPriority = 'URGENT' | 'INITIAL' | 'ROUTINE';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface Appointment {
  id: string;
  patientName: string;
  phone: string;
  date: string; // YYYY-MM-DD
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

export interface Expense {
  id: string;
  date: string;
  category: string;
  label: string;
  amount: number;
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

