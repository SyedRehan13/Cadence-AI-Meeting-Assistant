import React from 'react'
import Dropdown from './Dropdown.jsx'

export default function EmployeePicker({ id, employees, value, onChange, disabled }) {
  return (
    <Dropdown id={id} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} searchable menuLabel="Available people" emptyMessage="No matching employees">
      <option value="" hidden>{employees.length ? 'Choose a team member' : 'No more employees to add'}</option>
      {employees.map(employee => (
        <option key={employee.id} value={employee.id} data-description={employee.email || 'Team member'} data-avatar={(employee.name || 'Team member').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}>
          {employee.name}
        </option>
      ))}
    </Dropdown>
  )
}
