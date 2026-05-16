const DOCUMENT_SCHEMAS = {
  cgm: {
    title: 'CGM / Blood Glucose',
    properties: {
      Name: { title: {} },
      'Period Start': { date: {} },
      'Period End': { date: {} },
      Device: { rich_text: {} },
      'Avg Glucose (mmol/L)': { number: { format: 'number' } },
      'Time In Range (%)': { number: { format: 'number' } },
      'Time Above Range (%)': { number: { format: 'number' } },
      'Time Below Range (%)': { number: { format: 'number' } },
      Notes: { rich_text: {} }
    }
  },
  labs: {
    title: 'Blood Tests & Lab Results',
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      'Test Name': { rich_text: {} },
      Value: { number: { format: 'number' } },
      Unit: { rich_text: {} },
      'Reference Range': { rich_text: {} },
      Status: {
        select: {
          options: [
            { name: 'Normal', color: 'green' },
            { name: 'High', color: 'orange' },
            { name: 'Low', color: 'blue' },
            { name: 'Critical', color: 'red' }
          ]
        }
      },
      'Lab / Facility': { rich_text: {} }
    }
  },
  chemo: {
    title: 'Chemo Sessions',
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      'Cycle Number': { number: { format: 'number' } },
      Regimen: { rich_text: {} },
      'Dose Reductions': { rich_text: {} },
      'Pre-meds Given': { rich_text: {} },
      'Side Effects Noted': { rich_text: {} },
      'Next Session Date': { date: {} }
    }
  },
  doctor_notes: {
    title: 'Doctor Visit Notes',
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      Doctor: { rich_text: {} },
      Facility: { rich_text: {} },
      'Key Findings': { rich_text: {} },
      'Plan Changes': { rich_text: {} },
      'New Medications': { rich_text: {} },
      'Follow-up Date': { date: {} }
    }
  }
};

function flatToProps(type, record) {
  const schema = DOCUMENT_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown document type: ${type}`);
  const out = {};
  for (const [field, def] of Object.entries(schema.properties)) {
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    if (def.title) {
      out[field] = { title: [{ type: 'text', text: { content: String(value) } }] };
    } else if (def.rich_text) {
      out[field] = { rich_text: [{ type: 'text', text: { content: String(value) } }] };
    } else if (def.number) {
      const n = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isNaN(n)) out[field] = { number: n };
    } else if (def.date) {
      out[field] = { date: { start: String(value) } };
    } else if (def.select) {
      out[field] = { select: { name: String(value) } };
    }
  }
  return out;
}

function generateName(type, record) {
  switch (type) {
    case 'cgm': {
      const fmt = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '?';
      return `CGM ${fmt(record['Period Start'])}–${fmt(record['Period End'])}`;
    }
    case 'labs':
      return `${record['Test Name'] || 'Lab'} — ${record['Date'] || ''}`;
    case 'chemo':
      return `${record['Regimen'] || 'Chemo'} Cycle ${record['Cycle Number'] || '?'} — ${record['Date'] || ''}`;
    case 'doctor_notes':
      return `${record['Doctor'] || 'Bác sĩ'} — ${record['Date'] || ''}`;
    default:
      return 'Untitled';
  }
}

module.exports = { DOCUMENT_SCHEMAS, flatToProps, generateName };
