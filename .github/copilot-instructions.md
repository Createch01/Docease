# DocEase - AI Coding Guidelines

## Project Overview
DocEase is a medical prescription management system built with React + Tauri for desktop. It manages patients, prescriptions, medicines with safety validations, and includes audit trails for regulatory compliance.

## Architecture
- **Frontend**: React 19 with lazy-loaded components, TypeScript, Vite build
- **Backend**: Tauri (Rust) for desktop packaging, local storage via dataService
- **Data Flow**: Local storage (no server), Gemini AI integration for video generation
- **Key Components**: Dashboard, PatientManager, PrescriptionEditor (with safety checks), MedicineManager

## Key Conventions
- **Language**: French UI text, Arabic support for doctor info
- **Safety System**: 4-level validation (child restrictions, incompatibilities, age warnings, interactions)
- **Audit Trail**: All overrides logged with `[AUDIT]` prefix in console and stored in prescription JSON
- **Data Persistence**: Local storage with keys like `meddoc_*`, no external APIs except Gemini

## Development Workflow
- **Build**: `npm run dev` (Vite), `npm run build` for production
- **Testing**: Manual testing via UI, check console for `[AUDIT]` logs
- **Safety Validation**: Update `medications.json` with `restriction` and `incompatibleWith` fields
- **Components**: Use lazy loading, place in `/components/`, export default

## Specific Patterns
- **Medicine Restrictions**: Add to `Medicine` interface - `restriction: {status: 'interdit'|'attention'|'autorise', minAge?, reason?}`
- **Incompatibilities**: `incompatibleWith: string[]` in medicine data, checked in `runLocalSafetyCheck()`
- **Override Modal**: For doctor overrides, store `overriddenByDoctor: true, overrideReason: string`
- **Animations**: Use `.animate-danger-blink` (red flashing) and `.animate-incomp-pulse` (shadow pulse) for alerts
- **Error Handling**: Console logs for debugging, no try/catch in safety checks

## Examples
- **Adding Safety Check**: In `PrescriptionEditor.tsx`, extend `runLocalSafetyCheck()` to check `medicine.restriction.status === 'interdit' && patient.age < 15`
- **Audit Logging**: `console.log(`[AUDIT] Médecin a ignoré alerte ${notificationId} avec raison: ${reason}`)`
- **Component State**: Use `useState<Set<string>>` for `overriddenWarnings` to track dismissed alerts

## File References
- [types.ts](types.ts) - Core interfaces including `MedicineRestriction`, `PrescriptionItem`
- [components/PrescriptionEditor.tsx](components/PrescriptionEditor.tsx) - Safety validation logic
- [services/dataService.ts](services/dataService.ts) - Data management and default medicines
- [medications_with_restrictions.json](medications_with_restrictions.json) - Example medicine data structure