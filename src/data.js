/* Reckoner static content: icons, starter sheets, templates and the help text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReckonerData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 24 x 24 line icons, drawn for this app
  var ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    fwd: '<path d="M9 5l7 7-7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    options: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
    link: '<path d="M10.5 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.2 1.2"/><path d="M13.5 10.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.2-1.2"/>',
    backspace: '<path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>',
    enter: '<path d="M19 5v7a3 3 0 0 1-3 3H6"/><path d="M10 11l-4 4 4 4"/>',
    padHide: '<rect x="3" y="4" width="18" height="11" rx="2.5"/><path d="M7 8h.01M10.5 8h.01M14 8h.01M17.5 8h.01M8 11.5h8M9 18.5l3 3 3-3"/>',
    padShow: '<rect x="3" y="9" width="18" height="11" rx="2.5"/><path d="M7 13h.01M10.5 13h.01M14 13h.01M17.5 13h.01M8 16.5h8M9 5.5l3-3 3 3"/>',
    folder: '<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folderPlus: '<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
    sheet: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    trash: '<path d="M4 7h16M10 7V4.8h4V7M6.2 7l.9 12a2 2 0 0 0 2 1.8h5.8a2 2 0 0 0 2-1.8l.9-12M10 11v6M14 11v6"/>',
    grip: '<path d="M5 9h14M5 15h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    pencil: '<path d="M4 20l1-4.2L16 4.8l3.2 3.2L8.2 19z"/><path d="M13.8 7l3.2 3.2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    move: '<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.5 13.5h5M12.5 11l2.5 2.5-2.5 2.5"/>',
    total: '<path d="M17 6.5V4.5H6.5l5.5 7.5-5.5 7.5H17v-2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9M12 16.6h.01"/>',
    importFile: '<path d="M12 4v11M8 11l4 4 4-4M5 19.5h14"/>',
    shift: '<path d="M12 4l7.5 8.5h-4V19h-7v-6.5h-4z"/>',
    ring: '<circle cx="12" cy="12" r="9"/>',
    picked: '<circle cx="12" cy="12" r="9.6" fill="currentColor" stroke="none"/><path d="M7.5 12.4l3 3 6-6.2" stroke="var(--sheet)"/>',
    tune: '<path d="M4 12h16M4 6h16M4 18h16"/><circle cx="9" cy="6" r="2.2" fill="var(--sheet)"/><circle cx="15" cy="12" r="2.2" fill="var(--sheet)"/><circle cx="8" cy="18" r="2.2" fill="var(--sheet)"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0M9 9.6h.01M15 9.6h.01"/>',
    pdf: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h7"/>',
    table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 5v14"/>',
    text: '<path d="M5 6h14M5 10.5h14M5 15h9M5 19.5h6"/>',
    undo: '<path d="M9 6.5L4.5 11 9 15.5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-3"/>'
  };

  var EMOJI = [
    '\ud83d\udcb5', '\ud83d\udcb0', '\ud83d\udcb3', '\ud83c\udfe6', '\ud83e\uddfe', '\ud83d\udcc8', '\ud83d\udcc9', '\ud83d\udcca', '\ud83c\udff7\ufe0f', '\ud83d\uded2', '\ud83c\udf7d\ufe0f', '\u2615',
    '\ud83e\uddc1', '\ud83c\udf5e', '\ud83e\udd63', '\ud83c\udf55', '\ud83c\udf7a', '\ud83e\udd66', '\ud83c\udfe0', '\ud83d\udd28', '\ud83c\udfa8', '\ud83e\uddf1', '\ud83d\udca1', '\ud83d\udebf',
    '\ud83d\ude97', '\u26fd', '\u2708\ufe0f', '\ud83d\ude86', '\ud83d\udeb2', '\ud83e\uddf3', '\ud83c\udfd5\ufe0f', '\ud83d\uddfa\ufe0f', '\ud83d\udcbc', '\ud83d\udcc5', '\u23f1\ufe0f', '\ud83d\udce6',
    '\ud83e\uddee', '\ud83d\udcd0', '\ud83d\udccf', '\ud83d\udd2c', '\ud83e\uddea', '\ud83c\udf93', '\ud83d\udcda', '\u270f\ufe0f', '\u2696\ufe0f', '\ud83c\udfc3', '\ud83d\udcaa', '\ud83d\udc8a',
    '\ud83e\uddf5', '\ud83e\udde6', '\ud83d\udc57', '\ud83e\uddf6', '\ud83c\udf31', '\ud83d\udc15', '\ud83d\udc76', '\ud83c\udf81', '\ud83c\udf89', '\u2b50', '\u2764\ufe0f', '\ud83d\udccc'
  ];

  /* Field spec: s symbol, d description, v value, f formula, pre prefix, suf suffix,
     min/max decimals, tr rounding ('floor' | 'ceil'). */
  var TEMPLATES = [
    { name: 'Tip and split', icon: '\ud83c\udf7d\ufe0f', about: 'Add a tip, then share the bill.', fields: [
      { s: 'b', d: 'Bill', v: 86.4, pre: '$' },
      { s: 't', d: 'Tip', v: 18, suf: '%' },
      { s: 'n', d: 'People', v: 4 },
      { s: 'T', d: 'Tip amount', f: 'b * t / 100', pre: '$', min: 2 },
      { s: 'G', d: 'Total with tip', f: 'b + T', pre: '$', min: 2 },
      { s: 'E', d: 'Each person pays', f: 'G / n', pre: '$', min: 2 }
    ] },
    { name: 'Sale price', icon: '\ud83c\udff7\ufe0f', about: 'Discount first, sales tax after.', fields: [
      { s: 'p', d: 'Ticket price', v: 120, pre: '$' },
      { s: 'd', d: 'Discount', v: 25, suf: '%' },
      { s: 't', d: 'Sales tax', v: 8.5, suf: '%' },
      { s: 'S', d: 'You save', f: 'p * d / 100', pre: '$', min: 2 },
      { s: 'N', d: 'Price after discount', f: 'p - S', pre: '$', min: 2 },
      { s: 'F', d: 'Price with tax', f: 'N * (1 + t / 100)', pre: '$', min: 2 }
    ] },
    { name: 'Spending log', icon: '\ud83e\uddfe', about: 'Jot amounts down; the total keeps up.', fields: [
      { s: 'a', d: 'Groceries', v: 64.2, pre: '$' },
      { s: 'b', d: 'Bus pass', v: 32, pre: '$' },
      { s: 'c', d: 'Coffee beans', v: 14.75, pre: '$' },
      { s: 'd', d: 'Pharmacy', v: 18.4, pre: '$' },
      { s: 'T', d: 'Total spent', f: 'sum(@above)', pre: '$', min: 2 },
      { s: 'A', d: 'Average per entry', f: 'avg(@above)', pre: '$', min: 2 }
    ] },
    { name: 'Paint for a room', icon: '\ud83c\udfa8', about: 'Wall area and tins to buy, rounded up.', fields: [
      { s: 'l', d: 'Room length', v: 14, suf: 'ft' },
      { s: 'w', d: 'Room width', v: 11, suf: 'ft' },
      { s: 'h', d: 'Wall height', v: 8, suf: 'ft' },
      { s: 'c', d: 'Coats', v: 2 },
      { s: 'k', d: 'One gallon covers', v: 350, suf: 'sq ft' },
      { s: 'A', d: 'Wall area', f: '2 * (l + w) * h', suf: 'sq ft' },
      { s: 'G', d: 'Gallons to buy', f: 'A * c / k', suf: 'gal', max: 0, tr: 'ceil' }
    ] },
    { name: 'Compound growth', icon: '\ud83d\udcc8', about: 'What a lump sum grows to.', fields: [
      { s: 'P', d: 'Starting amount', v: 5000, pre: '$' },
      { s: 'r', d: 'Yearly rate', v: 6, suf: '%' },
      { s: 'n', d: 'Times compounded a year', v: 12 },
      { s: 't', d: 'Years', v: 15 },
      { s: 'A', d: 'Final amount', f: 'P * (1 + r / 100 / n) ^ (n * t)', pre: '$', min: 2 },
      { s: 'I', d: 'Growth', f: 'A - P', pre: '$', min: 2 }
    ] },
    { name: 'Saving every month', icon: '\ud83d\udcb0', about: 'A starting sum plus regular deposits.', fields: [
      { s: 'P', d: 'Starting amount', v: 1000, pre: '$' },
      { s: 'm', d: 'Deposit each month', v: 250, pre: '$' },
      { s: 'r', d: 'Yearly rate', v: 4.5, suf: '%' },
      { s: 't', d: 'Years', v: 10 },
      { s: 'i', d: 'Rate per month', f: 'r / 100 / 12', max: 6 },
      { s: 'k', d: 'Months', f: 't * 12' },
      { s: 'F', d: 'You end up with', f: 'P * (1 + i) ^ k + m * ((1 + i) ^ k - 1) / i', pre: '$', min: 2 },
      { s: 'C', d: 'You paid in', f: 'P + m * k', pre: '$', min: 2 },
      { s: 'G', d: 'Interest earned', f: 'F - C', pre: '$', min: 2 }
    ] },
    { name: 'Loan payment', icon: '\ud83c\udfe6', about: 'Monthly payment and total interest.', fields: [
      { s: 'L', d: 'Amount borrowed', v: 18000, pre: '$' },
      { s: 'r', d: 'Yearly rate', v: 7.2, suf: '%' },
      { s: 'y', d: 'Years', v: 5 },
      { s: 'i', d: 'Rate per month', f: 'r / 100 / 12', max: 6 },
      { s: 'n', d: 'Payments', f: 'y * 12' },
      { s: 'M', d: 'Monthly payment', f: 'L * i * (1 + i) ^ n / ((1 + i) ^ n - 1)', pre: '$', min: 2 },
      { s: 'T', d: 'Total paid', f: 'M * n', pre: '$', min: 2 },
      { s: 'I', d: 'Interest paid', f: 'T - L', pre: '$', min: 2 }
    ] },
    { name: 'Unit price', icon: '\ud83d\uded2', about: 'Which pack is the better buy.', fields: [
      { s: 'a', d: 'Pack A price', v: 4.79, pre: '$' },
      { s: 'b', d: 'Pack A size', v: 12, suf: 'oz' },
      { s: 'c', d: 'Pack B price', v: 6.49, pre: '$' },
      { s: 'd', d: 'Pack B size', v: 18, suf: 'oz' },
      { s: 'x', d: 'A costs per ounce', f: 'a / b', pre: '$', max: 3 },
      { s: 'y', d: 'B costs per ounce', f: 'c / d', pre: '$', max: 3 },
      { s: 'z', d: 'B is cheaper by', f: '(x - y) / x * 100', suf: '%', max: 1 }
    ] },
    { name: 'Fuel for a drive', icon: '\u26fd', about: 'Gallons and cost for a distance.', fields: [
      { s: 'd', d: 'Distance', v: 310, suf: 'mi' },
      { s: 'e', d: 'Fuel economy', v: 31, suf: 'mpg' },
      { s: 'p', d: 'Price per gallon', v: 3.85, pre: '$' },
      { s: 'g', d: 'Fuel needed', f: 'd / e', suf: 'gal', max: 1 },
      { s: 'c', d: 'Fuel cost', f: 'g * p', pre: '$', min: 2 }
    ] },
    { name: 'Hourly pay to yearly', icon: '\ud83d\udcbc', about: 'Weekly, monthly and yearly pay.', fields: [
      { s: 'h', d: 'Hourly rate', v: 28.5, pre: '$' },
      { s: 'w', d: 'Hours a week', v: 38 },
      { s: 'k', d: 'Weeks worked a year', v: 50 },
      { s: 'W', d: 'Weekly pay', f: 'h * w', pre: '$', min: 2 },
      { s: 'Y', d: 'Yearly pay', f: 'W * k', pre: '$', max: 0 },
      { s: 'M', d: 'Monthly pay', f: 'Y / 12', pre: '$', max: 0 }
    ] },
    { name: 'Recipe scaler', icon: '\ud83e\udd63', about: 'Scale ingredients to the servings you need.', fields: [
      { s: 's', d: 'Recipe serves', v: 4 },
      { s: 'n', d: 'Servings needed', v: 10 },
      { s: 'f', d: 'Scale by', f: 'n / s', suf: '\u00d7' },
      { s: 'a', d: 'Flour in the recipe', v: 250, suf: 'g' },
      { s: 'A', d: 'Flour to use', f: 'a * f', suf: 'g', max: 0 },
      { s: 'b', d: 'Milk in the recipe', v: 300, suf: 'ml' },
      { s: 'B', d: 'Milk to use', f: 'b * f', suf: 'ml', max: 0 },
      { s: 'c', d: 'Eggs in the recipe', v: 2 },
      { s: 'C', d: 'Eggs to use', f: 'c * f', max: 0, tr: 'ceil' }
    ] },
    { name: 'Percent change', icon: '\ud83d\udcca', about: 'From one number to another.', fields: [
      { s: 'a', d: 'From', v: 1840 },
      { s: 'b', d: 'To', v: 2115 },
      { s: 'd', d: 'Change', f: 'b - a' },
      { s: 'p', d: 'Percent change', f: 'd / a * 100', suf: '%', max: 1 }
    ] },
    { name: 'Break-even', icon: '\ud83d\udce6', about: 'How many you must sell to cover costs.', fields: [
      { s: 'F', d: 'Fixed costs', v: 4200, pre: '$' },
      { s: 'p', d: 'Selling price each', v: 24, pre: '$' },
      { s: 'v', d: 'Cost to make each', v: 9.5, pre: '$' },
      { s: 'm', d: 'Margin on each', f: 'p - v', pre: '$', min: 2 },
      { s: 'n', d: 'Sales to break even', f: 'F / m', max: 0, tr: 'ceil' }
    ] },
    { name: 'Body mass index', icon: '\u2696\ufe0f', about: 'From weight in kilograms and height in centimetres.', fields: [
      { s: 'w', d: 'Weight', v: 70, suf: 'kg' },
      { s: 'h', d: 'Height', v: 175, suf: 'cm' },
      { s: 'B', d: 'Body mass index', f: 'w / (h / 100) ^ 2', max: 1 }
    ] },
    { name: 'Circle', icon: '\ud83d\udcd0', about: 'Circumference and area from a radius.', fields: [
      { s: 'r', d: 'Radius', v: 5, suf: 'cm' },
      { s: 'C', d: 'Circumference', f: '2 * @pi * r', suf: 'cm' },
      { s: 'A', d: 'Area', f: '@pi * r ^ 2', suf: 'cm\u00b2' }
    ] },
    { name: 'Running pace', icon: '\ud83c\udfc3', about: 'Pace and speed from distance and time.', fields: [
      { s: 'd', d: 'Distance', v: 10, suf: 'km' },
      { s: 't', d: 'Time', v: 52, suf: 'min' },
      { s: 'p', d: 'Pace', f: 't / d', suf: 'min/km' },
      { s: 's', d: 'Speed', f: 'd / (t / 60)', suf: 'km/h', max: 1 }
    ] }
  ];

  // Sheets a new install starts with, by template name
  var STARTERS = ['Tip and split', 'Spending log', 'Paint for a room'];

  var WELCOME = [
    { title: 'Type a sum once', text: 'Type a calculation and press the yellow key. Each number becomes a row you can change later.' },
    { title: 'Change any number', text: 'Tap a number on the right of a row and type a new one. Every result that uses it follows.' },
    { title: 'Say what it is', text: 'Tap the left of a row to name it, add a $ or a unit, and choose the decimals.' }
  ];

  var HELP = [
    { title: 'Start a calculation', text: 'Type on the keypad and press the yellow key. In a new sheet 12 \u00d7 5 gives three rows: 12, 5 and their result.' },
    { title: 'Use an earlier row', text: 'While typing, tap the chain key, then tap the row. Its value joins your calculation and stays linked.' },
    { title: 'Jot down a number', text: 'Type just a number and press the yellow key. It becomes a row of its own, ready for a name.' },
    { title: 'Formulas with letters', text: 'Tap abc and type something like n \u00d7 (n + 1) \u00f7 2. Each new letter becomes a row waiting for its number.' },
    { title: 'Brackets', text: 'Changing from \u00d7 to + brackets what you typed so far, like a pocket calculator. To bracket part of a sum afterwards, press ) and choose where the bracket opens. If a bracket is already open, hold ) instead.' },
    { title: 'Change a formula', text: 'Tap a result to see how it is worked out. Tap it twice to edit the formula.' },
    { title: 'Delete without breaking things', text: 'Swipe a row left to delete it. Whatever used it keeps working: a result\u2019s formula, or an input\u2019s number, is written into the formulas that needed it.' },
    { title: 'Totals', text: 'In the \u0192 menu, \u201cTotal of the rows above\u201d adds up every number row above it. New numbers you jot down land above the total.' },
    { title: 'Reorder or delete several', text: 'Hold a row, or choose Edit rows in the sheet options, then drag the handles or tick rows to delete.' },
    { title: 'Share', text: 'Sheet options has PDF, CSV and a sheet file that another copy of Reckoner can open.' }
  ];

  return { ICONS: ICONS, EMOJI: EMOJI, TEMPLATES: TEMPLATES, STARTERS: STARTERS, WELCOME: WELCOME, HELP: HELP };
});
