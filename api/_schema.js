const PROPERTY_SCHEMA = {
  'Date':                   'date',
  'Overall Status':         'select',
  'Pain Level':             'select',
  'Blood Sugar (Morning)':  'number',
  'Weight (kg)':            'number',
  'Notes':                  'rich_text',
  'Nausea':                 'checkbox',
  'Vomiting':               'checkbox',
  'Diarrhea':               'checkbox',
  'Bloating':               'checkbox',
  'Dumping Episodes':       'number',
  'Logged By':              'select',
  'Calories Est.':          'number',
  'Protein Est. (g)':       'number',
  'Breakfast':              'rich_text',
  'Lunch':                  'rich_text',
  'Dinner':                 'rich_text',
};

function flatToNotionProps(flat) {
  const out = {};
  for (const [propName, type] of Object.entries(PROPERTY_SCHEMA)) {
    let value;
    if (type === 'date') {
      value = flat[`date:${propName}:start`];
    } else {
      value = flat[propName];
    }
    if (value === undefined || value === null) continue;

    switch (type) {
      case 'rich_text':
        out[propName] = { rich_text: [{ text: { content: String(value) } }] };
        break;
      case 'number': {
        const n = typeof value === 'number' ? value : parseFloat(value);
        if (!isNaN(n)) out[propName] = { number: n };
        break;
      }
      case 'select':
        out[propName] = { select: { name: String(value) } };
        break;
      case 'date':
        out[propName] = { date: { start: String(value) } };
        break;
      case 'checkbox':
        out[propName] = { checkbox: value === '__YES__' || value === true };
        break;
    }
  }
  return out;
}

module.exports = { flatToNotionProps };
