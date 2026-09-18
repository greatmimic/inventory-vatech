import { forwardRef } from 'react';

const QtyField = forwardRef(function QtyField({ label, value, onChange, onEnter, min = 1 }, ref) {
  const step = (delta) => onChange(String(Math.max(min, (parseInt(value) || 0) + delta)));

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="admin-qty-wrap">
        <button className="qty-btn" type="button" onClick={() => step(-1)}>−</button>
        <input ref={ref} className="form-input admin-qty-input" type="number" min={min} placeholder="0"
          value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }} />
        <button className="qty-btn" type="button" onClick={() => step(1)}>+</button>
      </div>
    </div>
  );
});

export default QtyField;
