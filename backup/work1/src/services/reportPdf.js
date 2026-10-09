import {jsPDF} from 'jspdf';
import RNBlobUtil from 'react-native-blob-util';

const PAGE_SIZE = {
  left: 14,
  right: 14,
  top: 16,
  bottom: 16,
};

const COLORS = {
  text: [31, 41, 55],
  muted: [107, 114, 128],
  border: [229, 231, 235],
  headerFill: [243, 244, 246],
  primary: [22, 163, 74],
  danger: [220, 38, 38],
  accent: [59, 130, 246],
  cardFill: [249, 250, 251],
};

const SYMBOL_TO_CODE = {
  '₹': 'INR',
  '$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
  '₽': 'RUB',
  'C$': 'CAD',
  'A$': 'AUD',
  'NZ$': 'NZD',
  'S$': 'SGD',
  'HK$': 'HKD',
  'R$': 'BRL',
};

const COUNTRY_TO_CODE = {
  CN: 'CNY',
  MX: 'MXN',
};

const resolveCurrencyCode = (currencySymbol, countryCode = null) => {
  const rawSymbol = String(currencySymbol || '').trim();
  const rawCountry = String(countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(rawSymbol)) return rawSymbol;
  if (COUNTRY_TO_CODE[rawCountry]) return COUNTRY_TO_CODE[rawCountry];
  if (SYMBOL_TO_CODE[rawSymbol]) return SYMBOL_TO_CODE[rawSymbol];
  return 'INR';
};

const formatAmountWithCode = (amount, currencySymbol, countryCode = null, options = {}) => {
  const code = resolveCurrencyCode(currencySymbol, countryCode);
  const value = Number(amount) || 0;
  const useAbsoluteValue = Boolean(options.absolute);
  const displayValue = useAbsoluteValue ? Math.abs(value) : value;
  return `${code} ${displayValue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const toText = value => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

const formatDate = ts =>
  ts
    ? new Date(ts).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '-';

const formatMonth = monthKey => {
  if (!monthKey) return '-';
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return String(monthKey);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
};

const createPdf = () => new jsPDF({orientation: 'p', unit: 'mm', format: 'a4'});

const drawText = (doc, text, x, y, options = {}) => {
  doc.text(toText(text), x, y, options);
};

const setHeader = (doc, title, periodLabel) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  drawText(doc, title, PAGE_SIZE.left, PAGE_SIZE.top);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  drawText(doc, periodLabel, PAGE_SIZE.left, PAGE_SIZE.top + 6);

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(PAGE_SIZE.left, PAGE_SIZE.top + 10, pageWidth - PAGE_SIZE.right, PAGE_SIZE.top + 10);
};

const drawCard = (doc, x, y, width, height, label, value, valueColor) => {
  doc.setFillColor(...COLORS.cardFill);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(x, y, width, height, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  drawText(doc, label.toUpperCase(), x + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...valueColor);
  drawText(doc, value, x + 4, y + 11);
};

const drawSectionTitle = (doc, title, x, y, width) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  drawText(doc, title, x, y);

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(x, y + 1.8, x + width, y + 1.8);
};

const fitTableRows = (doc, columns, rows, startY) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = pageWidth - PAGE_SIZE.left - PAGE_SIZE.right;
  const colWidths = columns.map(col => col.width || tableWidth / columns.length);
  const headerHeight = 9;
  const bottomLimit = pageHeight - PAGE_SIZE.bottom;
  let y = startY;

  const drawHeader = () => {
    doc.setFillColor(...COLORS.headerFill);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.25);
    doc.rect(PAGE_SIZE.left, y, tableWidth, headerHeight, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.muted);
    let x = PAGE_SIZE.left;
    columns.forEach((column, index) => {
      const align = column.align || 'left';
      const textX = align === 'right' ? x + colWidths[index] - 2 : align === 'center' ? x + colWidths[index] / 2 : x + 2;
      drawText(doc, column.label, textX, y + 5.8, {align});
      x += colWidths[index];
    });
    y += headerHeight;
  };

  drawHeader();

  rows.forEach(row => {
    const cells = columns.map((column, index) => {
      const raw = row[column.key];
      const text = Array.isArray(raw) ? raw.map(toText).join('\n') : toText(raw);
      const wrapped = doc.splitTextToSize(text, colWidths[index] - 4);
      return {
        text: wrapped,
        align: column.align || 'left',
        color: row.__colors && row.__colors[column.key] ? row.__colors[column.key] : COLORS.text,
        width: colWidths[index],
      };
    });

    const rowHeight = Math.max(...cells.map(cell => cell.text.length * 4.2 + 3.5), 8);
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = PAGE_SIZE.top;
      drawHeader();
    }

    let x = PAGE_SIZE.left;
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    cells.forEach((cell, index) => {
      doc.rect(x, y, cell.width, rowHeight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(...cell.color);
      const textX =
        cell.align === 'right'
          ? x + cell.width - 2
          : cell.align === 'center'
            ? x + cell.width / 2
            : x + 2;
      const textOptions = {align: cell.align, baseline: 'top'};
      doc.text(cell.text, textX, y + 3, textOptions);
      x += cell.width;
    });
    y += rowHeight;
  });

  return y;
};

const addPageFooter = doc => {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    drawText(doc, `Page ${page} of ${totalPages}`, pageWidth - PAGE_SIZE.right, pageHeight - 8, {align: 'right'});
  }
};

export const generateReportPdfFile = async (reportData, currencySymbol, countryCode = null) => {
  if (!reportData) return null;

  const doc = createPdf();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_SIZE.left - PAGE_SIZE.right;
  const summary = reportData.summary || {};
  const accounts = Array.isArray(reportData.accounts) ? reportData.accounts : [];
  const daily = Array.isArray(reportData.daily) ? reportData.daily : [];
  const dailyByAccount = Array.isArray(reportData.dailyByAccount) ? reportData.dailyByAccount : [];
  const monthly = Array.isArray(reportData.monthly) ? reportData.monthly : [];
  const transactions = Array.isArray(reportData.transactions) ? reportData.transactions : [];

  setHeader(doc, 'Account Report', `${formatDate(reportData.startTs)} - ${formatDate(reportData.endTs)}`);

  const cardWidth = (contentWidth - 6) / 2;
  const cardHeight = 18;
  const cardStartY = PAGE_SIZE.top + 16;
  drawCard(doc, PAGE_SIZE.left, cardStartY, cardWidth, cardHeight, 'Earning', formatAmountWithCode(summary.totalEarning || 0, currencySymbol, countryCode), COLORS.primary);
  drawCard(doc, PAGE_SIZE.left + cardWidth + 6, cardStartY, cardWidth, cardHeight, 'Expenses', formatAmountWithCode(summary.totalExpenses || 0, currencySymbol, countryCode, {absolute: true}), COLORS.danger);
  drawCard(doc, PAGE_SIZE.left, cardStartY + cardHeight + 5, cardWidth, cardHeight, 'Net Balance', formatAmountWithCode(summary.netBalance || 0, currencySymbol, countryCode), summary.netBalance >= 0 ? COLORS.primary : COLORS.danger);
  drawCard(doc, PAGE_SIZE.left + cardWidth + 6, cardStartY + cardHeight + 5, cardWidth, cardHeight, 'Transactions', toText(summary.txnCount || 0), COLORS.accent);

  let y = cardStartY + cardHeight * 2 + 14;

  drawSectionTitle(doc, 'Account Breakdown', PAGE_SIZE.left, y, contentWidth);
  y += 5;
  y = fitTableRows(
    doc,
    [
      {key: 'name', label: 'Account', width: 55},
      {key: 'type', label: 'Type', width: 24},
      {key: 'earning', label: 'Earning', width: 28, align: 'right'},
      {key: 'expenses', label: 'Expenses', width: 28, align: 'right'},
      {key: 'net', label: 'Net', width: 28, align: 'right'},
      {key: 'txnCount', label: 'Txns', width: 16, align: 'center'},
    ],
    accounts.map(account => ({
      name: account.name,
      type: account.type,
      earning: formatAmountWithCode(account.earning || 0, currencySymbol, countryCode),
      expenses: formatAmountWithCode(account.expenses || 0, currencySymbol, countryCode, {absolute: true}),
      net: formatAmountWithCode(account.net || 0, currencySymbol, countryCode),
      txnCount: account.txnCount || 0,
    })),
    y,
  );

  y += 8;
  drawSectionTitle(doc, 'Daily Summary', PAGE_SIZE.left, y, contentWidth);
  y += 5;
  y = fitTableRows(
    doc,
    [
      {key: 'date', label: 'Date', width: 34},
      {key: 'earning', label: 'Earning', width: 31, align: 'right'},
      {key: 'expenses', label: 'Expenses', width: 31, align: 'right'},
      {key: 'net', label: 'Net', width: 31, align: 'right'},
    ],
    daily.map(item => ({
      date: item.date,
      earning: formatAmountWithCode(item.earning || 0, currencySymbol, countryCode),
      expenses: formatAmountWithCode(item.expenses || 0, currencySymbol, countryCode, {absolute: true}),
      net: formatAmountWithCode(item.net || 0, currencySymbol, countryCode),
    })),
    y,
  );

  if (dailyByAccount.length) {
    y += 8;
    drawSectionTitle(doc, 'Daily Account Breakdown', PAGE_SIZE.left, y, contentWidth);
    y += 5;
    y = fitTableRows(
      doc,
      [
        {key: 'date', label: 'Date', width: 24},
        {key: 'accountName', label: 'Account', width: 42},
        {key: 'earning', label: 'Earning', width: 28, align: 'right'},
        {key: 'expenses', label: 'Expenses', width: 28, align: 'right'},
        {key: 'net', label: 'Net', width: 28, align: 'right'},
        {key: 'txnCount', label: 'Txns', width: 15, align: 'center'},
      ],
      dailyByAccount.map(item => ({
        date: item.date,
        accountName: item.accountName,
        earning: formatAmountWithCode(item.earning || 0, currencySymbol, countryCode),
        expenses: formatAmountWithCode(item.expenses || 0, currencySymbol, countryCode, {absolute: true}),
        net: formatAmountWithCode(item.net || 0, currencySymbol, countryCode),
        txnCount: item.txnCount || 0,
      })),
      y,
    );
  }

  if (monthly.length) {
    y += 8;
    drawSectionTitle(doc, 'Monthly Summary', PAGE_SIZE.left, y, contentWidth);
    y += 5;
    y = fitTableRows(
      doc,
      [
        {key: 'month', label: 'Month', width: 34},
        {key: 'earning', label: 'Earning', width: 31, align: 'right'},
        {key: 'expenses', label: 'Expenses', width: 31, align: 'right'},
        {key: 'net', label: 'Net', width: 31, align: 'right'},
      ],
      monthly.map(item => ({
        month: formatMonth(item.month),
        earning: formatAmountWithCode(item.earning || 0, currencySymbol, countryCode),
        expenses: formatAmountWithCode(item.expenses || 0, currencySymbol, countryCode, {absolute: true}),
        net: formatAmountWithCode(item.net || 0, currencySymbol, countryCode),
      })),
      y,
    );
  }

  if (transactions.length) {
    y += 8;
    drawSectionTitle(doc, 'Transactions', PAGE_SIZE.left, y, contentWidth);
    y += 5;
    fitTableRows(
      doc,
      [
        {key: 'date', label: 'Date', width: 24},
        {key: 'accountName', label: 'Account', width: 39},
        {key: 'accountType', label: 'Type', width: 20},
        {key: 'amount', label: 'Amount', width: 24, align: 'right'},
        {key: 'remark', label: 'Remark', width: 56},
      ],
      transactions.map(item => ({
        date: item.date,
        accountName: item.accountName,
        accountType: item.accountType,
        amount: formatAmountWithCode(item.amount || 0, currencySymbol, countryCode),
        remark: item.remark || '-',
        __colors: {
          amount: item.amount > 0 ? COLORS.primary : COLORS.danger,
        },
      })),
      y,
    );
  }

  addPageFooter(doc);

  const base64 = doc.output('datauristring').split(',')[1];
  const fileName = `account-report-${Date.now()}.pdf`;
  const path = `${RNBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await RNBlobUtil.fs.writeFile(path, base64, 'base64');
  return path;
};
