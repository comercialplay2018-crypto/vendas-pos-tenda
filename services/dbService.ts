
import { ref, set, push, get, update, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { Product, Customer, Sale, Settings, User, Installment } from "../types";

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
        status: 'finalizada',
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

  async voidSale(saleId: string) {
    if (!saleId) return;
    try {
      const saleRef = ref(db, `sales/${saleId}`);
      const snapshot = await get(saleRef);
      
      if (snapshot.exists()) {
        const saleData = snapshot.val();
        if (saleData.status === 'cancelada') return;

        if (saleData.items && Array.isArray(saleData.items)) {
          for (const item of saleData.items) {
            if (!item.productId) continue;
            const prodRef = ref(db, `products/${item.productId}`);
            const prodSnap = await get(prodRef);
            if (prodSnap.exists()) {
              const currentQty = Number(prodSnap.val().quantity) || 0;
              await update(prodRef, { quantity: currentQty + item.quantity });
            }
          }
        }

        await update(saleRef, { status: 'cancelada' });
        return true;
      }
    } catch (error) {
      console.error("Erro ao cancelar venda:", error);
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

  async updateSaleInstallments(saleId: string, installments: Installment[]) {
    try {
      await update(ref(db, `sales/${saleId}`), { installments });
    } catch (error) {
      console.error("Erro ao atualizar parcelas:", error);
      throw error;
    }
  },

  // Settings
  async saveSettings(settings: Settings) {
    await set(ref(db, 'settings'), settings);
  },
  onSettingsChange(callback: (settings: Settings) => void) {
    return onValue(ref(db, 'settings'), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : { companyName: 'Tenda JL' });
    });
  },

  // Users
  async saveUser(user: Omit<UserWithPin, 'id'>) {
    const newRef = push(ref(db, 'users'));
    await set(newRef, { ...user, id: newRef.key });
  },
  async updateUser(id: string, user: Partial<UserWithPin>) {
    await update(ref(db, `users/${id}`), user);
  },
  async deleteUser(id: string) {
    await remove(ref(db, `users/${id}`));
  },
  onUsersChange(callback: (users: UserWithPin[]) => void) {
    return onValue(ref(db, 'users'), (snapshot) => {
      callback(mapFirebaseData(snapshot.val()));
    });
  }
};
