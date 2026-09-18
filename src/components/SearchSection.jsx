import { forwardRef } from 'react';

const SearchSection = forwardRef(function SearchSection({ value, onChange, onClear }, ref) {
  return (
    <div className="search-section">
      <span className="search-label">Search by SAP Code or Description</span>
      <div className="search-wrap">
        <input ref={ref} id="searchInput" type="text" placeholder="Type SAP code or part name..."
          autoComplete="off" autoCorrect="off" spellCheck="false" inputMode="search"
          value={value} onChange={e => onChange(e.target.value)} />
        <button className={`clear-btn${value ? ' visible' : ''}`} onClick={onClear}>×</button>
      </div>
    </div>
  );
});

export default SearchSection;
