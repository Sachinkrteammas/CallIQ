import React, { createContext, useContext, useState } from 'react'

const FilterContext = createContext(null)

const DEFAULT_FILTERS = {
  project: '', queue: '', team: '', agent: '', date_range: '',
  language: '', call_type: '', disposition: '', severity: '', risk_level: '',
}

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const updateFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const resetFilters = () => setFilters(DEFAULT_FILTERS)
  return (
    <FilterContext.Provider value={{ filters, setFilters, updateFilter, resetFilters }}>
      {children}
    </FilterContext.Provider>
  )
}

export const useFilters = () => useContext(FilterContext)
