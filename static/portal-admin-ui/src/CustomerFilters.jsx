import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import { Disclosure } from '@nuvriqo/ui/react';

// Used until the creator saves their own choice, so existing reports keep
// offering the standard date fields.
const DEFAULT_DATE_FIELDS = [
  { id: 'created', label: 'Created' },
  { id: 'updated', label: 'Updated' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'due', label: 'Due date' }
];

export default function CustomerFilters({ value, onChange, disabled }) {
  const [fields, setFields] = useState({ dateFields: [], choiceFields: [] });
  const [valuesByField, setValuesByField] = useState({});
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState([]);

  const filters = value || { dateFields: DEFAULT_DATE_FIELDS, choices: [] };
  const usingDefaults = !value;
  const update = next => onChange({ dateFields: filters.dateFields, choices: filters.choices, ...next });

  const loadValues = async fieldId => {
    if (valuesByField[fieldId]) return valuesByField[fieldId];
    setLoading(fieldId);
    try {
      const values = await invoke('portal-admin:field-values', { fieldId }) || [];
      setValuesByField(current => ({ ...current, [fieldId]: values }));
      return values;
    } catch (e) {
      setError(e?.message || 'Could not load the values for that field.');
      return [];
    } finally {
      setLoading('');
    }
  };

  useEffect(() => {
    invoke('portal-admin:filter-fields')
      .then(result => setFields(result || { dateFields: [], choiceFields: [] }))
      .catch(e => setError(e?.message || 'Could not load Jira fields.'));
  }, []);

  useEffect(() => { filters.choices.forEach(c => loadValues(c.id)); }, [filters.choices.map(c => c.id).join(',')]);

  const toggleDate = field => {
    const on = filters.dateFields.some(f => f.id === field.id);
    update({ dateFields: on ? filters.dateFields.filter(f => f.id !== field.id) : [...filters.dateFields, { id: field.id, label: field.name }] });
  };

  const addChoice = async fieldId => {
    const field = fields.choiceFields.find(f => f.id === fieldId);
    if (!field || filters.choices.some(c => c.id === fieldId)) return;
    setJustAdded(current => [...current, field.id]);
    update({ choices: [...filters.choices, { id: field.id, label: field.name, ...(field.match ? { match: field.match } : {}), values: [] }] });
    await loadValues(field.id);
  };

  // Request types keep their exact Jira name, and cascading children their
  // parent option, because the query is built from those.
  const savedValue = ({ id, label, name, parent }) => ({ id, label, ...(name ? { name } : {}), ...(parent ? { parent } : {}) });
  const setChoice = (fieldId, changes) => update({ choices: filters.choices.map(c => c.id === fieldId ? { ...c, ...changes } : c) });
  const removeChoice = fieldId => update({ choices: filters.choices.filter(c => c.id !== fieldId) });
  const toggleValue = (choice, option) => {
    const on = choice.values.some(v => v.id === option.id);
    setChoice(choice.id, { values: on ? choice.values.filter(v => v.id !== option.id) : [...choice.values, savedValue(option)] });
  };

  // Show saved date fields even if the field list hasn't loaded or a field was removed from Jira.
  const dateOptions = [...fields.dateFields];
  for (const f of filters.dateFields) if (!dateOptions.some(o => o.id === f.id)) dateOptions.push({ id: f.id, name: f.label });
  const available = fields.choiceFields.filter(f => !filters.choices.some(c => c.id === f.id));

  return <>
    <h2>Customer filters</h2>
    <p className="help">Choose what customers can filter on when they generate this report. Filtered copies are private to the customer and never replace the published copy.</p>
    {usingDefaults && <p className="help">This report offers the standard date fields. Change the selection to customise it.</p>}
    {error && <div className="notice">{error}</div>}

    <Disclosure title="Date fields" meta={`${filters.dateFields.length} selected`}>
      <div className="options">{dateOptions.map(f => <label key={f.id}>
        <input type="checkbox" disabled={disabled} checked={filters.dateFields.some(d => d.id === f.id)} onChange={() => toggleDate(f)}/>
        <span>{f.name}</span>
      </label>)}</div>
    </Disclosure>

    <h3>Choice fields</h3>
    <p className="help">Add a field, then tick the values customers can choose from. Values you leave unticked are never shown to customers.</p>
    {filters.choices.map(choice => {
      const options = valuesByField[choice.id] || choice.values;
      const offered = choice.values.length
        ? `${choice.values.length} value${choice.values.length === 1 ? '' : 's'} offered`
        : 'No values ticked yet';
      // A field added in this session opens so its values can be ticked straight away.
      return <Disclosure key={choice.id} title={choice.label} meta={offered} defaultOpen={justAdded.includes(choice.id)}>
        {!choice.values.length && <p className="help">Tick at least one value, or customers won't see this filter.</p>}
        <div className="actions filterActions">
          <button disabled={disabled || !options.length} onClick={() => setChoice(choice.id, { values: options.map(savedValue) })}>Select all</button>
          <button disabled={disabled || !choice.values.length} onClick={() => setChoice(choice.id, { values: [] })}>Clear</button>
          <button disabled={disabled} onClick={() => removeChoice(choice.id)}>Remove</button>
        </div>
        <div className="options">{loading === choice.id && !options.length ? <small>Loading values…</small> : options.map(option => <label key={option.id}>
          <input type="checkbox" disabled={disabled} checked={choice.values.some(v => v.id === option.id)} onChange={() => toggleValue(choice, option)}/>
          <span>{option.label}</span>
        </label>)}</div>
      </Disclosure>;
    })}
    {!!available.length && <label>Add a choice field<select disabled={disabled} value="" onChange={e => addChoice(e.target.value)}>
      <option value="">Choose a field…</option>
      {available.map(f => <option key={f.id} value={f.id}>{f.name}{f.custom ? '' : ' (standard)'}</option>)}
    </select></label>}
  </>;
}
