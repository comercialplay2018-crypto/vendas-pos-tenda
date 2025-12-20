
export interface Product {
  id: string;
  name: string;
  code: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
}

export interface Installment {
  number: number;
  value: number;
  dueDate: string;
  status?: 'pendente' | 'pago';
  paidAt?: number;
}

export type PaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'crediario';
export type SaleStatus = 'finalizada' | 'cancelada';

export interface Sale {
  id: string;
  timestamp: number;
  sellerId: string;
  sellerName: string;
  customerId?: string;
  customerName?: string;
  status: SaleStatus;
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    discount: number;
  }[];
  subtotal: number;
  fee?: number;
  total: number;
  amountPaid?: number;
  change?: number;
  paymentMethod: PaymentMethod;
  installments?: Installment[];
}

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'vendedor';
}

export interface Settings {
  companyName: string;
  logoUrl?: string;
  pixQrUrl?: string;
}
