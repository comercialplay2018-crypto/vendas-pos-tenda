
import { ref, set, push, get, update, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { Product, Customer, Sale, Settings, User } from "../types";

export interface UserWithPin extends User {
  pin: string;
}

const mapFirebaseData = (data: any) => {
  if (!data) return [];
  return Object.keys(data).map(key => {
    return {
      ...data[key],
      id: key
    };
  });
};

export const dbService = {
  // Products
  async saveProduct(product: Omit<Product, 'id'>) {
    const newRef = push(ref(db, 'products'));
    await set(newRef, { ...product, id: newRef.key });
  },
  async updateProduct(id: string, product: Partial<Product>) {
    await update(ref(db, `products/${id}`), product);
  },
  async deleteProduct(id: string) {
    await remove(ref(db, `products/${id}`));
  },
  onProductsChange(callback: (products: Product[]) => void) {
    return onValue(ref(db, 'products'), (snapshot) => {
      callback(mapFirebaseData(snapshot.val()));
    });
  },

  // Customers
  async saveCustomer(customer: Omit<Customer, 'id'>) {
    const newRef = push(ref(db, 'customers'));
    await set(newRef, { ...customer, id: newRef.key });
  },
  async updateCustomer(id: string, customer: Partial<Customer>) {
    await update(ref(db, `customers/${id}`), customer);
  },
  onCustomersChange(callback: (customers: Customer[]) => void) {
    return onValue(ref(db, 'customers'), (snapshot) => {
      callback(mapFirebaseData(snapshot.val()));
    });
  },

  // Sales
  async saveSale(sale: Omit<Sale, 'id'>) {
    try {
      const salesRef = ref(db, 'sales');
      const newSaleRef = push(salesRef);
      const saleId = newSaleRef.key;
      
      const cleanData = {
        ...sale,
        id: saleId,
        timestamp: Date.now()
      };
      
      await set(newSaleRef, cleanData);
      
      for (const item of sale.items) {
        if (!item.productId) continue;
        const prodRef = ref(db, `products/${item.productId}`);
        const snapshot = await get(prodRef);
        if (snapshot.exists()) {
          const currentQty = Number(snapshot.val().quantity) || 0;
          await update(prodRef, { quantity: Math.max(0, currentQty - item.quantity) });
        }
      }
      return saleId;
    } catch (error) {
      console.error("Erro ao salvar venda:", error);
      throw error;
    }
  },

  async deleteSale(saleId: string) {
    if (!saleId) return;
    try {
      const saleRef = ref(db, `sales/${saleId}`);
      await remove(saleRef);
      return true;
    } catch (error) {
      console.error("Erro ao excluir venda:", error);
      throw error;
    }
  },

  onSalesChange(callback: (sales: Sale[]) => void) {
    const salesRef = ref(db, 'sales');
    return onValue(salesRef, (snapshot) => {
      const data = snapshot.val();
      const list = mapFirebaseData(data);
      const sortedList = list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(sortedList as Sale[]);
    });
  },

  // Settings
  async saveSettings(settings: Settings) {
    await set(ref(db, 'settings'), settings);
  },
  onSettingsChange(callback: (settings: Settings) => void) {
    return onValue(ref(db, 'settings'), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : { companyName: 'Vibrant POS' });
    });
  },

  // Users
  onUsersChange(callback: (users: UserWithPin[]) => void) {
    return onValue(ref(db, 'users'), (snapshot) => {
      callback(mapFirebaseData(snapshot.val()));
    });
  }
};
