
import { jsPDF } from "jspdf";
import { Product, Sale, Settings } from "../types";

const loadImage = (url: string | undefined): Promise<string> => {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return resolve('');
    }

    if (url.startsWith('data:image')) {
      return resolve(url);
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    const timeout = setTimeout(() => {
      img.src = "";
      resolve('');
    }, 7000);

    img.onload = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve('');
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve('');
    };
    img.src = url;
  });
};

const drawSingleLabel = async (doc: jsPDF, product: Product, x: number, y: number, width: number, height: number) => {
    doc.setDrawColor(220);
    doc.rect(x, y, width, height);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${product.code}`;
    try {
      const qrBase64 = await loadImage(qrUrl);
      if (qrBase64) doc.addImage(qrBase64, 'PNG', x + 2, y + 5, 18, 18);
    } catch(e) {}
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(40, 40, 40);
    const splitName = doc.splitTextToSize(product.name.toUpperCase(), width - 24);
    doc.text(splitName, x + 22, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(`COD: ${product.code}`, x + 22, y + 17);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`R$ ${(product.sellPrice || 0).toFixed(2)}`, x + width - 2, y + height - 4, { align: 'right' });
};

export const generateLabelPDF = async (product: Product, quantity: number) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const labelWidth = 60;
  const labelHeight = 30;
  const marginX = 10;
  const marginY = 13;
  const spacingX = 2;
  const spacingY = 1;
  const cols = 3; 
  const rows = 9; 
  const perPage = cols * rows;
  for (let i = 0; i < quantity; i++) {
    const itemOnPageIndex = i % perPage;
    if (i > 0 && itemOnPageIndex === 0) doc.addPage();
    const col = itemOnPageIndex % cols;
    const row = Math.floor(itemOnPageIndex / cols);
    const x = marginX + col * (labelWidth + spacingX);
    const y = marginY + row * (labelHeight + spacingY);
    await drawSingleLabel(doc, product, x, y, labelWidth, labelHeight);
  }
  doc.save(`etiquetas-${product.name}.pdf`);
};

export const generateAllLabelsPDF = async (products: Product[]) => {
  if (products.length === 0) return;
  const doc = new jsPDF('p', 'mm', 'a4');
  const labelWidth = 60;
  const labelHeight = 30;
  const marginX = 10;
  const marginY = 13;
  const spacingX = 2;
  const spacingY = 1;
  const cols = 3; 
  const rows = 9; 
  const perPage = cols * rows;
  for (let i = 0; i < products.length; i++) {
    const itemOnPageIndex = i % perPage;
    if (i > 0 && itemOnPageIndex === 0) doc.addPage();
    const col = itemOnPageIndex % cols;
    const row = Math.floor(itemOnPageIndex / cols);
    const x = marginX + col * (labelWidth + spacingX);
    const y = marginY + row * (labelHeight + spacingY);
    await drawSingleLabel(doc, products[i], x, y, labelWidth, labelHeight);
  }
  doc.save(`todas-etiquetas-tenda-jl.pdf`);
};

export const generateReceiptPDF = async (sale: Sale, settings: Settings) => {
  const doc = new jsPDF({ unit: 'mm', format: [80, 500] });
  const width = 80;
  let y = 10;

  // CABEÇALHO APENAS COM LOGO E NOME DA TENDA JL
  if (settings.logoUrl) {
    try {
      const logo = await loadImage(settings.logoUrl);
      if (logo) {
        doc.addImage(logo, 'PNG', (width - 35) / 2, y, 35, 35);
        y += 40;
      }
    } catch (e) {}
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(settings.companyName || "TENDA JL", width / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(8);
  doc.text(`COMPROVANTE DE VENDA`, width / 2, y, { align: 'center' });
  y += 8;

  const date = new Date(sale.timestamp);
  doc.setFont('helvetica', 'normal');
  doc.text(`PEDIDO: #${(sale.id || '').substring(0, 8)}`, 5, y);
  
  // Incluindo a hora no comprovante
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  doc.text(`${date.toLocaleDateString()} ${timeStr}`, width - 5, y, { align: 'right' });
  y += 4;
  doc.text(`VENDEDOR: ${sale.sellerName}`, 5, y);
  y += 4;
  if (sale.customerName) {
    doc.text(`CLIENTE: ${sale.customerName}`, 5, y);
    y += 4;
  }
  
  y += 2;
  doc.setLineWidth(0.1);
  doc.line(5, y, width - 5, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIÇÃO', 5, y);
  doc.text('QTD', width - 25, y, { align: 'right' });
  doc.text('TOTAL', width - 5, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  let totalDiscount = 0;
  sale.items.forEach(item => {
    const unitPrice = item.price || 0;
    const itemDiscount = item.discount || 0;
    totalDiscount += itemDiscount * item.quantity;
    const lineTotal = (unitPrice - itemDiscount) * item.quantity;
    
    doc.setFont('helvetica', 'bold');
    doc.text(item.name.toUpperCase().substring(0, 35), 5, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`${item.quantity} x R$ ${unitPrice.toFixed(2)}`, 7, y);
    doc.setFontSize(8);
    doc.text(`R$ ${lineTotal.toFixed(2)}`, width - 5, y, { align: 'right' });
    y += 5;
  });

  y += 2;
  doc.line(5, y, width - 5, y);
  y += 6;
  
  doc.setFontSize(9);
  doc.text('SUBTOTAL:', 5, y);
  doc.text(`R$ ${(sale.subtotal + totalDiscount).toFixed(2)}`, width - 5, y, { align: 'right' });
  y += 5;

  // Exibindo desconto se aplicado
  if (totalDiscount > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('DESCONTOS:', 5, y);
    doc.text(`- R$ ${totalDiscount.toFixed(2)}`, width - 5, y, { align: 'right' });
    y += 5;
    doc.setFont('helvetica', 'normal');
  }

  if (sale.fee) {
    doc.text('TAXA ADICIONAL:', 5, y);
    doc.text(`R$ ${sale.fee.toFixed(2)}`, width - 5, y, { align: 'right' });
    y += 5;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL GERAL:', 5, y);
  doc.text(`R$ ${(sale.total || 0).toFixed(2)}`, width - 5, y, { align: 'right' });
  y += 8;

  // Exibindo valor pago e troco se for em dinheiro
  if (sale.paymentMethod === 'dinheiro') {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('VALOR RECEBIDO:', 5, y);
    doc.text(`R$ ${(sale.amountPaid || 0).toFixed(2)}`, width - 5, y, { align: 'right' });
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TROCO:', 5, y);
    doc.text(`R$ ${(sale.change || 0).toFixed(2)}`, width - 5, y, { align: 'right' });
    y += 8;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`FORMA PGTO: ${(sale.paymentMethod || '').toUpperCase()}`, 5, y);
  y += 6;

  // EXIBIÇÃO DAS PARCELAS DO CREDIÁRIO NO COMPROVANTE
  if (sale.installments && sale.installments.length > 0) {
    doc.line(5, y, width - 5, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('CRONOGRAMA DE VENCIMENTOS:', 5, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    sale.installments.forEach(inst => {
      const d = new Date(inst.dueDate).toLocaleDateString();
      doc.text(`Parc. ${inst.number} - Venc: ${d}`, 7, y);
      doc.text(`R$ ${inst.value.toFixed(2)}`, width - 5, y, { align: 'right' });
      y += 4;
    });
    y += 6;
  }

  // QR CODE DO PIX NO RODAPÉ (PARA PIX OU CREDIÁRIO)
  if (settings.pixQrUrl && (sale.paymentMethod === 'pix' || sale.paymentMethod === 'crediario')) {
    try {
      const pix = await loadImage(settings.pixQrUrl);
      if (pix) {
        y += 2;
        doc.line(5, y, width - 5, y);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('PAGUE COM PIX AQUI', width / 2, y, { align: 'center' });
        y += 5;
        doc.addImage(pix, 'PNG', (width - 40) / 2, y, 40, 40);
        y += 45;
      }
    } catch (e) {}
  }

  y += 10;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text('OBRIGADO PELA PREFERÊNCIA!', width / 2, y, { align: 'center' });
  doc.save(`recibo-tenda-jl-${(sale.id || '').substring(0, 8)}.pdf`);
};
