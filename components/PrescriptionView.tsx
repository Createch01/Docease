
import React, { useMemo } from 'react';
import { Prescription, DoctorInfo, PrescriptionAppearance } from '../types';
import { settingsService } from '../services/settingsService';
import { dataService } from '../services/dataService';
import { Phone, Mail, Barcode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface PrescriptionViewProps {
  prescription: Prescription;
  doctor: DoctorInfo;
  isPreview?: boolean;
}

import ExactPrescriptionTemplate from './ExactPrescriptionTemplate';

const PrescriptionView: React.FC<PrescriptionViewProps> = ({ prescription, doctor, isPreview = false }) => {
  const appearance = settingsService.getAppearance();

  const patientProfile = useMemo(() => dataService.getPatientProfile(prescription.patientId), [prescription.patientId]);

  // Map prescription to template patient format
  const patientData = {
    name: patientProfile ? patientProfile.name : prescription.patientId,
    age: prescription.patientAge || patientProfile?.age,
    type: prescription.patientType || patientProfile?.type || 'Adult'
  };

  if (isPreview) {
    return (
      <div className="w-full h-full bg-[#f1f5f9] flex flex-col items-center p-2 overflow-auto scrollbar-hide">
        <div className="relative group">
          {/* Subtle "Paper Stack" effect for professionalism */}
          <div className="absolute inset-0 bg-white translate-x-2 translate-y-2 rounded-sm shadow-md -z-10 opacity-50" />
          <div className="absolute inset-0 bg-white translate-x-1 translate-y-1 rounded-sm shadow-md -z-10 opacity-70" />

          <div className="shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] bg-white rounded-sm overflow-hidden ring-1 ring-slate-200">
            <ExactPrescriptionTemplate
              id={`preview-${prescription.id}`}
              doctor={doctor}
              appearance={appearance}
              patient={patientData}
              items={prescription.items}
              date={prescription.date}
              scale={0.17}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ExactPrescriptionTemplate
      id={`view-${prescription.id}`}
      doctor={doctor}
      appearance={appearance}
      patient={patientData}
      items={prescription.items}
      date={prescription.date}
    />
  );
};

export default PrescriptionView;
