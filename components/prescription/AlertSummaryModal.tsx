import React from 'react';
import { AlertTriangle, AlertCircle, Info, X, CheckCircle2 } from 'lucide-react';
import { SafetyNotification } from '../PrescriptionEditor';

interface AlertSummaryModalProps {
  alerts: SafetyNotification[];
  onReview: () => void;
  onConfirm: () => void;
}

const AlertSummaryModal: React.FC<AlertSummaryModalProps> = ({ alerts, onReview, onConfirm }) => {
  const criticalCount = alerts.filter(a => a.severity === 'CRITIQUE').length;
  const attentionCount = alerts.filter(a => a.severity === 'ATTENTION').length;
  const infoCount = alerts.filter(a => a.severity === 'INFO').length;

  if (alerts.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 size={28} className="text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">Ordonnance valide</h2>
          </div>
          <p className="text-gray-600 mb-6">Aucune alerte détectée. Vous pouvez valider l'ordonnance en toute confiance.</p>
          <button
            onClick={onConfirm}
            className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Valider l'ordonnance
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-gray-200 px-8 py-6 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Résumé des alertes</h2>
            <p className="text-gray-600">Vérifiez les alertes avant de valider l'ordonnance</p>
          </div>
          <button onClick={onReview} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="bg-gray-50 border-b border-gray-200 px-8 py-4 grid grid-cols-3 gap-4">
          {criticalCount > 0 && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={18} className="text-red-600" />
                <span className="font-bold text-red-700">CRITIQUE</span>
              </div>
              <div className="text-3xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-xs text-red-600">alerte(s)</div>
            </div>
          )}
          {attentionCount > 0 && (
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={18} className="text-orange-600" />
                <span className="font-bold text-orange-700">ATTENTION</span>
              </div>
              <div className="text-3xl font-bold text-orange-600">{attentionCount}</div>
              <div className="text-xs text-orange-600">alerte(s)</div>
            </div>
          )}
          {infoCount > 0 && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Info size={18} className="text-blue-600" />
                <span className="font-bold text-blue-700">INFO</span>
              </div>
              <div className="text-3xl font-bold text-blue-600">{infoCount}</div>
              <div className="text-xs text-blue-600">information(s)</div>
            </div>
          )}
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg border-l-4 p-4 ${
                alert.severity === 'CRITIQUE'
                  ? 'bg-red-50 border-red-500 text-red-900'
                  : alert.severity === 'ATTENTION'
                  ? 'bg-orange-50 border-orange-500 text-orange-900'
                  : 'bg-blue-50 border-blue-500 text-blue-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {alert.severity === 'CRITIQUE' && <AlertTriangle size={20} />}
                  {alert.severity === 'ATTENTION' && <AlertCircle size={20} />}
                  {alert.severity === 'INFO' && <Info size={20} />}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-lg mb-1">{alert.title}</div>
                  <div className="text-sm mb-2">{alert.message}</div>
                  {alert.itemId && (
                    <div className="text-xs opacity-75">Médicament ID: {alert.itemId}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-8 py-4 flex gap-3 justify-end">
          <button
            onClick={onReview}
            className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Retour
          </button>
          <button
            onClick={onConfirm}
            className={`px-6 py-2 font-medium rounded-lg text-white transition-colors ${
              criticalCount > 0
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {criticalCount > 0 ? 'Continuer malgré les alertes critiques' : 'Valider l\'ordonnance'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertSummaryModal;
