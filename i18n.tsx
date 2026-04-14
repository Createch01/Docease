import { useState, useEffect, createContext, useContext } from 'react';
import { settingsService } from './services/settingsService';

export type Language = 'fr' | 'ar';

export const translations = {
    fr: {
        // Nav
        dashboard: 'Tableau de Bord',
        patients: 'Patients',
        appointments: 'Rendez-vous',
        prescriptions: 'Ordonnances',
        analytics: 'Statistiques',
        settings: 'Paramètres',
        tasks: 'Tâches',
        smart_doc: 'SmartDoc',

        // Dashboard
        welcome: 'Bienvenue',
        todays_revenue: 'Recettes du jour',
        waiting_room: 'Salle d\'Attente',
        recent_activity: 'Activité Récente',
        new_consultation: 'Nouvelle Consultation',
        end_of_day: 'Fin de Journée',
        in_waiting: 'EN ATTENTE',
        open_dossier: 'Ouvrir Dossier',
        consultations: 'Consultations',
        today: 'Aujourd\'hui',
        queue_description: 'Patients en attente',
        no_patients: 'Tranquillité Totale',
        no_patients_desc: 'Tous vos patients ont été consultés. Bon travail !',
        work_done_desc: 'Les consultations validées apparaîtront ici en temps réel.',
        view_history: 'Voir Historique',

        // Patient Manager
        search_patient: 'Rechercher ou ajouter un patient...',
        add_patient: 'Nouveau Patient',
        name: 'Nom & Prénom',
        age: 'Âge',
        phone: 'Téléphone',
        weight: 'Poids',
        sex: 'Sexe',
        type: 'Type',
        allergies: 'Allergies',
        pathologies: 'Pathologies',
        save: 'Enregistrer',
        cancel: 'Annuler',
        male: 'Masculin',
        female: 'Féminin',
        adult: 'Adulte',
        child: 'Enfant',
        woman: 'Femme',
        waiting_room_desc: 'Gérez la file d\'attente du',
        patients_database: 'Base de données Patients',
        close: 'Fermer',
        edit_info: 'Modifier les informations',
        new_registration: 'Nouvel Enregistrement',
        patient_category: 'Catégorie du Patient',
        full_name: 'Nom Complet',
        phone_required: 'Numéro de Téléphone',
        age_required: 'Âge (Obligatoire)',
        weight_child: 'Poids (Enfant)',
        weight_optional: 'Poids (Optionnel)',
        suggestions: 'Suggestions',
        consultation_fee: 'Frais de Consultation',
        confirm_changes: 'Confirmer les modifications',
        validate_entry: 'Valider l\'entrée en Salle d\'Attente',
        todays_patients: 'Patients du Jour',
        empty_queue: 'La salle d\'attente est vide',
        consult: 'Consulter',

        // Prescription Editor
        patient_name: 'Nom du Patient',
        weight_placeholder: 'Ex: 75kg',
        allergies_placeholder: 'Pénicilline, etc...',
        antecedents_placeholder: 'Asthme, Diabète, etc...',
        pregnant: 'Enceinte',
        breastfeeding: 'Allaitement',
        heart_patient: 'Cardiaque',
        kidney_patient: 'Rénal',
        liver_patient: 'Hépatique',
        smart_mode: 'Smart Mode',
        smart_mode_desc: 'Collez ici l\'ordonnance complète (ex: Aclav 1g 1cp x 3/j, Doliprane 1g si fièvre...)',
        smart_parse_btn: 'Générer l\'ordonnance intelligente',
        parsing_in_progress: 'Analyse en cours...',
        search_med_placeholder: 'Chercher un médicament, une molécule...',
        manual_search: 'Ou recherche manuelle :',
        no_med_found: 'Aucun résultat trouvé',
        add_new_med: 'Ajouter comme nouveau médicament',
        dosage: 'Posologie',
        duration: 'Durée',
        frequency: 'Fréquence',
        restore: 'Rétablir',
        dosage_placeholder: 'Ex: 1-0-1 apres repas',
        save_prescription: 'Enregistrer l\'ordonnance',
        print_prescription: 'Imprimer / PDF',

        // Dossier
        overview: 'Résumé',
        consultation: 'Consultation',
        prescription: 'Ordonnance',
        analyses: 'Analyses',
        results: 'Résultats',
        vaccines: 'Vaccins',
        finance: 'Facture',
        certificates: 'Certificats',
        print: 'Imprimer',
        delete: 'Supprimer',
        edit: 'Modifier',

        // Settings
        profile: 'Mon Profil',
        cabinet: 'Cabinet Infos',
        layout: 'Mise en page',
        security: 'Sécurité PIN',
        users: 'Collaborateurs',
        database: 'Base de données',
        language: 'Langue',
        select_language: 'Choisir la langue d\'affichage',
        save_success: 'Paramètres enregistrés avec succès !',
        appearance_updated: 'Apparence mise à jour !',

        // Dossier Specific
        global_history: 'Historique Global',
        global_history_desc: 'Toutes les consultations du cabinet',
        search_dossier_placeholder: 'Nom ou prénom...',
        enrolled_since: 'Inscrit le',
        years_old: 'ans',
        print_full_dossier: 'Imprimer le dossier complet',
        new_prescription_btn: 'Nouvelle Ordonnance',
        no_prescriptions: 'Aucune ordonnance',
        preview_prescription: 'Aperçu de l\'ordonnance',
        confirm_delete_prescription: 'Voulez-vous vraiment supprimer cette ordonnance ?',
        certificates_count: 'Certificats Médicaux',
        new_certificate: 'Nouveau Certificat',
        confirm_delete_certificate: 'Voulez-vous vraiment supprimer ce certificat ?',
        preview_certificate: 'Aperçu Certificat Médical',
        preview_note: 'Aperçu Note d\'Honoraires',
        no_patient_found: 'Aucun patient trouvé',
        all: 'Tout',
        week: '7 Jours',
        indifferent: 'Indifférent',
        avant_repas: 'Avant repas',
        pendant_repas: 'Pendant repas',
        après_repas: 'Après repas',
        patient_id: 'ID',
        no_results_found: 'Aucun résultat trouvé',
        by_date: 'Par Date',
        a_z: 'Alphabétique',
        yesterday: 'Hier',

        // Dossier Overview
        latest_prescription: 'Dernière Ordonnance',
        view_all: 'Voir tout',
        latest_note: 'Dernière Note d\'Honoraires',
        total_debt: 'Dette Totale',
        latest_observations: 'Dernières Observations',
        bilan_results: 'Bilan & Résultats',
        pending_requests: 'Demandes en cours',
        to_do: 'À faire',
        no_biological_data: 'Aucune donnée biologique',
        open_prescription: 'Ouvrir l\'ordonnance',

        // Consultation Section
        medical_history: 'Historique Médical',
        ai_assistant: 'Assistant IA',
        new_consultation_btn: 'Nouvelle Consultation',
        motif_consultation: 'Motif de consultation',
        symptoms: 'Symptômes',
        clinical_exam: 'Examen Clinique',
        diagnostic: 'Diagnostic',
        therapeutic_plan: 'Plan thérapeutique',
        observations_exam: 'Observation & Examen',
        conclusion_diagnostic: 'Conclusion / Diagnostic',

        // AI Assistant Section
        real_time_analysis: 'Analyse temps réel de la consultation',
        fill_symptoms_instruction: "Remplissez les symptômes ou l'examen clinique puis lancez l'analyse.",
        analyze_now: 'Analyser maintenant',
        thinking_in_progress: 'Réflexion clinique en cours...',
        diagnostic_hypotheses: 'Hypothèses Diagnostiques',
        red_flags: 'Vigilance Requise',
        suggested_exams: 'Examens Suggérés',
        choose: 'Choisir',
        add: 'Ajouter',

        // Analyses Section
        lab_imaging: 'Laboratoire & Imagerie',
        total_requests: 'demandes au total',
        new_request: 'Nouvelle Demande',
        new_bio_exam: 'Nouvel Examen Biologique',
        for_patient: 'Pour',
        save_pdf: 'Sauvegarder PDF',
        save_print: 'Enregistrer & Imprimer',
        report_title: 'Titre du Bilan',
        preop_example: 'Ex: Bilan pré-opératoire...',
        search_analysis: 'Chercher une analyse...',
        real_time_preview: 'Aperçu en temps réel',
        received: 'Reçu',
        bilan_preview: 'Aperçu du Bilan',
        print_now: 'Imprimer Maintenant',

        // Lab Toasts
        lab_request_saved: "Demande d'analyses enregistrée.",
        patient_profile_not_found: "Profil patient introuvable.",
        generating_print: "Génération de l'impression...",
        generating_pdf: "Génération du PDF...",
        pdf_saved_success: "PDF enregistré avec succès !",
        pdf_generation_error: "Erreur lors de la génération du PDF.",
        preparing_pdf: "Préparation du PDF...",

        // Finances Section
        financial_view: 'Vue Financière',
        quick_invoice: 'Facture Rapide',
        honorary_note: "Note d'Honoraires",
        total_fees: 'Total Honoraires',
        collected_amount: 'Montant Encaissé',
        amount_to_receive: 'À percevoir',
        note_number: 'Note #',
        benefits: 'Prestations',
        paid: 'RÉGLÉ',
        unpaid: 'À PAYER',
        quick_invoice_generated: 'Facture rapide générée !',
        delete_honorary_note_confirm: 'Supprimer cette note d\'honoraires ?',
        no_invoices_found: "Aucune facture (Note d'honoraires) trouvée",

        // Results Section
        exam_results: "Résultats d'examens",
        add_result: "Ajouter un résultat",
        exam_type_title: "Type d'examen / Titre",
        interpretation_conclusion: "Interprétation / Conclusion",
        observations_placeholder: "Observations...",
        medical_conclusion: "Conclusion Médicale",
        analyze_with_ai: "Analyser avec IA",
        no_results_documented: "Aucun résultat documenté",

        // Vaccination Section
        vaccination_schedule: 'Calendrier Vaccinal',
        national_immunization_program: "Programme National d'Immunisation",
        birth: 'Naissance',
        month: 'mois',
        year: 'an',
        years: 'ans',
        done_on: 'Fait le',
        batch: 'Lot',
        mark_as_done: 'Marquer fait',
        delete_vaccination_confirm: 'Êtes-vous sûr de vouloir supprimer cette vaccination ?',
        batch_number_optional: 'N° Lot (Optionnel)',
        validate: 'VALIDER',

    },
    ar: {
        // Nav
        dashboard: 'لوحة القيادة',
        patients: 'المرضى',
        appointments: 'المواعيد',
        prescriptions: 'الوصفات الطبية',
        analytics: 'الإحصائيات',
        settings: 'الإعدادات',
        tasks: 'المهام',
        smart_doc: 'SmartDoc',

        // Dashboard
        welcome: 'مرحباً',
        todays_revenue: 'مداخيل اليوم',
        waiting_room: 'قاعة الانتظار',
        recent_activity: 'آخر الأنشطة',
        new_consultation: 'فحص جديد',
        end_of_day: 'نهاية اليوم',
        in_waiting: 'في الانتظار',
        open_dossier: 'فتح الملف',
        consultations: 'الفحوصات',
        today: 'اليوم',
        queue_description: 'المرضى في الانتظار',
        no_patients: 'هدوء تام',
        no_patients_desc: 'تم فحص جميع المرضى. عمل جيد!',
        work_done_desc: 'الفحوصات المكتملة ستظهر هنا في الوقت الفعلي.',
        view_history: 'عرض السجل',

        // Patient Manager
        search_patient: 'البحث عن مريض أو إضافته...',
        add_patient: 'مريض جديد',
        name: 'الاسم الكامل',
        age: 'السن',
        phone: 'الهاتف',
        weight: 'الوزن',
        sex: 'الجنس',
        type: 'فئة المريض',
        allergies: 'الحساسية',
        pathologies: 'الأمراض',
        save: 'حفظ',
        cancel: 'إلغاء',
        male: 'ذكر',
        female: 'أنثى',
        adult: 'بالغ',
        child: 'طفل',
        woman: 'امرأة',
        waiting_room_desc: 'إدارة قائمة الانتظار لـ',
        patients_database: 'قاعدة بيانات المرضى',
        close: 'إغلاق',
        edit_info: 'تعديل المعلومات',
        new_registration: 'تسجيل جديد',
        patient_category: 'فئة المريض',
        full_name: 'الاسم الكامل',
        phone_required: 'رقم الهاتف',
        age_required: 'السن (إلزامي)',
        weight_child: 'الوزن (طفل)',
        weight_optional: 'الوزن (اختياري)',
        suggestions: 'اقتراحات',
        consultation_fee: 'مصاريف الفحص',
        confirm_changes: 'تأكيد التعديلات',
        validate_entry: 'تأكيد الدخول لقاعة الانتظار',
        todays_patients: 'مرضى اليوم',
        empty_queue: 'قاعة الانتظار فارغة',
        consult: 'فحص',

        // Prescription Editor
        patient_name: 'اسم المريض',
        weight_placeholder: 'مثال: 75 كجم',
        allergies_placeholder: 'بنسلين، إلخ...',
        antecedents_placeholder: 'ربو، سكري، إلخ...',
        pregnant: 'حامل',
        breastfeeding: 'رضاعة',
        heart_patient: 'مرض القلب',
        kidney_patient: 'كلوي',
        liver_patient: 'كبدي',
        smart_mode: 'الوضع الذكي',
        smart_mode_desc: 'ألصق هنا الوصفة الكاملة (مثال: أكلاف 1ج 1ق × 3/يوم، دوليبران 1ج عند الحمى...)',
        smart_parse_btn: 'توليد وصفة ذكية',
        parsing_in_progress: 'جاري التحليل...',
        search_med_placeholder: 'ابحث عن دواء أو جزيئة...',
        manual_search: 'أو بحث يدوي:',
        no_med_found: 'لم يتم العثور على نتائج',
        add_new_med: 'إضافة كدواء جديد',
        dosage: 'الجرعة',
        duration: 'المدة',
        frequency: 'التكرار',
        restore: 'استعادة',
        dosage_placeholder: 'مثال: 1-0-1 بعد الأكل',
        save_prescription: 'حفظ الوصفة',
        print_prescription: 'طباعة / PDF',

        // Dossier
        overview: 'ملخص',
        consultation: 'فحص',
        prescription: 'وصفة طبية',
        analyses: 'تحاليل',
        results: 'نتائج',
        vaccines: 'تلقيحات',
        finance: 'فاتورة',
        certificates: 'شواهد',
        print: 'طباعة',
        delete: 'حذف',
        edit: 'تعديل',

        // Settings
        profile: 'ملفي الشخصي',
        cabinet: 'معلومات العيادة',
        layout: 'تخطيط الصفحة',
        security: 'أمن PIN',
        users: 'المستخدمون',
        database: 'قاعدة البيانات',
        language: 'الغة',
        select_language: 'اختر لغة العرض',
        save_success: 'تم حفظ الإعدادات بنجاح!',
        appearance_updated: 'تم تحديث المظهر!',

        // Dossier Specific
        global_history: 'السجل العام',
        global_history_desc: 'جميع فحوصات العيادة',
        search_dossier_placeholder: 'الاسم أو اللقب...',
        enrolled_since: 'مسجل منذ',
        years_old: 'سنة',
        print_full_dossier: 'طباعة الملف الكامل',
        new_prescription_btn: 'وصفة طبية جديدة',
        no_prescriptions: 'لا توجد وصفات',
        preview_prescription: 'معاينة الوصفة',
        confirm_delete_prescription: 'هل تريد حقًا حذف هذه الوصفة؟',
        certificates_count: 'الشهادات الطبية',
        new_certificate: 'شهادة جديدة',
        confirm_delete_certificate: 'هل تريد حقًا حذف هذه الشهادة؟',
        preview_certificate: 'معاينة الشهادة الطبية',
        preview_note: 'معاينة مذكرة الأتعاب',
        no_patient_found: 'لم يتم العثور على أي مريض',
        all: 'الكل',
        week: '7 أيام',
        indifferent: 'غير محدد',
        avant_repas: 'قبل الأكل',
        pendant_repas: 'أثناء الأكل',
        après_repas: 'بعد الأكل',
        patient_id: 'مـعرف',
        no_results_found: 'لم يتم العثور على نتائج',
        by_date: 'بالتاريخ',
        a_z: 'أبجدي',
        yesterday: 'أمس',

        // Dossier Overview
        latest_prescription: 'آخر وصفة طبية',
        view_all: 'عرض الكل',
        latest_note: 'آخر مذكرة أتعاب',
        total_debt: 'إجمالي الدين',
        latest_observations: 'آخر الملاحظات',
        bilan_results: 'التحاليل والنتائج',
        pending_requests: 'طلبات قيد التنفيذ',
        to_do: 'للقيام به',
        no_biological_data: 'لا توجد بيانات بيولوجية',
        open_prescription: 'فتح الوصفة',

        // Consultation Section
        medical_history: 'السجل الطبي',
        ai_assistant: 'مساعد الذكاء الاصطناعي',
        new_consultation_btn: 'فحص جديد',
        motif_consultation: 'سبب الفحص',
        symptoms: 'الأعراض',
        clinical_exam: 'الفحص السريري',
        diagnostic: 'التشخيص',
        therapeutic_plan: 'الخطة العلاجية',
        observations_exam: 'الملاحظة والفحص',
        conclusion_diagnostic: 'الاستنتاج / التشخيص',

        // AI Assistant Section
        real_time_analysis: 'تحليل فوري للاستشارة',
        fill_symptoms_instruction: 'املأ الأعراض أو الفحص السريري ثم ابدأ التحليل.',
        analyze_now: 'حلل الآن',
        thinking_in_progress: 'تفكير سريري جارٍ...',
        diagnostic_hypotheses: 'فرضيات التشخيص',
        red_flags: 'تنبيهات هامة',
        suggested_exams: 'الفحوصات المقترحة',
        choose: 'اختيار',
        add: 'إضافة',

        // Analyses Section
        lab_imaging: 'المختبر والتصوير',
        total_requests: 'إجمالي الطلبات',
        new_request: 'طلب جديد',
        new_bio_exam: 'فحص بيولوجي جديد',
        for_patient: 'لـ',
        save_pdf: 'حفظ PDF',
        save_print: 'حفظ وطباعة',
        report_title: 'عنوان التقرير',
        preop_example: 'مثال: فحص ما قبل الجراحة...',
        search_analysis: 'البحث عن تحليل...',
        real_time_preview: 'معاينة فورية',
        received: 'تم الاستلام',
        bilan_preview: 'معاينة التقرير',
        print_now: 'اطبع الآن',

        // Lab Toasts
        lab_request_saved: "تم حفظ طلب التحاليل.",
        patient_profile_not_found: "لم يتم العثور على ملف المريض.",
        generating_print: "جاري تحضير الطباعة...",
        generating_pdf: "جاري إنشاء PDF...",
        pdf_saved_success: "تم حفظ PDF بنجاح!",
        pdf_generation_error: "خطأ أثناء إنشاء PDF.",
        preparing_pdf: "جاري تحضير PDF...",

        // Finances Section
        financial_view: 'العرض المالي',
        quick_invoice: 'فاتورة سريعة',
        honorary_note: 'مذكرة أتعاب',
        total_fees: 'إجمالي الأتعاب',
        collected_amount: 'المبلغ المحصل',
        amount_to_receive: 'المبلغ المتبقي',
        note_number: 'مذكرة رقم',
        benefits: 'الخدمات',
        paid: 'تم الدفع',
        unpaid: 'غير مدفوع',
        quick_invoice_generated: 'تم إنشاء الفاتورة السريعة!',
        delete_honorary_note_confirm: 'هل تريد حذف مذكرة الأتعاب هذه؟',
        no_invoices_found: 'لم يتم العثور على فواتير (مذكرة أتعاب)',

        // Results Section
        exam_results: 'نتائج الفحوصات',
        add_result: 'إضافة نتيجة',
        exam_type_title: 'نوع الفحص / العنوان',
        interpretation_conclusion: 'التفسير / الخلاصة',
        observations_placeholder: 'ملاحظات...',
        medical_conclusion: 'الخلاصة الطبية',
        analyze_with_ai: 'تحليل بالذكاء الاصطناعي',
        no_results_documented: 'لا توجد نتائج موثقة',

        // Vaccination Section
        vaccination_schedule: 'جدول التطعيمات',
        national_immunization_program: 'البرنامج الوطني للتمنيع',
        birth: 'الولادة',
        month: 'شهر',
        year: 'سنة',
        years: 'سنوات',
        done_on: 'تم في',
        batch: 'الدفعة',
        mark_as_done: 'تحديد كمنجز',
        delete_vaccination_confirm: 'هل أنت متأكد من حذف هذا التطعيم؟',
        batch_number_optional: 'رقم الدفعة (اختياري)',
        validate: 'تأكيد',

    }
};

type ContextType = {
    t: (key: keyof typeof translations.fr) => string;
    lang: Language;
    setLang: (l: Language) => void;
    dir: 'ltr' | 'rtl';
};

const I18nContext = createContext<ContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<Language>(settingsService.getLanguage() as Language || 'fr');

    const changeLanguage = (l: Language) => {
        setLangState(l);
        settingsService.saveLanguage(l);
        window.dispatchEvent(new CustomEvent('meddoc_language_change', { detail: l }));
    };

    const t = (key: keyof typeof translations.fr) => {
        return translations[lang][key] || translations.fr[key] || key;
    };

    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    useEffect(() => {
        document.documentElement.dir = dir;
        document.documentElement.lang = lang;
    }, [lang, dir]);

    return (
        <I18nContext.Provider value={{ t, lang, changeLanguage, dir }}>
            <div dir={dir} className={lang === 'ar' ? 'font-arabic' : ''}>
                {children}
            </div>
        </I18nContext.Provider>
    );
};

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useI18n must be used within I18nProvider');
    return context;
};
