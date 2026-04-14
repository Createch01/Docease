import React, { useState, useEffect } from 'react';
import {
    Search, Filter, Plus, FileJson, FileText, BookOpen,
    Trash2, ExternalLink, Download, Clock, Info, X,
    FileSearch, ChevronRight, Tags, ArrowUpRight
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { MedicalResource, ResourceType } from '../types';

const MedicalDirectory: React.FC = () => {
    const [resources, setResources] = useState<MedicalResource[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<ResourceType | 'All'>('All');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newResource, setNewResource] = useState<Partial<MedicalResource>>({
        title: '',
        type: 'Manuel',
        description: '',
        content: ''
    });

    useEffect(() => {
        loadResources();
        const unsubscribe = window.addEventListener('meddoc_data_update', (e: any) => {
            if (e.detail.key === 'meddoc_medical_resources') loadResources();
        });
        return () => window.removeEventListener('meddoc_data_update', (e: any) => { });
    }, []);

    const loadResources = () => {
        setResources(dataService.getMedicalResources());
    };

    const handleAddResource = () => {
        if (!newResource.title || !newResource.type) {
            alert('Titre et Type sont obligatoires');
            return;
        }
        const resource: MedicalResource = {
            id: Date.now().toString(),
            title: newResource.title,
            type: newResource.type as ResourceType,
            description: newResource.description,
            content: newResource.content,
            createdAt: new Date().toISOString()
        };
        dataService.saveMedicalResource(resource);
        setShowAddModal(false);
        setNewResource({ title: '', type: 'Manuel', description: '', content: '' });
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Supprimer cette ressource ?')) {
            dataService.deleteMedicalResource(id);
        }
    };

    const filteredResources = resources.filter(res => {
        const matchesSearch = res.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (res.description?.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesFilter = activeFilter === 'All' || res.type === activeFilter;
        return matchesSearch && matchesFilter;
    });

    const getIcon = (type: ResourceType) => {
        switch (type) {
            case 'JSON': return <FileJson className="text-amber-500" />;
            case 'PDF': return <FileText className="text-rose-500" />;
            case 'Word': return <FileText className="text-blue-500" />;
            case 'Manuel': return <BookOpen className="text-emerald-500" />;
            default: return <Info className="text-gray-400" />;
        }
    };

    return (
        <div className="space-y-8 animate-in mt-10 fade-in duration-500">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-4">
                        <div className="bg-emerald-600 text-white p-3 rounded-3xl shadow-lg shadow-emerald-200">
                            <BookOpen size={32} />
                        </div>
                        Répertoire Médical Pro
                    </h2>
                    <p className="text-gray-500 mt-2 font-medium">Gestion intelligente de votre documentation et protocoles</p>
                </div>

                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-[2rem] font-black shadow-xl shadow-emerald-200 transition-all active:scale-95 flex items-center gap-3 uppercase text-xs tracking-widest"
                >
                    <Plus size={20} /> Ajouter une Ressource
                </button>
            </div>

            {/* Search & Filters */}
            <div className="bg-white p-2 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Rechercher par titre, mot-clé ou protocole..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-16 pr-8 py-5 bg-transparent border-none outline-none font-bold text-gray-700 text-lg placeholder:text-gray-300"
                    />
                </div>

                <div className="flex items-center gap-2 p-2">
                    {(['All', 'JSON', 'PDF', 'Word', 'Manuel'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${activeFilter === f
                                    ? 'bg-gray-900 text-white shadow-lg'
                                    : 'text-gray-400 hover:bg-gray-50'
                                }`}
                        >
                            {f === 'All' ? 'Tout' : f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Empty State */}
            {filteredResources.length === 0 && (
                <div className="bg-white border-2 border-dashed border-gray-100 rounded-[3rem] p-20 text-center space-y-4">
                    <div className="bg-gray-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto text-gray-300">
                        <FileSearch size={48} />
                    </div>
                    <h3 className="text-xl font-black text-gray-400">Aucune ressource trouvée</h3>
                    <p className="text-gray-300">Essayez de modifier votre recherche ou d'ajouter une nouvelle ressource.</p>
                </div>
            )}

            {/* Resources Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredResources.map((res) => (
                    <div
                        key={res.id}
                        className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-emerald-900/5 transition-all duration-500 relative overflow-hidden"
                    >
                        <div className="flex items-start justify-between relative z-10">
                            <div className="bg-gray-50 p-4 rounded-2xl group-hover:scale-110 transition-transform duration-500">
                                {getIcon(res.type)}
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleDelete(res.id)}
                                    className="p-2 text-gray-300 hover:text-rose-500 transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3 relative z-10">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-tight group-hover:text-emerald-600 transition-colors">
                                {res.title}
                            </h3>
                            <p className="text-gray-500 text-sm font-bold line-clamp-3 leading-relaxed">
                                {res.description || 'Pas de description supplémentaire pour cette ressource.'}
                            </p>
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <Clock size={12} />
                                {new Date(res.createdAt).toLocaleDateString()}
                            </div>
                            <button className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:translate-x-1 transition-transform">
                                Ouvrir <ArrowUpRight size={12} />
                            </button>
                        </div>

                        {/* Background Decoration */}
                        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-2xl"></div>
                    </div>
                ))}
            </div>

            {/* Add Resource Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-hidden">
                        <button
                            onClick={() => setShowAddModal(false)}
                            className="absolute right-8 top-8 p-3 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
                        >
                            <X size={24} />
                        </button>

                        <h3 className="text-3xl font-black text-gray-900 mb-8 flex items-center gap-3 uppercase tracking-tight">
                            Nouvelle Ressource
                        </h3>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Titre de la ressource</label>
                                    <input
                                        type="text"
                                        value={newResource.title}
                                        onChange={e => setNewResource({ ...newResource, title: e.target.value })}
                                        placeholder="Ex: Protocole HTA 2026"
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 ring-emerald-100 font-bold transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Type de document</label>
                                    <select
                                        value={newResource.type}
                                        onChange={e => setNewResource({ ...newResource, type: e.target.value as ResourceType })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 ring-emerald-100 font-bold appearance-none cursor-pointer"
                                    >
                                        <option value="Manuel">Manuel (Texte)</option>
                                        <option value="JSON">Saisie JSON</option>
                                        <option value="PDF">Fichier PDF</option>
                                        <option value="Word">Fichier Word</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description courte</label>
                                <textarea
                                    value={newResource.description}
                                    onChange={e => setNewResource({ ...newResource, description: e.target.value })}
                                    placeholder="Résumé du contenu..."
                                    rows={2}
                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 ring-emerald-100 font-bold resize-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contenu ou Chemin local</label>
                                <textarea
                                    value={newResource.content}
                                    onChange={e => setNewResource({ ...newResource, content: e.target.value })}
                                    placeholder="Collez ici le texte, le JSON ou le chemin vers le fichier (C:\Documents\...)"
                                    rows={4}
                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 ring-emerald-100 font-mono text-sm transition-all"
                                />
                            </div>

                            <button
                                onClick={handleAddResource}
                                className="w-full py-5 bg-emerald-600 text-white font-black rounded-3xl hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all active:scale-[0.98] uppercase text-xs tracking-[0.2em]"
                            >
                                Enregistrer la ressource
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MedicalDirectory;
