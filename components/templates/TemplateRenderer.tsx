import React from 'react';
import { DoctorInfo, PrescriptionAppearance, PrescriptionItem, PatientType } from '../../types';
import ClassicMoroccanTemplate from './ClassicMoroccanTemplate';
import ModernWaveTemplate from './ModernWaveTemplate';
import MinimalCleanTemplate from './MinimalCleanTemplate';
import CardioProfTemplate from './CardioProfTemplate';

export type PrescriptionTemplateId = 'classic_moroccan' | 'modern_wave' | 'minimal_clean' | 'cardio_pro';

interface Props {
    templateId?: PrescriptionTemplateId;
    id?: string;
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: { name?: string; age?: number; type?: PatientType };
    items: PrescriptionItem[];
    date?: string;
    isPrinting?: boolean;
    scale?: number;
}

const TEMPLATES: Record<PrescriptionTemplateId, React.FC<any>> = {
    classic_moroccan: ClassicMoroccanTemplate,
    modern_wave: ModernWaveTemplate,
    minimal_clean: MinimalCleanTemplate,
    cardio_pro: CardioProfTemplate,
};

const TemplateRenderer: React.FC<Props> = ({ templateId, ...rest }) => {
    const Template = (templateId && TEMPLATES[templateId]) || TEMPLATES.classic_moroccan;
    return <Template {...rest} />;
};

export default TemplateRenderer;
