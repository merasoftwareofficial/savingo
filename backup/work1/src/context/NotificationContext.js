import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  // Notification कंपोनेंट्स को show और hide करने का फंक्शन
  const showNotification = useCallback((type, message, duration = 5000) => {
    const id = Date.now();
    
    setNotifications(prev => [...prev, { id, type, message }]);
    
    // Auto hide after duration
    setTimeout(() => {
      setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, duration);
    
    return id;
  }, []);
  
  // नोटिफिकेशन मैन्युअल हाइड करने का फंक्शन
  const hideNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification }}>
      {children}
      <NotificationContainer notifications={notifications} onHide={hideNotification} />
    </NotificationContext.Provider>
  );
};

// नोटिफिकेशन्स के लिए कंटेनर कंपोनेंट
const NotificationContainer = ({ notifications, onHide }) => {
  if (notifications.length === 0) return null;
  
  return (
    <div className="fixed top-4 right-4 z-50 space-y-4 w-72">
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          id={notification.id}
          type={notification.type}
          message={notification.message}
          onHide={onHide}
        />
      ))}
    </div>
  );
};

// नोटिफिकेशन कंपोनेंट जो विभिन्न प्रकार के अलर्ट्स को हैंडल करेगा
const Notification = ({ id, type, message, onHide }) => {
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-100 border-green-500 text-green-800';
      case 'error':
        return 'bg-red-100 border-red-500 text-red-800';
      case 'warning':
        return 'bg-yellow-100 border-yellow-500 text-yellow-800';
      case 'info':
      default:
        return 'bg-blue-100 border-blue-500 text-blue-800';
    }
  };

  return (
    <div 
      className={`rounded-md p-4 border-l-4 shadow-md ${getTypeStyles()} animate-slideIn`}
      role="alert"
    >
      <div className="flex justify-between items-start">
        <div className="text-sm font-medium">{message}</div>
        <button 
          className="ml-4 text-gray-400 hover:text-gray-600" 
          onClick={() => onHide(id)}
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};