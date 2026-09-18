import { createContext, useContext, useState, useRef, useCallback } from 'react';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ msg: '', type: '', shown: false });
  const timer = useRef();

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type, shown: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(t => ({ ...t, shown: false })), 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div id="toast" className={toast.shown ? `show ${toast.type}` : ''}>{toast.msg}</div>
    </ToastContext.Provider>
  );
}
