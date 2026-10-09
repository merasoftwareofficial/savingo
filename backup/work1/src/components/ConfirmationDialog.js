import React from 'react';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';

const ConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning' // 'warning' or 'success'
}) => {
  if (!isOpen) return null;
  
  const iconColor = type === 'warning' ? 'text-yellow-500' : 'text-green-500';
  const Icon = type === 'warning' ? FiAlertTriangle : FiCheckCircle;
  const confirmBtnColor = type === 'warning' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700';
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
        
        {/* Center dialog */}
        <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl">
          <div className="flex items-center">
            <div className={`flex-shrink-0 p-2 rounded-full ${iconColor} bg-opacity-10`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <h3 className="ml-3 text-lg font-medium leading-6 text-gray-900">{title}</h3>
          </div>
          
          <div className="mt-3">
            <p className="text-sm text-gray-500">{message}</p>
          </div>
          
          <div className="mt-5 flex justify-end space-x-3">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              onClick={onClose}
            >
              {cancelText}
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium text-white ${confirmBtnColor} border border-transparent rounded-md`}
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;