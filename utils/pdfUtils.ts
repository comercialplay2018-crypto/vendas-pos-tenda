
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

export const generateLabelPDF = async (product: Product, quantity: number) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const labelWidth = 60;
  const labelHeight = 30;
  const marginX = 10;
  const marginY = 10;
  const spacingX = 5;
  const spacingY = 5;
  
  const cols = Math.floor((210 - marginX * 2) / (labelWidth + spacingX)) || 1;
  const rows = Math.floor((297 - marginY * 2) / (labelHeight + spacingY)) || 1;
  const perPage = cols * rows;
  
  for (let i = 0; i < quantity; i++) {
    const pageIndex = Math.floor(i / perPage);
    const itemOnPageIndex = i % perPage;
    
    if (i > 0 && itemOnPageIndex === 0) doc.addPage();

    const col = itemOnPageIndex % cols;
    const row = Math.floor(itemOnPageIndex / cols);

    const x = marginX + col * (labelWidth + spacingX);
    const y = marginY + row * (labelHeight + spacingY);

    doc.setDrawColor(220);
    doc.rect(x, y, labelWidth, labelHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(product.name.substring(0, 35), x + 2, y + 5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(`CÓDIGO: ${product.code}`, x + 2, y + 10);
    
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`R$ ${(product.sellPrice || 0).toFixed(2)}`, x + labelWidth - 2, y + labelHeight - 4, { align: 'right' });
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${product.code}`;
    try {
      const qrBase64 = await loadImage(qrUrl);
      if (qrBase64) doc.addImage(qrBase64, 'PNG', x + 2, y + 12, 15, 15);
    } catch(e) {}
    
    doc.setTextColor(0);
  }

  doc.save(`etiquetas-${product.name}.pdf`);
};

export const generateReceiptPDF = async (sale: Sale, settings: Settings) => {
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, 500] 
  });

  const width = 80;
  let y = 10;

  // LOGO DA EMPRESA
  if (settings.logoUrl) {
    try {
      const logo = await loadImage(settings.logoUrl);
      if (logo) {
        doc.addImage(logo, 'PNG', (width - 25) / 2, y, 25, 25);
        y += 28;
      }
    } catch (e) {
      console.warn("Falha ao carregar logo no PDF");
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(settings.companyName || "Vibrant POS", width / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(8);
  doc.text(`CUPOM DE VENDA`, width / 2, y, { align: 'center' });
  y += 8;

  const date = new Date(sale.timestamp);
  doc.setFont('helvetica', 'normal');
  doc.text(`VENDA #${(sale.id || '').substring(0, 8)}`, 5, y);
  doc.text(date.toLocaleDateString(), width - 5, y, { align: 'right' });
  y += 4;
  doc.text(`HORÁRIO: ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, 5, y);
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
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('ITEM', 5, y);
  doc.text('QTD', width - 25, y, { align: 'right' });
  doc.text('TOTAL', width - 5, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  sale.items.forEach(item => {
    const unitPrice = item.price || 0;
    const itemDiscount = item.discount || 0;
    const lineTotal = (unitPrice - itemDiscount) * item.quantity;

    doc.setFont('helvetica', 'bold');
    doc.text(item.name.substring(0, 30), 5, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Un: R$ ${unitPrice.toFixed(2)} / Desc: R$ ${itemDiscount.toFixed(2)}`, 7, y);
    doc.setFontSize(8);
    doc.text(`${item.quantity}`, width - 25, y, { align: 'right' });
    doc.text(`R$ ${lineTotal.toFixed(2)}`, width - 5, y, { align: 'right' });
    y += 5;
  });

  y += 4;
  doc.line(5, y, width - 5, y);
  y += 6;
  
  doc.setFontSize(9);
  doc.text('SUBTOTAL:', 5, y);
  doc.text(`R$ ${(sale.subtotal || 0).toFixed(2)}`, width - 5, y, { align: 'right' });
  y += 5;

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

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`PAGAMENTO: ${(sale.paymentMethod || '').toUpperCase()}`, 5, y);
  y += 6;

  // DETALHAMENTO DE PARCELAS (CREDIÁRIO)
  if (sale.installments && sale.installments.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('DETALHE DO PARCELAMENTO:', 5, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    sale.installments.forEach(inst => {
      const d = new Date(inst.dueDate).toLocaleDateString();
      doc.text(`${inst.number}x - Venc: ${d}`, 7, y);
      doc.text(`R$ ${inst.value.toFixed(2)}`, width - 5, y, { align: 'right' });
      y += 4;
    });
    y += 6;
  }

  // PIX QR CODE - Exibir se existir no settings e se for PIX ou CREDIÁRIO
  if (settings.pixQrUrl && (sale.paymentMethod === 'pix' || sale.paymentMethod === 'crediario')) {
    try {
      const pix = await loadImage(settings.pixQrUrl);
      if (pix) {
        doc.line(5, y - 2, width - 5, y - 2);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('PAGAMENTO VIA PIX', width / 2, y, { align: 'center' });
        y += 4;
        // Centraliza a imagem do QR Code
        doc.addImage(pix, 'PNG', (width - 40) / 2, y, 40, 40);
        y += 45;
      }
    } catch (e) {
      console.warn("Falha ao carregar PIX no PDF");
    }
  }

  y += 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text('Obrigado pela preferência!', width / 2, y, { align: 'center' });

  doc.save(`vibrant-pos-${(sale.id || '').substring(0, 8)}.pdf`);
};
