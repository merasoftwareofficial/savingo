import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate an invoice PDF from bill data
 * @param {Object} bill - The bill object containing all invoice information
 * @param {Object} customer - Customer information
 * @param {Object} company - Company information (optional)
 * @param {Object} workOrder - Work order information (optional)
 * @returns {jsPDF} - The generated PDF document
 */
export const generateInvoice = (bill, customer, company = {}, workOrder = {}) => {
  // Create a new PDF document
  const doc = new jsPDF();
  
  // Set default company info if not provided
  const defaultCompany = {
    name: "VA Computers",
    address: "Vast Academy Near New Bus Stand oppo. Govt. Sen. Sec School (Majitha), Amritsar, Punjab, 143601",
    mobile: "",
    email: "vacomputers.com@gmail.com",
    pan: "GMLPS6158A"
  };
  
  // Merge provided company with defaults
  const companyInfo = { ...defaultCompany, ...company };
  
  // Page size and margins
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  
  // Add invoice header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(companyInfo.name, pageWidth / 2, margin, { align: "center" });
  
  // Company information
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  // Company address - break if too long
  const addressLines = doc.splitTextToSize(companyInfo.address, pageWidth - 2 * margin);
  let yPos = margin + 10;
  
  addressLines.forEach(line => {
    doc.text(line, pageWidth / 2, yPos, { align: "center" });
    yPos += 5;
  });
  
  // Contact info
  doc.text(`Mobile: ${companyInfo.mobile}     PAN Number: ${companyInfo.pan}`, pageWidth / 2, yPos + 5, { align: "center" });
  doc.text(`Email: ${companyInfo.email}`, pageWidth / 2, yPos + 10, { align: "center" });
  
  // Draw horizontal line
  yPos += 15;
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  
  // Invoice information (2-column layout)
  yPos += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Invoice No.:", margin, yPos);
  doc.text("Invoice Date:", pageWidth - margin, yPos, { align: "right" });
  
  // Invoice values
  doc.setFont("helvetica", "normal");
  doc.text(bill.billNumber || "", margin + 25, yPos);
  doc.text(formatDate(bill.createdAt), pageWidth - margin - 25, yPos, { align: "right" });
  
  // Bill To section
  yPos += 10;
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", margin, yPos);
  yPos += 5;
  
  // Customer info
  doc.setFont("helvetica", "normal");
  doc.text(customer.name || "Customer Name", margin, yPos);
  yPos += 5;
  
  if (customer.address) {
    const custAddressLines = doc.splitTextToSize(customer.address, (pageWidth / 2) - margin);
    custAddressLines.forEach(line => {
      doc.text(line, margin, yPos);
      yPos += 5;
    });
  }
  
  if (customer.phoneNumber) {
    doc.text(`Mobile: ${customer.phoneNumber}`, margin, yPos);
    yPos += 5;
  }
  
  // Add Work Order information
  if (workOrder.orderId || bill.orderId) {
    doc.text(`Order ID: ${workOrder.orderId || bill.orderId}`, margin, yPos);
    yPos += 5;
  }
  
  if (workOrder.projectType) {
    doc.text(`Project: ${workOrder.projectType}`, margin, yPos);
    yPos += 5;
  }
  
  // Payment method
  doc.setFont("helvetica", "bold");
  doc.text("Payment Method:", pageWidth - margin - 60, yPos - 10);
  doc.setFont("helvetica", "normal");
  doc.text(bill.paymentMethod ? bill.paymentMethod.toUpperCase() : "CASH", pageWidth - margin, yPos - 10, { align: "right" });
  
  if (bill.transactionId) {
    doc.setFont("helvetica", "bold");
    doc.text("Transaction ID:", pageWidth - margin - 60, yPos - 5);
    doc.setFont("helvetica", "normal");
    doc.text(bill.transactionId, pageWidth - margin, yPos - 5, { align: "right" });
  }
  
  // Invoice items table
  yPos += 10;
  
  // Table headers and styling
  const headers = [
    { header: 'SERVICES', dataKey: 'name' },
    { header: 'QTY.', dataKey: 'quantity' },
    { header: 'RATE', dataKey: 'price' },
    { header: 'AMOUNT', dataKey: 'amount' }
  ];
  
  // Prepare table data
  const tableData = bill.items.map(item => ({
    name: item.serialNumber ? `${item.name}\nS/N: ${item.serialNumber}` : item.name,
    quantity: item.quantity.toString(),
    price: formatCurrency(item.price),
    amount: formatCurrency(item.amount)
  }));
  
  // Create table using autoTable
  autoTable(doc, {
    startY: yPos,
    head: [headers.map(h => h.header)],
    body: tableData.map(item => [
      item.name,
      item.quantity,
      item.price,
      item.amount
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: [82, 86, 94],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: margin, right: margin }
  });
  
  // Get y position after table
  yPos = doc.lastY + 10;
  
  // Total section
  doc.setFont("helvetica", "bold");
  
  // Subtotal
  doc.text("SUBTOTAL", pageWidth - margin - 60, yPos);
  doc.text(formatCurrency(bill.totalAmount), pageWidth - margin, yPos, { align: "right" });
  yPos += 7;
  
  // Draw a line before the total
  doc.setLineWidth(0.5);
  doc.line(pageWidth - margin - 90, yPos - 2, pageWidth - margin, yPos - 2);
  
  // Total Amount
  doc.setFontSize(12);
  doc.text("TOTAL AMOUNT", pageWidth - margin - 60, yPos + 5);
  doc.text(formatCurrency(bill.totalAmount), pageWidth - margin, yPos + 5, { align: "right" });
  
  // Payment status
  yPos += 15;
  doc.setFontSize(11);
  doc.text(`Payment Status: ${bill.paymentStatus ? bill.paymentStatus.toUpperCase() : "PAID"}`, pageWidth - margin, yPos, { align: "right" });
  
  return doc;
};

// Helper functions
function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { 
    day: '2-digit', 
    month: '2-digit',
    year: 'numeric'
  });
}

function formatCurrency(amount) {
  if (amount === undefined || amount === null) return "₹0";
  return `₹${parseFloat(amount).toFixed(2)}`;
}

export default generateInvoice;
