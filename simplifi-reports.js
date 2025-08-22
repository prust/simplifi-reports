let filedrag = document.getElementById('filedrag');
filedrag.addEventListener("dragover", FileDragHover, false);
filedrag.addEventListener("dragleave", FileDragHover, false);
filedrag.addEventListener("drop", FileSelectHandler, false);

let current_year = new Date().getFullYear();
let balance_cents = // TODO: add a starting balance as an integer of cents

let report_div = document.getElementById('report');

let month_names = {'09': 'September', '10': 'October', '11': 'November', '12': 'December', '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August'};

// hard-coded category-ID-to-name, figured out from Quicken Simplifi
let category_names = {
  '0': 'Regular Giving',
  '1': 'Online Services',
  '2': 'Bookkeeper',
  '3': 'Director',
  '4': 'Food',
  '5': 'Newsletter',
  '6': 'Events',
  '7': 'Promotional',
  '8': 'Training & Materials',
  '9': 'One-Time Giving',
};

// TEMP, only used for temp workaround code
let category_name_arr = Object.values(category_names);
let category_id_arr = Object.keys(category_names);

// file drag hover
function FileDragHover(e) {
  e.stopPropagation();
  e.preventDefault();
  e.target.className = (e.type == "dragover" ? "hover" : "");
}

function FileSelectHandler(e) {
  // cancel event and hover styling
  FileDragHover(e);

  // fetch FileList object
  let file = (e.target.files || e.dataTransfer.files)[0];

  console.log('file dropped:', file.name, file.type, file.size);
  let reader = new FileReader();
  reader.onload = onFileLoad.bind(null, reader, file);
  reader.readAsText(file);
}

async function onFileLoad(reader, file, e) {
  let text = reader.result;
  let new_records = JSON.parse(text);

  // temp code to convert workaround JSON into the format we'll get from Quicken Simplifi
  for (let record of new_records) {
    if (record.category) {
      record = convertCategoryToCOA(record);
    }
    else if (record.split) {
      record.split = {items: record.split.map(convertCategoryToCOA)};
    }
    else {
      throw new Error(`Record doesn't have a category or split: ${JSON.stringify(record)}`);
    }
  }

  window.transactions = new_records;
  console.log(`Imported ${new_records.length} transactions from ${file.name}`);

  // report();
  monthReport('2025-07');

  filedrag.style.display = 'none';
};

function convertCategoryToCOA(obj) {
  let ix = category_name_arr.indexOf(obj.category);
  assert(ix != -1);
  obj.coa = {type: 'CATEGORY', id: category_id_arr[ix]};
  delete obj.category;
  return obj;
}

function report() {
  let months = ['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'];
  let year_records = transactions.filter(r => months.includes(getYearMonth(r.postedOn)));

  // pre-calculate all relevant categories
  let category_ids = year_records.map(function(record) {
    if (record.coa?.type == 'CATEGORY') {
      return record.coa.id;
    }
    else if (record.split) {
      for (let item of record.split.items)
        assert(item.coa.type == 'CATEGORY');
      return record.split.items.map(item => item.coa.id);
    }
    else {
      return null;
    }
  });
  category_ids = _.uniq(_.compact(category_ids.flat()));
  category_ids = _.sortBy(category_ids, function(category_id) {
    return category_names[category_id] || category_id;
  });

  // build table
  let html = '<table>';
  // display column headers at the top of the table
  html += '<tr>';
  html += '<th></th>'; // empty cell in the top-left corner
  for (let month of months)
    html += `<th><b>${month_names[month.slice(-2)]}</b></th>`;
  html += '</tr>';

  // display income
  let income_totals = {};
  html += '<tr><th class="sidebar"><u>Income</u></th></tr>';
  html += '<tr><th class="category">Regular Giving</th>';
  for (let month of months) {
    let records = filterRecords(year_records, {month, category_id: '0'});
    let cents = sumToCents(records);
    income_totals[month] = cents;
    html += `<td class="amt">${displayCents(cents)}</td>`;
  }
  html += '</tr>';
  html += '<tr><th class="category">One-Time Giving</th>';
  for (let month of months) {
    let records = filterRecords(year_records, {month, category_id: '9'});
    let cents = sumToCents(records);
    income_totals[month] += cents;
    html += `<td class="amt">${displayCents(cents)}</td>`;
  }
  html += '</tr>';
  html += '<tr><th class="sidebar">Total</th>';
  for (let month of months) {
    html += `<td class="amt"><b>${displayCents(income_totals[month])}</b></td>`;
  }
  html += '</tr>';

  html += '<tr><th class="separator"></th></tr>';

  html += '<tr><th class="sidebar"><u>Expenses</u></th></tr>';
  // display a row for each category
  let expense_totals = {};
  for (let category_id of category_ids) {
    // skip both Giving categories
    if (category_id == '0' || category_id == '9')
      continue;

    let category_name = category_names[category_id] || '[unknown]';
    html += '<tr>';
    html += `<th class="category">${category_name}</th>`;
    
    for (let month of months) {
      let records = filterRecords(year_records, {month, category_id});
      let cents = sumToCents(records);
      expense_totals[month] = cents + (expense_totals[month] || 0);
      html += `<td class="amt">${displayCents(-cents)}</td>`;
    }
    html += '</tr>';
  }

  html += '<tr><th class="sidebar">Total</th>';
  for (let month of months) {
    html += `<td class="amt"><b>${displayCents(-expense_totals[month])}</b></td>`;
  }
  html += '</tr>';

  html += '<tr><th class="separator"></th></tr>';

  html += '<tr><th class="sidebar">Profit / Loss</th>';
  for (let month of months) {
    html += `<td class="amt"><b>${displayCents(income_totals[month] + expense_totals[month])}</b></td>`;
  }
  html += '</tr>';

  html += '<tr><th class="separator"></th></tr>';

  html += '<tr><th class="sidebar">Balance</th>';
  for (let month of months) {
    balance_cents += income_totals[month] + expense_totals[month];
    html += `<td class="amt"><b>${displayCents(balance_cents)}</b></td>`;
  }
  html += '</tr>';
  
  html += '</table>';
  report_div.innerHTML = html;
}

function monthReport(month) {
  let month_records = transactions.filter(r => getYearMonth(r.postedOn) == month);

  // pre-calculate all relevant categories
  // TODO: fix this DRY (identical w/ code in report())
  let category_ids = month_records.map(function(record) {
    if (record.coa?.type == 'CATEGORY') {
      return record.coa.id;
    }
    else if (record.split) {
      for (let item of record.split.items)
        assert(item.coa.type == 'CATEGORY');
      return record.split.items.map(item => item.coa.id);
    }
    else {
      return null;
    }
  });
  category_ids = _.uniq(_.compact(category_ids.flat()));
  category_ids = _.sortBy(category_ids, function(category_id) {
    return category_names[category_id] || category_id;
  });

  let month_name = month_names[month.slice(-2)];
  html = `<p>${month_records.length} transactions for the month of ${month_name}</p>`;

  let records = filterRecords(month_records, {month, category_id: '0'});
  let cents = sumToCents(records);
  html += `<p>Regular Giving: ${displayCents(cents)}`;
  html += transactionsToList(records);

  records = filterRecords(month_records, {month, category_id: '9'});
  cents = sumToCents(records);
  if (cents) {
    html += `<p>One-Time Giving: ${displayCents(cents)}`;
    html += transactionsToList(records);
  }

  for (let category_id of category_ids) {
    // skip Giving categories
    if (category_id == '0' || category_id == '9')
      continue;

    let category_name = category_names[category_id] || '[unknown]';

    let records = filterRecords(month_records, {month, category_id});
    let cents = sumToCents(records);

    html += `<p>${category_name}: ${displayCents(cents)}</p>`;
    html += transactionsToList(records);
  }
  report_div.innerHTML = html;
}

function transactionsToList(records) {
  let html = '<ul>';
  html += records.map(function(record) {
    let date_parts = record.postedOn.split('-');
    let us_date = `${date_parts[1]}/${date_parts[2]}/${date_parts[0]}`;
    let cents = Math.round(record.amount * 100);
    return `<li>${us_date} ${displayCents(cents)} ${record.payee}</li>`;
  }).join('\n');
  return html + '</ul>';
}

function getYear(dt_str) {
  return dt_str.slice(0, 4);
}

function getYearMonth(dt_str) {
  return dt_str.slice(0, 7);
}

function filterRecords(records, filters) {
  if (filters.month)
    records = records.filter(r => getYearMonth(r.postedOn) == filters.month);
  
  let filtered_records;
  if (filters.category_id) {
    filtered_records = [];
    for (let record of records) {
      if (record.coa?.type == 'CATEGORY' && record.coa.id == filters.category_id) {
        filtered_records.push(record);
      }
      else if (record.split) {
        for (let item of record.split.items) {
          if (item.coa.type == 'CATEGORY' && item.coa.id == filters.category_id)
            filtered_records.push({...item, payee: record.payee, postedOn: record.postedOn, split: true});
        }
      }
    }
  }
  else {
    filtered_records = records;
  }

  return filtered_records;
}

function sumToCents(records) {
  let total = 0;
  for (let record of records)
    total += Math.round(record.amount * 100);
  
  return Math.round(total);
}

function displayCents(cents) {
  // TODO: inject a comma in the thousands place?
  if (!cents)
    return '';
  let val = cents / 100;
  let str = val.toFixed(2);
  if (val >= 1000)
    str = `${str.slice(0, -6)},${str.slice(-6)}`;
  return str;
}

function assert(val) {
  if (!val)
    throw new Error(`Assertion failed`);
}
