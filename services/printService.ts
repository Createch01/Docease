import { Patient, ClinicalConsultation, Prescription, MedicalResult, AppUser, VaccinationRecord } from '../types';

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

    const formatDate = (date: string) => new Date(date).toLocaleDateString();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dossier Médical - ${patient.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          @page { size: A4; margin: 15mm; }
          body { 
            font-family: 'Inter', sans-serif; 
            padding: 0; 
            margin: 0; 
            color: #1f2937; 
            line-height: 1.5;
            background: white;
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 4px solid #059669; 
            padding-bottom: 20px; 
          }
          .doctor-name { font-size: 28px; font-weight: 900; color: #059669; text-transform: uppercase; margin: 0; }
          .doctor-info { font-size: 14px; color: #6b7280; font-weight: 700; margin-top: 5px; }
          
          .patient-section { 
            background: #f9fafb; 
            padding: 25px; 
            border-radius: 16px; 
            margin-bottom: 30px; 
            border: 2px solid #e5e7eb; 
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .patient-name { font-size: 24px; font-weight: 900; color: #111827; text-transform: uppercase; margin: 0; }
          .patient-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; font-weight: 700; color: #4b5563; }
          .meta-item { display: flex; gap: 5px; }
          .meta-label { color: #9ca3af; text-transform: uppercase; width: 60px; }
          
          h2 { 
            font-size: 14px; 
            font-weight: 900; 
            color: #059669; 
            text-transform: uppercase; 
            border-bottom: 2px solid #f3f4f6; 
            padding-bottom: 8px; 
            margin-top: 40px; 
            letter-spacing: 0.1em;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          h2::after { content: ''; flex: 1; height: 1px; background: #f3f4f6; }
          
          .item { margin-bottom: 20px; page-break-inside: avoid; border-left: 3px solid #05966920; padding-left: 15px; }
          .item-header { display: flex; justify-content: space-between; margin-bottom: 6px; align-items: baseline; }
          .item-date { font-size: 11px; font-weight: 900; color: #9ca3af; text-transform: uppercase; }
          .item-title { font-size: 15px; font-weight: 800; color: #111827; }
          .item-detail { font-size: 13px; color: #4b5563; margin: 4px 0; }
          .item-label { font-weight: 700; color: #374151; margin-right: 5px; }
          
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
          th { text-align: left; color: #9ca3af; font-weight: 900; text-transform: uppercase; font-size: 10px; padding: 12px 0; border-bottom: 2px solid #f3f4f6; }
          td { padding: 12px 0; border-bottom: 1px solid #f9fafb; color: #374151; font-weight: 500; }
          
          .print-footer { 
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #f3f4f6;
            text-align: center; 
            font-size: 11px; 
            color: #9ca3af; 
            font-weight: 700; 
          }
          
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
            @page { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="doctor-name">Dr. ${doctor.nameFr}</h1>
          <div class="doctor-info">${doctor.specialty} - ${doctor.phone}</div>
        </div>

        <div class="patient-section">
          <h1 class="patient-name">${patient.name}</h1>
          <div class="patient-meta">
            <div class="meta-item"><span class="meta-label">Âge:</span> ${patient.age} ans</div>
            <div class="meta-item"><span class="meta-label">Tél:</span> ${patient.phone || 'N/A'}</div>
            <div class="meta-item"><span class="meta-label">Réf:</span> #${patient.id.slice(-6)}</div>
            <div class="meta-item"><span class="meta-label">Date:</span> ${new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        <h2>Historique des Consultations</h2>
        ${consultations.length > 0 ? consultations.map(c => `
          <div class="item">
            <div class="item-header">
              <span class="item-title">${c.motif || 'Consultation Standard'}</span>
              <span class="item-date">${formatDate(c.date)}</span>
            </div>
            ${c.diagnostic ? `<div class="item-detail"><strong>Diagnostic:</strong> ${c.diagnostic}</div>` : ''}
            ${c.treatmentPlan ? `<div class="item-detail"><strong>Traitement:</strong> ${c.treatmentPlan}</div>` : ''}
          </div>
        `).join('') : '<p class="item-detail">Aucune consultation enregistrée.</p>'}

        <h2>Ordonnances Prescrites</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Médicaments</th>
            </tr>
          </thead>
          <tbody>
            ${prescriptions.length > 0 ? prescriptions.map(p => `
              <tr>
                <td width="100">${formatDate(p.date)}</td>
                <td>${p.items.map(i => i.medicineName).join(', ')}</td>
              </tr>
            `).join('') : '<tr><td colspan="2">Aucune ordonnance.</td></tr>'}
          </tbody>
        </table>

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
            `).join('') : '<tr><td colspan="3">Aucun résultat.</td></tr>'}
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
            ${vaccinations.length > 0 ? vaccinations.map(v => `
              <tr>
                <td>${v.vaccineId.toUpperCase()}</td>
                <td>${formatDate(v.dateAdministered)}</td>
                <td>${v.batchNumber || '-'}</td>
                <td>${v.status}</td>
              </tr>
            `).join('') : '<tr><td colspan="4">Aucun vaccin enregistré.</td></tr>'}
          </tbody>
        </table>

        <div class="print-footer">
          Document généré par DocEase Pro le ${new Date().toLocaleString()}
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
