
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
  
  // Configurações para etiquetas 6x3cm (60x30mm)
  const labelWidth = 60;
  const labelHeight = 30;
  const marginX = 10;
  const marginY = 13;
  const spacingX = 2;
  const spacingY = 1;
  
  const cols = 3; // 60 * 3 = 180mm + espaços cabe no A4 (210mm)
  const rows = 9; // 30 * 9 = 270mm + espaços cabe no A4 (297mm)
  const perPage = cols * rows;
  
  for (let i = 0; i < quantity; i++) {
    const pageIndex = Math.floor(i / perPage);
    const itemOnPageIndex = i % perPage;
    
    if (i > 0 && itemOnPageIndex === 0) doc.addPage();

    const col = itemOnPageIndex % cols;
    const row = Math.floor(itemOnPageIndex / cols);

    const x = marginX + col * (labelWidth + spacingX);
    const y = marginY + row * (labelHeight + spacingY);

    // Borda da etiqueta (opcional, mas ajuda no corte)
    doc.setDrawColor(230);
    doc.rect(x, y, labelWidth, labelHeight);

    // QR Code no canto esquerdo
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${product.code}`;
    try {
      const qrBase64 = await loadImage(qrUrl);
      if (qrBase64) doc.addImage(qrBase64, 'PNG', x + 2, y + 5, 18, 18);
    } catch(e) {}

    // Nome do Produto (Centro/Direita)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(50, 50, 50);
    const splitName = doc.splitTextToSize(product.name.toUpperCase(), labelWidth - 24);
    doc.text(splitName, x + 22, y + 7);
    
    // Código do Produto
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(`COD: ${product.code}`, x + 22, y + 17);
    
    // Preço de Venda em destaque
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`R$ ${(product.sellPrice || 0).toFixed(2)}`, x + labelWidth - 2, y + labelHeight - 4, { align: 'right' });
    
    doc.setTextColor(0);
  }

  doc.save(`etiquetas-6x3-${product.name}.pdf`);
};

export const generateReceiptPDF = async (sale: Sale, settings: Settings) => {
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, 500] 
  });

  const width = 80;
  let y = 10;

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
  doc.text(settings.companyName || "Tenda JL", width / 2, y, { align: 'center' });
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

  if (settings.pixQrUrl && (sale.paymentMethod === 'pix' || sale.paymentMethod === 'crediario')) {
    try {
      const pix = await loadImage(settings.pixQrUrl);
      if (pix) {
        doc.line(5, y - 2, width - 5, y - 2);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('PAGAMENTO VIA PIX', width / 2, y, { align: 'center' });
        y += 4;
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

  doc.save(`tenda-jl-cupom-${(sale.id || '').substring(0, 8)}.pdf`);
};
