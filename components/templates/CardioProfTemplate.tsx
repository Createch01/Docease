import React from 'react';
import ExactPrescriptionTemplate from '../ExactPrescriptionTemplate';
import { DoctorInfo, PrescriptionAppearance, PrescriptionItem, PatientType } from '../../types';

interface Props {
    id?: string;
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: { name?: string; age?: number; type?: PatientType };
    items: PrescriptionItem[];
    date?: string;
    isPrinting?: boolean;
    scale?: number;
}

const CardioProfTemplate: React.FC<Props> = (props) => (
    <ExactPrescriptionTemplate {...props} variant="cardio_pro" />
);

export default CardioProfTemplate;
