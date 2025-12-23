
import { jsPDF } from "jspdf";
import { Product, Sale, Settings } from "../types";

const loadImage = (url: string | undefined): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return resolve(null);
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    const timeout = setTimeout(() => {
      img.src = "";
      resolve(null);
    }, 7000);

    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = url;
  });
};

const loadImageAsDataURL = (url: string | undefined): Promise<string> => {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || url.trim() === '') return resolve('');
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = url;
  });
};

const drawSingleLabel = async (doc: jsPDF, product: Product, x: number, y: number, width: number, height: number) => {
    doc.setDrawColor(220);
    doc.rect(x, y, width, height);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${product.code}`;
    try {
      const qrBase64 = await loadImageAsDataURL(qrUrl);
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

export const generateReceiptImage = async (sale: Sale, settings: Settings) => {
  const width = 450;
  
  // Cálculo de altura dinâmica mais robusto para evitar cortes
  let dynamicHeight = 350; // Cabeçalho + Dados Iniciais + Margens base
  if (settings.logoUrl) dynamicHeight += 150;
  dynamicHeight += sale.items.length * 60; // Espaço por item
  dynamicHeight += 250; // Totais + Forma de Pagamento
  if (sale.installments) dynamicHeight += (sale.installments.length * 30) + 100;
  if (settings.pixQrUrl && (sale.paymentMethod === 'pix' || sale.paymentMethod === 'crediario')) {
    dynamicHeight += 350; // Área do QR Code Pix
  }
  dynamicHeight += 100; // Rodapé final e respiro

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = dynamicHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fundo Branco Sólido
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, dynamicHeight);

  let y = 40;

  // Logo
  if (settings.logoUrl) {
    const logo = await loadImage(settings.logoUrl);
    if (logo) {
      const logoW = 140;
      const logoH = (logo.height * logoW) / logo.width;
      ctx.drawImage(logo, (width - logoW) / 2, y, logoW, logoH);
      y += logoH + 30;
    }
  }

  // Título Empresa
  ctx.fillStyle = "#000000";
  ctx.font = "900 26px Inter, Helvetica, Arial";
  ctx.textAlign = "center";
  ctx.fillText(settings.companyName.toUpperCase(), width / 2, y);
  y += 35;

  ctx.font = "bold 18px Inter, Helvetica, Arial";
  ctx.fillText("COMPROVANTE DE VENDA", width / 2, y);
  y += 50;

  // Dados do Pedido
  ctx.textAlign = "left";
  ctx.font = "14px Inter, Helvetica, Arial";
  const date = new Date(sale.timestamp);
  ctx.fillText(`PEDIDO: #${sale.id.substring(0, 8).toUpperCase()}`, 30, y);
  ctx.textAlign = "right";
  ctx.fillText(`${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, width - 30, y);
  y += 30;
  
  ctx.textAlign = "left";
  ctx.fillText(`VENDEDOR: ${sale.sellerName.toUpperCase()}`, 30, y);
  y += 30;

  if (sale.customerName) {
    ctx.fillText(`CLIENTE: ${sale.customerName.toUpperCase()}`, 30, y);
    y += 30;
  }

  // Linha divisória tracejada
  y += 10;
  ctx.beginPath();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#000000";
  ctx.moveTo(30, y);
  ctx.lineTo(width - 30, y);
  ctx.stroke();
  y += 40;

  // Cabeçalho dos Itens
  ctx.font = "bold 15px Inter, Helvetica, Arial";
  ctx.textAlign = "left";
  ctx.fillText("DESCRIÇÃO", 30, y);
  ctx.textAlign = "right";
  ctx.fillText("QTD", width - 130, y);
  ctx.fillText("TOTAL", width - 30, y);
  y += 30;

  // Lista de Itens
  ctx.font = "14px Inter, Helvetica, Arial";
  ctx.setLineDash([]);
  sale.items.forEach(item => {
    ctx.textAlign = "left";
    const lineTotal = (item.price - item.discount) * item.quantity;
    ctx.font = "bold 15px Inter, Helvetica, Arial";
    ctx.fillText(item.name.toUpperCase().substring(0, 28), 30, y);
    y += 20;
    ctx.font = "13px Inter, Helvetica, Arial";
    ctx.fillText(`${item.quantity} un x R$ ${item.price.toFixed(2)}`, 35, y);
    ctx.textAlign = "right";
    ctx.font = "bold 15px Inter, Helvetica, Arial";
    ctx.fillText(`R$ ${lineTotal.toFixed(2)}`, width - 30, y);
    y += 35;
  });

  // Linha de Totais
  y += 10;
  ctx.beginPath();
  ctx.setLineDash([5, 5]);
  ctx.moveTo(30, y);
  ctx.lineTo(width - 30, y);
  ctx.stroke();
  y += 45;

  ctx.textAlign = "left";
  ctx.font = "15px Inter, Helvetica, Arial";
  ctx.fillText("SUBTOTAL:", 30, y);
  ctx.textAlign = "right";
  ctx.fillText(`R$ ${sale.subtotal.toFixed(2)}`, width - 30, y);
  y += 30;

  if (sale.fee) {
    ctx.textAlign = "left";
    ctx.fillText("TAXA (SERVIÇO/JUROS):", 30, y);
    ctx.textAlign = "right";
    ctx.fillText(`R$ ${sale.fee.toFixed(2)}`, width - 30, y);
    y += 30;
  }

  ctx.textAlign = "left";
  ctx.font = "bold 24px Inter, Helvetica, Arial";
  ctx.fillText("TOTAL GERAL:", 30, y);
  ctx.textAlign = "right";
  ctx.fillText(`R$ ${sale.total.toFixed(2)}`, width - 30, y);
  y += 50;

  ctx.textAlign = "center";
  ctx.font = "bold 18px Inter, Helvetica, Arial";
  ctx.fillText(`FORMA DE PGTO: ${sale.paymentMethod.toUpperCase()}`, width / 2, y);
  y += 50;

  // Parcelas do Crediário
  if (sale.installments && sale.installments.length > 0) {
    ctx.font = "bold 15px Inter, Helvetica, Arial";
    ctx.fillText("PROGRAMAÇÃO DE PARCELAS", width / 2, y);
    y += 30;
    ctx.font = "14px Inter, Helvetica, Arial";
    sale.installments.forEach(inst => {
      ctx.textAlign = "left";
      ctx.fillText(`${inst.number}ª Parc. - ${new Date(inst.dueDate).toLocaleDateString()}`, 50, y);
      ctx.textAlign = "right";
      ctx.fillText(`R$ ${inst.value.toFixed(2)}`, width - 50, y);
      y += 25;
    });
    y += 20;
  }

  // QR Code Pix para Pagamento
  if (settings.pixQrUrl && (sale.paymentMethod === 'pix' || sale.paymentMethod === 'crediario')) {
    const pix = await loadImage(settings.pixQrUrl);
    if (pix) {
      ctx.textAlign = "center";
      ctx.font = "bold 14px Inter, Helvetica, Arial";
      ctx.fillText("ESCANEIE PARA PAGAR VIA PIX", width / 2, y);
      y += 20;
      ctx.drawImage(pix, (width - 180) / 2, y, 180, 180);
      y += 210;
    }
  }

  // Rodapé e Mensagem Final
  ctx.textAlign = "center";
  ctx.font = "italic 13px Inter, Helvetica, Arial";
  ctx.fillText("ESTE NÃO É UM DOCUMENTO FISCAL", width / 2, y);
  y += 20;
  ctx.font = "bold 14px Inter, Helvetica, Arial";
  ctx.fillText("OBRIGADO PELA PREFERÊNCIA!", width / 2, y);

  // Download da imagem PNG
  const link = document.createElement('a');
  link.download = `recibo-tenda-jl-${sale.id.substring(0, 8)}.png`;
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
};

export const generateLoginCardPDF = async (user: any, settings: Settings) => {
  const doc = new jsPDF({ unit: 'mm', format: [100, 150] });
  const width = 100;
  const height = 150;
  
  doc.setFillColor(234, 88, 12); 
  doc.rect(0, 0, width, height, 'F');
  
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, 10, 80, 130, 10, 10, 'F');
  
  let y = 25;
  
  if (settings.logoUrl) {
    try {
      const logo = await loadImageAsDataURL(settings.logoUrl);
      if (logo) {
        doc.addImage(logo, 'PNG', (width - 25) / 2, y, 25, 25);
        y += 30;
      }
    } catch (e) { y += 10; }
  } else {
    y += 10;
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(50, 50, 50);
  doc.text(settings.companyName.toUpperCase(), width/2, y, { align: 'center' });
  y += 10;
  
  doc.setFontSize(12);
  doc.text('CRACHÁ DE ACESSO', width/2, y, { align: 'center' });
  y += 15;
  
  const loginToken = `TENDA-LOGIN|${user.name}|${user.pin}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(loginToken)}`;
  
  try {
    const qr = await loadImageAsDataURL(qrUrl);
    if (qr) {
      doc.addImage(qr, 'PNG', (width - 45) / 2, y, 45, 45);
      y += 55;
    }
  } catch (e) { y += 10; }
  
  doc.setFontSize(18);
  doc.setTextColor(234, 88, 12);
  doc.text(user.name.toUpperCase(), width/2, y, { align: 'center' });
  y += 8;
  
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(user.role.toUpperCase(), width/2, y, { align: 'center' });
  
  doc.save(`cracha-${user.name.toLowerCase()}.pdf`);
};
