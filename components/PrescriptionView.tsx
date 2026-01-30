
import React, { useMemo } from 'react';
import { Prescription, DoctorInfo, PrescriptionAppearance } from '../types';
import { settingsService } from '../services/settingsService';

interface PrescriptionViewProps {
  prescription: Prescription;
  doctor: DoctorInfo;
  isPreview?: boolean;
}

const PrescriptionView: React.FC<PrescriptionViewProps> = ({ prescription, doctor, isPreview = false }) => {
  const appearance = useMemo(() => settingsService.getAppearance(), []);
  const fontSizeMultiplier = useMemo(() => settingsService.getFontSizeMultiplier(appearance.fontSize), [appearance.fontSize]);
  const renderBarcode = () => {
    if (!doctor.showBarcode) return null;

    const styles: React.CSSProperties = {
      position: 'absolute',
      width: `${doctor.barcodeSize}px`,
      zIndex: 50,
    };

    switch (doctor.barcodePosition) {
      case 'top-left': 
        styles.top = '100px'; styles.left = '40px'; break;
      case 'top-right': 
        styles.top = '100px'; styles.right = '40px'; break;
      case 'bottom-left': 
        styles.bottom = '120px'; styles.left = '40px'; break;
      case 'bottom-right': 
        styles.bottom = '120px'; styles.right = '40px'; break;
      case 'center-right':
        styles.top = '50%'; styles.right = '20px'; styles.transform = 'translateY(-50%)'; break;
    }

    if (doctor.barcodeImageUrl) {
      return <img src={doctor.barcodeImageUrl} style={styles} className="object-contain" alt="QR Barcode" />;
    }

    // Default simulated barcode if no image
    return (
      <div style={styles} className="bg-white p-2 border border-gray-100 rounded-lg flex flex-col items-center opacity-60">
        <div className="flex gap-[1px] h-8 items-end">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i} 
              className="bg-black" 
              style={{ width: Math.random() > 0.7 ? '2px' : '1px', height: '100%' }} 
            />
          ))}
        </div>
        <p className="text-[6px] font-black mt-1 tracking-[0.2em]">{doctor.barcodeContent}</p>
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-lg relative overflow-hidden flex flex-col print:m-0 print:shadow-none ${isPreview ? 'shadow-2xl aspect-[1/1.41] w-full shrink-0 h-fit' : 'print-page w-full h-[297mm]'}`}
      style={{
        borderTop: `4px solid ${appearance.primaryColor}`,
      }}>
      
      {/* Dynamic Barcode Position */}
      {renderBarcode()}

      {/* Watermark Logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        {doctor.logoUrl && (
          <img 
            src={doctor.logoUrl} 
            className="w-2/3 object-contain" 
            style={{ opacity: doctor.logoOpacity }} 
            alt="Watermark"
          />
        )}
      </div>

      <div className="relative z-10 flex flex-col h-full px-10 pt-8 pb-16">
        {/* Header Section */}
        <div className="flex mb-6 items-start justify-between" style={{ paddingBottom: `${12 * fontSizeMultiplier}px`, borderBottomColor: appearance.primaryColor, borderBottomWidth: '2px' }}>
          <div className="text-[9px] leading-tight space-y-0.5 text-black uppercase w-1/3" style={{ fontSize: `${9 * fontSizeMultiplier}px` }}>
            <p className="font-black tracking-tight" style={{ fontSize: `${11 * fontSizeMultiplier}px`, color: appearance.primaryColor }}>{doctor.nameFr}</p>
            <p className="font-bold border-l-2 pl-1.5" style={{ borderLeftColor: appearance.primaryColor }}>
              {doctor.specialtyFr}
            </p>
            <div className="text-black/80 mt-1.5 whitespace-pre-line leading-[1.2]" style={{ fontSize: `${8 * fontSizeMultiplier}px` }}>
              {doctor.diplomasFr}
            </div>
          </div>
          <div className="flex justify-center w-1/3">
            {doctor.logoUrl && (
              <img 
                src={doctor.logoUrl} 
                className="object-contain" 
                style={{ width: `${doctor.logoScale * 0.8}px` }} 
                alt="Logo" 
              />
            )}
          </div>
          <div className="text-[9px] leading-tight space-y-0.5 text-right font-arabic text-black w-1/3" dir="rtl" style={{ fontSize: `${9 * fontSizeMultiplier}px` }}>
            <p className="font-black" style={{ fontSize: `${14 * fontSizeMultiplier}px`, color: appearance.primaryColor }}>{doctor.nameAr}</p>
            <p className="font-bold border-r-2 pr-1.5" style={{ borderRightColor: appearance.primaryColor }}>
              {doctor.specialtyAr}
            </p>
            <div className="text-black/80 mt-1.5 whitespace-pre-line leading-[1.3]" style={{ fontSize: `${10 * fontSizeMultiplier}px` }}>
              {doctor.diplomasAr}
            </div>
          </div>
        </div>

        {/* Date Section */}
        <div className="text-right font-bold text-black mb-6" style={{ fontSize: `${11 * fontSizeMultiplier}px` }}>
          Agadir le : <span className="font-medium">{new Date(prescription.date).toLocaleDateString('fr-FR')}</span>
        </div>

        {/* Patient Name Section */}
        <div className="mb-8 space-y-2">
          <div className="text-center py-1">
            <p className="font-black text-black border-b-2 inline-block px-8 uppercase" 
              style={{ 
                fontSize: `${14 * fontSizeMultiplier}px`,
                borderBottomColor: appearance.primaryColor,
                borderBottomWidth: '2px'
              }}>
              {prescription.patientType === 'Woman' ? 'Mme / Mlle' : prescription.patientType === 'Child' ? 'Enfant' : 'Mr'} {prescription.patientId}
              {prescription.patientAge ? <span className="ml-2">({prescription.patientAge} ans)</span> : ''}
              {prescription.patientWeight ? <span className="ml-2">({prescription.patientWeight} kg)</span> : ''}
            </p>
          </div>
        </div>

        {/* Items Section */}
        <div className="flex-1 px-4 mt-2 overflow-hidden">
          <div className="space-y-5">
            {prescription.items.map((item, i) => (
              <div key={item.id} className="flex gap-3 items-start">
                <span className="font-black text-black shrink-0 mt-0.5" style={{ fontSize: `${14 * fontSizeMultiplier}px`, color: appearance.primaryColor }}>
                  {i + 1}/
                </span>
                <div className="flex-1">
                  <p className="font-black text-black mb-0.5 leading-none uppercase tracking-tight" style={{ fontSize: `${14 * fontSizeMultiplier}px` }}>
                    {item.medicineName}
                  </p>
                  <p className="text-black font-bold pl-2 italic leading-tight" style={{ fontSize: `${12 * fontSizeMultiplier}px` }}>
                    {item.dosage}
                  </p>
                  {item.timing !== 'Indifférent' && (
                    <span className="font-black text-black bg-gray-50 border px-1.5 py-0.5 rounded-sm w-fit mt-1 uppercase" 
                      style={{ 
                        fontSize: `${9 * fontSizeMultiplier}px`,
                        borderColor: appearance.primaryColor,
                        borderWidth: '1px'
                      }}>
                      {item.timing}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section with Stamps */}
        <div className="mt-auto flex justify-between items-end">
          <div className="w-24 h-24 flex items-center justify-center">
            {/* Space for QR if bottom-left */}
          </div>
          <div className="w-40 h-24 border-2 border-dashed rounded-2xl flex items-center justify-center text-gray-200 font-bold uppercase text-center px-4" 
            style={{ 
              borderColor: appearance.primaryColor,
              fontSize: `${9 * fontSizeMultiplier}px`
            }}>
            Signature & Cachet
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-0 left-0 right-0 p-3 text-white font-arabic text-center flex flex-col justify-center gap-0.5 z-20" style={{ backgroundColor: appearance.primaryColor }}>
        <div className="font-bold" style={{ fontSize: `${10 * fontSizeMultiplier}px` }}>{doctor.addressAr}</div>
        <div className="font-medium opacity-90 uppercase tracking-tighter font-sans" style={{ fontSize: `${8 * fontSizeMultiplier}px` }}>{doctor.addressFr}</div>
        <div className="font-black mt-0.5 flex justify-center gap-6 font-sans" style={{ fontSize: `${10 * fontSizeMultiplier}px` }}>
          <span>Tél. : {doctor.phone}</span>
          <span className="opacity-40">|</span>
          <span className="lowercase font-bold">Email : {doctor.email}</span>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionView;
