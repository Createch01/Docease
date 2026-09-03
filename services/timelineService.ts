import { dataService } from './dataService';
import { vaccinationService } from './vaccinationService';

export type TimelineEventType =
    | 'consultation'
    | 'prescription'
    | 'invoice'
    | 'lab_request'
    | 'result'
    | 'certificate'
    | 'vaccination';

export interface TimelineEvent {
    id: string;
    date: string; // YYYY-MM-DD
    type: TimelineEventType;
    title: string;
    subtitle?: string;
    sourceTab: 'consultation' | 'ordonnance' | 'facture' | 'analyses' | 'resultats' | 'certificats' | 'vaccination';
    refId: string; // id of the underlying record, so the target tab can select it
}

// Aggregates every dated record attached to a patient (consultations, prescriptions,
// invoices, lab requests, results, certificates, vaccinations) into one sorted feed.
// Nothing here is stored — it's a pure read-time view over dataService/vaccinationService.
export const timelineService = {
    getPatientTimeline: (patientId: string): TimelineEvent[] => {
        const events: TimelineEvent[] = [];

        dataService.getConsultations(patientId).forEach(c => events.push({
            id: `cons-${c.id}`, date: c.date, type: 'consultation',
            title: c.motif || 'Consultation', subtitle: c.diagnostic || undefined,
            sourceTab: 'consultation', refId: c.id,
        }));

        dataService.getPrescriptions().filter(p => p.patientId === patientId).forEach(p => events.push({
            id: `rx-${p.id}`, date: p.date, type: 'prescription',
            title: 'Ordonnance', subtitle: p.items.map(i => i.medicineName).join(', ') || undefined,
            sourceTab: 'ordonnance', refId: p.id,
        }));

        dataService.getHonoraryNotes(patientId).forEach(n => events.push({
            id: `inv-${n.id}`, date: n.date, type: 'invoice',
            title: `Facture #${n.invoiceNumber}`, subtitle: `${n.totalAmount} — ${n.status}`,
            sourceTab: 'facture', refId: n.id,
        }));

        dataService.getLabRequests(patientId).forEach(l => events.push({
            id: `lab-${l.id}`, date: l.date, type: 'lab_request',
            title: l.title || 'Demande d\'analyse', subtitle: l.tests.join(', ') || undefined,
            sourceTab: 'analyses', refId: l.id,
        }));

        dataService.getMedicalResults(patientId).forEach(r => events.push({
            id: `res-${r.id}`, date: r.date, type: 'result',
            title: r.title || 'Résultat', subtitle: r.interpretation || undefined,
            sourceTab: 'resultats', refId: r.id,
        }));

        dataService.getMedicalCertificates(patientId).forEach(c => events.push({
            id: `cert-${c.id}`, date: c.date, type: 'certificate',
            title: `Certificat (${c.type})`, subtitle: undefined,
            sourceTab: 'certificats', refId: c.id,
        }));

        const schedule = vaccinationService.getSchedule();
        vaccinationService.getPatientRecords(patientId).forEach(v => events.push({
            id: `vac-${v.id}`, date: v.dateAdministered, type: 'vaccination',
            title: schedule.find(s => s.id === v.vaccineId)?.name || 'Vaccination',
            subtitle: v.status, sourceTab: 'vaccination', refId: v.id,
        }));

        return events
            .filter(e => !!e.date)
            .sort((a, b) => b.date.localeCompare(a.date));
    },
};
