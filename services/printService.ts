import { Patient, ClinicalConsultation, Prescription, MedicalResult, VaccinationRecord } from '../types';
import { vaccinationService } from './vaccinationService';
import { getActiveTreatment } from '../utils/activeTreatment';
import { calculateIMC } from '../utils/formatters';

const NR = '<span class="empty">Non renseigné</span>';
const esc = (v: any) => (v === undefined || v === null || v === '') ? null : String(v);

export const printService = {
  printPatientDossier: (
    patient: Patient,
    consultations: ClinicalConsultation[],
    prescriptions: Prescription[],
    results: MedicalResult[],
    vaccinations: VaccinationRecord[],
    doctor: any
  ) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const formatDate = (date: string) => new Date(date).toLocaleDateString('fr-FR');

    const consultationsDesc = [...consultations].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const prescriptionsDesc = [...prescriptions].sort((a, b) => b.date.localeCompare(a.date));
    const activeTreatment = getActiveTreatment(prescriptionsDesc);
    const vitalHistory = [...(patient.vitalSigns || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const vaccineStatus = vaccinationService.getVaccinationStatus(patient);
    const vaccineStatusLabel: Record<string, string> = { DONE: 'Fait', OVERDUE: 'En retard', DUE: 'À faire', UPCOMING: 'À venir' };

    const allergiesList = (patient.allergies || '').split(',').map(a => a.trim()).filter(Boolean);
    const chronicList = patient.chronicDiseases || [];
    const habits: string[] = [];
    if (patient.smokingStatus) habits.push(`Tabac: ${patient.smokingStatus}${patient.smokingDetail ? ` (${patient.smokingDetail})` : ''}`);
    if (patient.alcoholUse) habits.push(`Alcool: ${patient.alcoholUse}`);
    if (patient.physicalActivity) habits.push(`Activité physique: ${patient.physicalActivity}`);
    if (patient.profession) habits.push(`Profession: ${patient.profession}`);

    const gynecoRows: string[] = [];
    if (patient.sex === 'F') {
      if (patient.pregnanciesCount !== undefined) gynecoRows.push(`Grossesses: ${patient.pregnanciesCount}`);
      if (patient.deliveriesCount !== undefined) gynecoRows.push(`Accouchements: ${patient.deliveriesCount}`);
      if (patient.miscarriagesCount !== undefined) gynecoRows.push(`Fausses couches: ${patient.miscarriagesCount}`);
      if (patient.isPregnant) gynecoRows.push(`Enceinte${patient.pregnancyWeeks ? ` (${patient.pregnancyWeeks} SA)` : ''}`);
      if (patient.isBreastfeeding) gynecoRows.push('Allaitement en cours');
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dossier Médical - ${patient.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          @page { size: A4 portrait; margin: 15mm; }
          body {
            font-family: 'Inter', sans-serif;
            padding: 0;
            margin: 0;
            color: #111827;
            line-height: 1.5;
            background: white;
            font-size: 11pt;
          }
          .empty { color: #6b7280; font-style: italic; font-weight: 500; }
          .header {
            text-align: center;
            margin-bottom: 24px;
            border-bottom: 3px solid #111827;
            padding-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
          }
          .header img.logo { max-height: 60px; max-width: 120px; object-fit: contain; }
          .doctor-name { font-size: 18pt; font-weight: 900; color: #111827; text-transform: uppercase; margin: 0; }
          .doctor-info { font-size: 11pt; color: #374151; font-weight: 700; margin-top: 4px; }

          .patient-section {
            background: #f9fafb;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 24px;
            border: 1px solid #d1d5db;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .patient-name { font-size: 16pt; font-weight: 900; color: #111827; text-transform: uppercase; margin: 0; }
          .patient-meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; font-size: 11pt; font-weight: 700; color: #374151; }
          .meta-item { display: flex; gap: 5px; }
          .meta-label { color: #6b7280; text-transform: uppercase; font-size: 9pt; min-width: 60px; }

          h2 {
            font-size: 14pt;
            font-weight: 900;
            color: #111827;
            text-transform: uppercase;
            border-bottom: 2px solid #111827;
            padding-bottom: 6px;
            margin-top: 28px;
            margin-bottom: 12px;
            letter-spacing: 0.05em;
          }

          .critical-box { border: 2px solid #111827; border-radius: 10px; padding: 16px; margin-top: 10px; }
          .critical-row { margin-bottom: 8px; font-size: 11pt; }
          .critical-row:last-child { margin-bottom: 0; }
          .critical-label { font-weight: 900; text-transform: uppercase; font-size: 9pt; color: #374151; display: block; margin-bottom: 2px; }
          .tag { display: inline-block; border: 1px solid #6b7280; border-radius: 999px; padding: 2px 10px; margin: 2px 4px 2px 0; font-size: 10pt; font-weight: 700; }

          .item { margin-bottom: 16px; page-break-inside: avoid; border-left: 3px solid #d1d5db; padding-left: 14px; }
          .item-header { display: flex; justify-content: space-between; margin-bottom: 4px; align-items: baseline; }
          .item-date { font-size: 9pt; font-weight: 900; color: #6b7280; text-transform: uppercase; }
          .item-title { font-size: 12pt; font-weight: 800; color: #111827; }
          .item-detail { font-size: 11pt; color: #374151; margin: 3px 0; }

          table { width: 100%; border-collapse: collapse; font-size: 11pt; margin-top: 8px; }
          th { text-align: left; color: #374151; font-weight: 900; text-transform: uppercase; font-size: 9pt; padding: 10px 6px; border-bottom: 2px solid #111827; }
          td { padding: 10px 6px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 500; }

          .print-footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #d1d5db;
            text-align: center;
            font-size: 9pt;
            color: #374151;
            font-weight: 700;
          }
          .print-footer .confidential { text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }

          @media print {
            body { padding: 0; }
            .no-print { display: none; }
            @page { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${doctor?.logoUrl ? `<img class="logo" src="${doctor.logoUrl}" />` : ''}
          <div>
            <h1 class="doctor-name">Dr. ${esc(doctor?.nameFr) || ''}</h1>
            <div class="doctor-info">${[esc(doctor?.specialtyFr), esc(doctor?.phone), esc(doctor?.addressFr)].filter(Boolean).join(' — ')}</div>
          </div>
        </div>

        <div class="patient-section">
          <h1 class="patient-name">${patient.name}</h1>
          <div class="patient-meta">
            <div class="meta-item"><span class="meta-label">Âge:</span> ${patient.age} ans</div>
            <div class="meta-item"><span class="meta-label">Naissance:</span> ${patient.dateOfBirth ? formatDate(patient.dateOfBirth) : NR}</div>
            <div class="meta-item"><span class="meta-label">Sexe:</span> ${patient.sex === 'F' ? 'Féminin' : 'Masculin'}</div>
            <div class="meta-item"><span class="meta-label">Tél:</span> ${esc(patient.phone) || NR}</div>
            <div class="meta-item"><span class="meta-label">Adresse:</span> ${esc(patient.address) || NR}</div>
            <div class="meta-item"><span class="meta-label">Groupe sanguin:</span> ${esc(patient.bloodType) || NR}</div>
            <div class="meta-item"><span class="meta-label">CIN:</span> ${esc(patient.cin) || NR}</div>
            <div class="meta-item"><span class="meta-label">Réf:</span> #${patient.id.slice(-6)}</div>
            <div class="meta-item"><span class="meta-label">Date:</span> ${new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        <h2>Zone Critique</h2>
        <div class="critical-box">
          <div class="critical-row">
            <span class="critical-label">Allergies</span>
            ${allergiesList.length > 0 ? allergiesList.map(a => `<span class="tag">${a}</span>`).join('') : NR}
          </div>
          <div class="critical-row">
            <span class="critical-label">Maladies chroniques</span>
            ${chronicList.length > 0 ? chronicList.map(c => `<span class="tag">${c}</span>`).join('') : NR}
          </div>
          <div class="critical-row">
            <span class="critical-label">Traitements actuels</span>
            ${activeTreatment && activeTreatment.items.length > 0 ? activeTreatment.items.map(i => `<span class="tag">${i.medicineName}${i.dosage ? ` · ${i.dosage}` : ''}</span>`).join('') : NR}
          </div>
        </div>

        <h2>Antécédents</h2>
        <div class="critical-box">
          <div class="critical-row">
            <span class="critical-label">Personnels (médicaux)</span>
            ${esc(patient.pathologies) || (patient.pathologyTags && patient.pathologyTags.length > 0 ? patient.pathologyTags.join(', ') : NR)}
          </div>
          <div class="critical-row">
            <span class="critical-label">Chirurgicaux</span>
            ${esc(patient.surgicalHistory) || NR}
          </div>
          <div class="critical-row">
            <span class="critical-label">Familiaux</span>
            ${esc(patient.familyHistory) || NR}
          </div>
          ${patient.sex === 'F' ? `
          <div class="critical-row">
            <span class="critical-label">Gynéco-obstétricaux</span>
            ${gynecoRows.length > 0 ? gynecoRows.join(' · ') : NR}
          </div>` : ''}
          <div class="critical-row">
            <span class="critical-label">Habitudes de vie</span>
            ${habits.length > 0 ? habits.join(' · ') : NR}
          </div>
        </div>

        <h2>Dernières Constantes Vitales</h2>
        ${vitalHistory.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Poids</th>
              <th>Taille</th>
              <th>Tension</th>
              <th>FC</th>
              <th>SpO2</th>
              <th>Temp.</th>
              <th>IMC</th>
            </tr>
          </thead>
          <tbody>
            ${vitalHistory.map(v => {
              const imc = calculateIMC(v.weight, v.height);
              return `
              <tr>
                <td>${formatDate(v.date)}</td>
                <td>${v.weight !== undefined ? `${v.weight} kg` : '—'}</td>
                <td>${v.height !== undefined ? `${v.height} cm` : '—'}</td>
                <td>${v.systolic !== undefined || v.diastolic !== undefined ? `${v.systolic ?? '—'}/${v.diastolic ?? '—'}` : '—'}</td>
                <td>${v.heartRate !== undefined ? `${v.heartRate} bpm` : '—'}</td>
                <td>${v.spO2 !== undefined ? `${v.spO2} %` : '—'}</td>
                <td>${v.temperature !== undefined ? `${v.temperature} °C` : '—'}</td>
                <td>${imc ? `${imc.value} (${imc.interpretation})` : '—'}</td>
              </tr>
            `; }).join('')}
          </tbody>
        </table>` : `<p class="item-detail">${NR}</p>`}

        <h2>Historique des Consultations (5 dernières)</h2>
        ${consultationsDesc.length > 0 ? consultationsDesc.map(c => `
          <div class="item">
            <div class="item-header">
              <span class="item-title">${c.motif || 'Consultation Standard'}</span>
              <span class="item-date">${formatDate(c.date)}</span>
            </div>
            ${c.diagnostic ? `<div class="item-detail"><strong>Diagnostic:</strong> ${c.diagnostic}</div>` : ''}
            ${c.treatmentPlan ? `<div class="item-detail"><strong>Traitement:</strong> ${c.treatmentPlan}</div>` : ''}
          </div>
        `).join('') : `<p class="item-detail">${NR}</p>`}

        <h2>Ordonnances Actives</h2>
        ${activeTreatment && activeTreatment.items.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Médicament</th>
              <th>Dosage</th>
            </tr>
          </thead>
          <tbody>
            ${activeTreatment.items.map(i => `
              <tr>
                <td>${i.medicineName}</td>
                <td>${i.dosage || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : `<p class="item-detail">${NR}</p>`}

        <h2>Résultats d'Analyses</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Résultat</th>
            </tr>
          </thead>
          <tbody>
            ${results.length > 0 ? results.map(r => `
              <tr>
                <td width="100">${formatDate(r.date)}</td>
                <td>${r.title}</td>
                <td>${r.interpretation || 'Voir pièce jointe'}</td>
              </tr>
            `).join('') : `<tr><td colspan="3">${NR}</td></tr>`}
          </tbody>
        </table>

        <h2>Statut Vaccinal</h2>
        <table>
          <thead>
            <tr>
              <th>Vaccin</th>
              <th>Date</th>
              <th>Lot</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${vaccineStatus.length > 0 ? vaccineStatus.map(v => `
              <tr>
                <td>${v.vaccine.name}</td>
                <td>${v.record ? formatDate(v.record.dateAdministered) : '—'}</td>
                <td>${v.record?.batchNumber || '—'}</td>
                <td>${vaccineStatusLabel[v.status] || v.status}</td>
              </tr>
            `).join('') : `<tr><td colspan="4">${NR}</td></tr>`}
          </tbody>
        </table>

        <div class="print-footer">
          Document généré par DocEase le ${new Date().toLocaleString('fr-FR')}
          <div class="confidential">Document confidentiel — Usage médical uniquement</div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  },

  printLabRequest: (
    patient: Patient,
    labRequest: any,
    doctor: any
  ) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Demande d'Analyses - ${patient.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Noto+Naskh+Arabic:wght@400;700&display=swap');
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; color: #1f2937; line-height: 1.6; margin: 0; padding: 0; background: white; }
          .font-arabic { font-family: 'Noto Naskh Arabic', serif; }
          .page { width: 210mm; min-height: 297mm; padding: 20mm; position: relative; box-sizing: border-box; background: white; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
          .doctor-fr { text-align: left; width: 45%; }
          .doctor-ar { text-align: right; width: 45%; }
          .dr-name-fr { font-size: 20px; font-weight: 900; color: #111827; margin: 0; text-transform: uppercase; }
          .dr-spec-fr { font-size: 11px; font-weight: 700; color: #374151; margin: 2px 0; }
          .dr-dimp-fr { font-size: 9px; color: #6b7280; line-height: 1.2; }
          .dr-name-ar { font-size: 22px; font-weight: 900; color: #111827; margin: 0; }
          .dr-spec-ar { font-size: 13px; font-weight: 700; color: #374151; margin: 2px 0; }
          .dr-dimp-ar { font-size: 10px; color: #6b7280; line-height: 1.2; }
          .date-line { text-align: right; font-size: 14px; font-weight: 700; margin: 20px 0; color: #374151; }
          .blue-banner { background-color: #4e84c4; color: white; padding: 15px 0; width: 90%; margin: 30px auto 40px auto; text-align: center; border-radius: 12px; font-weight: 900; font-size: 22px; letter-spacing: 1px; text-transform: uppercase; }
          .patient-info { margin-bottom: 40px; padding: 0 10px; }
          .patient-line { display: flex; align-items: baseline; gap: 15px; border-bottom: 2px dotted #e5e7eb; padding-bottom: 8px; }
          .label { font-size: 14px; font-weight: 800; color: #6b7280; text-transform: uppercase; min-width: 150px; }
          .value { font-size: 18px; font-weight: 900; color: #111827; text-transform: uppercase; }
          .content-title { font-size: 15px; font-weight: 900; margin-bottom: 25px; color: #111827; padding-left: 10px; text-decoration: underline; text-underline-offset: 8px; }
          .tests-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 40px; padding: 0 10px; }
          .test-item { display: flex; align-items: center; gap: 15px; font-size: 15px; font-weight: 700; color: #1f2937; }
          .checkbox { width: 20px; height: 20px; border: 2px solid #4e84c4; border-radius: 6px; flex-shrink: 0; }
          .notes-box { margin-top: 50px; padding: 20px; font-size: 14px; color: #4b5563; background: #f9fafb; border-radius: 12px; border: 1px solid #f3f4f6; }
          .signature { position: absolute; right: 20mm; bottom: 50mm; text-align: center; width: 60mm; }
          .signature-label { font-size: 13px; font-weight: 800; color: #9ca3af; margin-top: 60px; border-top: 1px solid #eee; padding-top: 10px; text-transform: uppercase; }
          .footer { position: absolute; bottom: 10mm; left: 20mm; right: 20mm; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 15px; }
          @media print { body { background: none; } .page { padding: 15mm; width: 100%; height: 100%; } -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="doctor-fr">
              <h1 class="dr-name-fr">${doctor.nameFr}</h1>
              <div class="dr-spec-fr">${doctor.specialtyFr}</div>
              <div class="dr-dimp-fr">${doctor.diplomasFr}</div>
            </div>
            <div class="doctor-ar">
              <h1 class="dr-name-ar font-arabic">${doctor.nameAr}</h1>
              <div class="dr-spec-ar font-arabic">${doctor.specialtyAr}</div>
              <div class="dr-dimp-ar font-arabic">${doctor.diplomasAr}</div>
            </div>
          </div>

          <div class="date-line">Inezegane, le ${new Date(labRequest.date).toLocaleDateString('fr-FR')}</div>

          <div class="blue-banner">Demande d'Analyses</div>

          <div class="patient-info">
            <div class="patient-line"><span class="label">Patient:</span><span class="value">${patient.name}</span></div>
          </div>

          <div class="content-title">Prière de faire les analyses suivantes:</div>
          
          <div class="tests-grid">
            ${labRequest.tests.map((test: string) => `
              <div class="test-item">
                <div class="checkbox"></div>
                <span>${test}</span>
              </div>
            `).join('')}
          </div>

          ${labRequest.notes ? `<div class="notes-box"><strong>Observations :</strong><br>${labRequest.notes}</div>` : ''}

          <div class="signature"><div class="signature-label">Cachet et Signature</div></div>

          <div class="footer">${doctor.addressFr} | Tél: ${doctor.phone}<br>Document numérique - Validité permanente</div>
        </div>

        <script>
          window.onload = function() { 
            window.print(); 
            // Close window after print dialog is closed (optional, but clean)
            // window.onafterprint = function() { window.close(); }
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};
