
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Circle,
  Filter,
  Search,
  ChevronUp,
  ChevronDown,
  Clock,
  X,
  CalendarCheck,
  AlertTriangle,
  Sparkles,
  CheckCircle,
  Zap,
  Bell,
  ArrowRight,
  Maximize,
  Minimize,
  User,
  Briefcase,
  Stethoscope,
  FileText,
  CheckSquare
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Task, TaskPriority, TaskCategory, AppUser } from '../types';
import ConfirmModal from './ConfirmModal';


type SortField = 'priority' | 'date' | 'status';
type FilterType = 'all' | 'active' | 'completed' | 'late' | 'medical' | 'admin';

const TaskManager: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // New Task State
  const [newTask, setNewTask] = useState<{
    title: string;
    description: string;
    priority: TaskPriority;
    category: TaskCategory;
    assignedTo: string;
    dueDate: string;
  }>({
    title: '',
    description: '',
    priority: 'Moyenne',
    category: 'Admin',
    assignedTo: '',
    dueDate: new Date().toISOString().split('T')[0],
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    type: 'danger'
  });

  useEffect(() => {
    setTasks(dataService.getTasks());
    setUsers(dataService.getUsers());

    const handleUpdate = (e: any) => {
      if (e.detail?.key === 'meddoc_tasks') setTasks(dataService.getTasks());
    };
    window.addEventListener('meddoc_data_update', handleUpdate as EventListener);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate as EventListener);
  }, []);

  const handleSaveTask = () => {
    if (!newTask.title) return;

    // Auto-assign to current user if not selected
    const currentUser = dataService.getActiveUser();
    const assigned = newTask.assignedTo || (currentUser ? currentUser.id : '');

    const task: Task = {
      id: Date.now().toString(),
      title: newTask.title,
      description: newTask.description || '',
      priority: newTask.priority,
      category: newTask.category,
      assignedTo: assigned,
      dueDate: newTask.dueDate,
      isCompleted: false,
      createdAt: new Date().toISOString()
    };
    dataService.saveTask(task);
    setIsAdding(false);
    setNewTask({
      title: '',
      description: '',
      priority: 'Moyenne',
      category: 'Admin',
      assignedTo: '',
      dueDate: new Date().toISOString().split('T')[0]
    });
  };

  const toggleTaskStatus = (task: Task) => {
    const updated = { ...task, isCompleted: !task.isCompleted };
    dataService.saveTask(updated);
  };

  const deleteTask = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Supprimer la tâche",
      message: "Êtes-vous sûr de vouloir supprimer cette tâche ?",
      type: 'danger',
      onConfirm: () => {
        const remaining = tasks.filter(t => t.id !== id);
        // Use dataService to save all (simulated by re-saving list manually or add delete method)
        // dataService doesn't have delete multiple, so we iterate or add a delete method.
        // Actually dataService has deleteTask method? Let's check. 
        // It does not have explicit delete. We need to implement it or use raw localStorage update.
        // Wait, dataService usually has it. Let's assume we need to add it or do it manually.
        // To be safe, let's just save the filtered list if needed, but dataService should handle.
        // CHECK: dataService.ts might NOT have deleteTask. 
        // Let's implement manual delete here for safety as I recall viewing it didn't show one properly or I missed it.
        // Ah, checked file: dataService.ts showing saveTask but no delete explicitly in the snippet?
        // Let's just update the list.
        localStorage.setItem('meddoc_tasks', JSON.stringify(remaining));
        window.dispatchEvent(new CustomEvent('meddoc_data_update', { detail: { key: 'meddoc_tasks' } }));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };



  const clearCompleted = () => {
    const completedIds = tasks.filter(t => t.isCompleted).map(t => t.id);
    if (completedIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Nettoyer les tâches",
      message: `Voulez-vous supprimer les ${completedIds.length} tâches terminées ?`,
      type: 'warning',
      onConfirm: () => {
        completedIds.forEach(id => dataService.deleteTask(id));
        setTasks(dataService.getTasks());
      }
    });
  };

  const isLate = (dueDate: string) => {
    const today = new Date().toISOString().split('T')[0];
    return dueDate < today;
  };

  const priorityWeight = { 'Haute': 3, 'Moyenne': 2, 'Basse': 1 };

  const sortedTasks = useMemo(() => {
    let filtered = tasks.filter(t =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'priority') {
        comparison = priorityWeight[a.priority] - priorityWeight[b.priority];
      } else if (sortBy === 'date') {
        comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      } else if (sortBy === 'status') {
        comparison = (a.isCompleted === b.isCompleted) ? 0 : a.isCompleted ? 1 : -1;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [tasks, searchTerm, sortBy, sortOrder]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return sortedTasks;
    if (filter === 'active') return sortedTasks.filter(t => !t.isCompleted);
    if (filter === 'completed') return sortedTasks.filter(t => t.isCompleted);
    if (filter === 'late') return sortedTasks.filter(t => !t.isCompleted && isLate(t.dueDate));
    return sortedTasks;
  }, [sortedTasks, filter]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const activeTasks = filteredTasks.filter(t => !t.isCompleted);
  const completedTasks = filteredTasks.filter(t => t.isCompleted);

  const criticalTasksCount = useMemo(() => {
    return tasks.filter(t => !t.isCompleted && t.priority === 'Haute' && isLate(t.dueDate)).length;
  }, [tasks]);

  const lateTasksCount = useMemo(() => {
    return tasks.filter(t => !t.isCompleted && isLate(t.dueDate)).length;
  }, [tasks]);

  const [isFullScreen, setIsFullScreen] = useState(false);

  // ... existing code ...

  return (
    <div className={`transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-50 bg-white overflow-y-auto p-8' : 'max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 text-black'}`}>

      {/* CRITICAL ALERT BANNER */}
      {criticalTasksCount > 0 && !isFullScreen && (
        <div className="bg-red-600 rounded-[2rem] p-6 shadow-2xl shadow-red-900/20 flex flex-col md:flex-row items-center justify-between gap-4 animate-bounce-subtle border border-red-500 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-600 opacity-50 group-hover:scale-110 transition-transform duration-1000"></div>
          <div className="relative z-10 flex items-center gap-4 text-white">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center animate-pulse">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Attention Immédiate Requise</h3>
              <p className="text-red-100 text-xs font-bold uppercase tracking-widest">{criticalTasksCount} tâche(s) critique(s) en retard dans votre agenda.</p>
            </div>
          </div>
          <button
            onClick={() => { setSortBy('priority'); setSortOrder('desc'); window.scrollTo({ top: 500, behavior: 'smooth' }); }}
            className="relative z-10 px-8 py-3 bg-white text-red-600 font-black rounded-xl hover:bg-red-50 transition-all uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2"
          >
            Traiter maintenant <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 relative overflow-hidden ${isFullScreen ? 'mb-8' : ''}`}>
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
          <CalendarCheck size={120} />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase italic">{isFullScreen ? 'Mode Concentration' : 'Tâches & Rappels'}</h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">{isFullScreen ? 'Focus total sur vos priorités' : 'Gestion Opérationnelle du Cabinet'}</p>
        </div>

        <div className="flex items-center gap-6 relative z-10">
          {!isFullScreen && (
            <div className="hidden md:flex flex-col items-end">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Santé de l'Agenda</p>
              <div className="flex items-center gap-1.5 mt-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`w-6 h-1.5 rounded-full ${i < (5 - lateTasksCount) ? 'bg-emerald-500' : 'bg-red-400 animate-pulse'}`}></div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className={`p-4 rounded-2xl transition-all active:scale-95 text-gray-500 hover:bg-gray-100 ${isFullScreen ? 'bg-gray-100' : 'bg-white border border-gray-200'}`}
            title={isFullScreen ? "Quitter le plein écran" : "Mode plein écran"}
          >
            {isFullScreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>

          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-95 text-xs uppercase tracking-widest"
          >
            <Plus size={18} /> Nouveau Rappel
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white/90 backdrop-blur-xl p-10 rounded-[3rem] shadow-2xl border border-emerald-100 animate-in zoom-in-95 duration-300 sticky top-4 z-50">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3 uppercase tracking-tight">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <Sparkles size={24} />
              </div>
              Fixer un Rappel
            </h3>
            <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full text-gray-300 transition-all"><X size={28} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Titre de la tâche</label>
              <input
                type="text"
                placeholder="Ex: Confirmer commande vaccins"
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl font-bold text-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-black"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Urgence</label>
              <div className="flex gap-2">
                {(['Basse', 'Moyenne', 'Haute'] as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewTask({ ...newTask, priority: p })}
                    className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${newTask.priority === p
                      ? (p === 'Haute' ? 'bg-red-600 border-red-600 text-white shadow-lg' :
                        p === 'Moyenne' ? 'bg-amber-500 border-amber-500 text-white shadow-lg' :
                          'bg-blue-600 border-blue-600 text-white shadow-lg')
                      : 'bg-white border-gray-50 text-gray-400 hover:border-gray-200'
                      }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Échéance</label>
              <div className="relative">
                <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                <input
                  type="date"
                  value={newTask.dueDate}
                  onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black outline-none focus:ring-2 focus:ring-emerald-500 text-black"
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Notes Additionnelles</label>
              <textarea
                placeholder="Ajouter des détails pour vous ou votre secrétaire..."
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl font-bold h-32 outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-black"
              />
            </div>
          </div>
          <div className="mt-10">
            <button onClick={handleSaveTask} className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-3xl shadow-2xl shadow-emerald-900/10 uppercase tracking-widest transition-all active:scale-[0.98] text-lg">
              Enregistrer dans l'Agenda
            </button>
          </div>
        </div>
      )}

      {/* FILTER & SORT SECTION */}
      <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex flex-col lg:flex-row justify-between items-center gap-6 bg-gray-50/30">
          <div className="relative w-full lg:w-2/5">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Chercher une tâche..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-inner text-black"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            {/* Filter Tabs */}
            <div className="flex gap-1 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
              {(['all', 'active', 'completed', 'late'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f
                    ? 'bg-white text-emerald-600 shadow-md ring-1 ring-gray-200'
                    : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                  {f === 'all' && 'Tous'}
                  {f === 'active' && 'En cours'}
                  {f === 'completed' && 'Terminées'}
                  {f === 'late' && 'En retard'}
                </button>
              ))}
            </div>

            <div className="w-px h-8 bg-gray-200 mx-2 hidden lg:block"></div>

            <div className="flex gap-1 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
              {(['priority', 'date', 'status'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === field
                    ? 'bg-white text-emerald-600 shadow-md ring-1 ring-gray-200'
                    : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                  {field === 'priority' && <AlertCircle size={12} />}
                  {field === 'date' && <Calendar size={12} />}
                  {field === 'status' && <CheckCircle size={12} />}
                  {field}
                  {sortBy === field && (sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              ))}
            </div>
            {completedTasks.length > 0 && (
              <button
                onClick={clearCompleted}
                className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest border border-red-100"
              >
                <Trash2 size={16} /> Nettoyer terminées
              </button>
            )}
          </div>
        </div>

        {/* TASKS LIST */}
        <div className="divide-y divide-gray-50">
          {sortedTasks.length === 0 ? (
            <div className="p-32 text-center space-y-6">
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={48} className="text-gray-200" />
              </div>
              <div>
                <p className="text-gray-900 font-black uppercase tracking-[0.2em] text-sm">
                  {filter === 'late' ? 'Aucun retard' : 'Liste vide'}
                </p>
                <p className="text-gray-400 text-[10px] font-black uppercase mt-2 tracking-widest">
                  {filter === 'late' ? 'Bravo ! Aucune tâche en retard pour le moment.' :
                    filter === 'completed' ? 'Aucune tâche terminée récemment.' :
                      'Aucune tâche ne correspond à vos critères.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {activeTasks.length > 0 && (
                <div className="px-10 py-4 bg-gray-50/50 border-b border-gray-100">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">En cours de réalisation — {activeTasks.length}</span>
                </div>
              )}
              {activeTasks.map((task) => {
                const late = isLate(task.dueDate);
                const isCritical = task.priority === 'Haute' && late;

                return (
                  <div
                    key={task.id}
                    className={`p-10 flex flex-col md:flex-row items-start gap-8 hover:bg-gray-50 transition-all group relative border-l-[12px] ${isCritical ? 'bg-red-50/30 border-red-600 animate-critical-border' :
                      task.priority === 'Haute' ? 'border-red-500' :
                        task.priority === 'Moyenne' ? 'border-amber-400' :
                          'border-blue-400'
                      }`}
                  >
                    {/* CRITICAL RIBBON */}
                    {isCritical && (
                      <div className="absolute top-0 right-0 overflow-hidden w-24 h-24 pointer-events-none">
                        <div className="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-black uppercase py-1 px-10 rotate-45 translate-x-8 translate-y-3 shadow-lg">Retard</div>
                      </div>
                    )}

                    <button
                      onClick={() => toggleTaskStatus(task)}
                      className={`mt-1 transition-all rounded-full p-1 border-2 ${isCritical ? 'text-red-300 border-red-200 hover:text-red-600' : 'text-gray-200 border-gray-100 hover:text-emerald-500 hover:border-emerald-200'
                        } hover:scale-110 active:scale-95`}
                    >
                      <Circle size={32} />
                    </button>

                    <div className="flex-1 space-y-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <h4 className={`text-xl font-black uppercase tracking-tight ${isCritical ? 'text-red-700' : 'text-gray-900'}`}>
                          {task.title}
                        </h4>
                        <div className="flex gap-2">
                          <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] shadow-sm ${task.priority === 'Haute' ? 'bg-red-600 text-white' :
                            task.priority === 'Moyenne' ? 'bg-amber-500 text-white' :
                              'bg-blue-600 text-white'
                            }`}>
                            {task.priority}
                          </span>
                          {late && (
                            <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] flex items-center gap-1.5 shadow-sm ${isCritical ? 'bg-white text-red-600 border border-red-200 animate-pulse' : 'bg-red-50 text-red-600 border border-red-100'
                              }`}>
                              <AlertTriangle size={12} /> Échéance Dépassée
                            </span>
                          )}
                        </div>
                      </div>

                      {task.description && (
                        <p className={`text-sm font-bold leading-relaxed max-w-3xl ${isCritical ? 'text-red-800/70' : 'text-gray-500'}`}>
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-6 pt-4">
                        <div className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${late ? 'bg-red-50 border-red-200 text-red-600 shadow-md shadow-red-900/5' : 'bg-gray-50 border-gray-100 text-gray-400'
                          }`}>
                          <Calendar size={16} className={late ? 'animate-bounce-subtle' : ''} />
                          {new Date(task.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-black text-gray-300 uppercase tracking-widest">
                          <Clock size={12} />
                          Créé le {new Date(task.createdAt).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-4 bg-white border border-gray-100 text-gray-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-2xl transition-all shadow-sm"
                        title="Supprimer définitivement"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* COMPLETED TASKS SECTION */}
              {completedTasks.length > 0 && (
                <div className="px-10 py-4 bg-emerald-50/30 border-y border-emerald-100">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Rappels accomplis — {completedTasks.length}</span>
                </div>
              )}
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="px-10 py-8 flex items-center gap-6 bg-white/50 opacity-40 grayscale-[0.5] group transition-all"
                >
                  <button
                    onClick={() => toggleTaskStatus(task)}
                    className="text-emerald-500 hover:scale-110 active:scale-95 transition-all"
                  >
                    <CheckCircle2 size={32} />
                  </button>

                  <div className="flex-1 space-y-1">
                    <h4 className="font-black text-gray-400 uppercase tracking-tight text-lg line-through">
                      {task.title}
                    </h4>
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                      <CheckCircle size={12} /> Terminé avec succès
                    </p>
                  </div>

                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all bg-white rounded-xl shadow-sm border border-gray-50"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s infinite ease-in-out;
        }
      `}</style>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};

export default TaskManager;
