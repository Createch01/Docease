
import { Video } from '@google/genai';

export type MedicineCategory = 'Antibiotique' | 'Vitamine' | 'Antalgique' | 'Anti-inflammatoire' | 'Sirop' | 'Autre';
export type MealTiming = 'Avant repas' | 'Pendant repas' | 'Après repas' | 'Indifférent';
export type PatientType = 'Adult' | 'Child' | 'Woman';

export interface MedicineRestriction {
  status: 'interdit' | 'attention' | 'autorise';
  minAge?: number;
  maxAge?: number;
  reason?: string;
}

export interface Medicine {
  id: string;
  name: string;
  category: MedicineCategory;
  defaultDosage: string;
  defaultTiming: MealTiming;
  isAdultOnly?: boolean;
  interactionGroup?: string;
  restriction?: MedicineRestriction;
  incompatibleWith?: string[]; // Liste des noms de médicaments ou groupes incompatibles
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
}

export type FontSizeOption = 'small' | 'medium' | 'large';

export interface PrescriptionAppearance {
  primaryColor: string; // Couleur pour header/bordures (ex: #10b981)
  fontSize: FontSizeOption; // Taille de police: small, medium, large
  logoUrl?: string; // URL du logo du cabinet
  logoScale: number; // Échelle du logo (1-3)
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  dosage: string;
  timing: MealTiming;
  warning?: string;
  interactionGroup?: string;
  overriddenByDoctor?: boolean; // Indique si le médecin a dépassé une restriction
  overrideReason?: string; // Raison de l'annulation
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

export interface DailyReport {
  date: string;
  totalRevenue: number;
  prescriptionsCount: number;
}

export type TaskPriority = 'Haute' | 'Moyenne' | 'Basse';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  dueDate: string;
  isCompleted: boolean;
  createdAt: string;
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
}
