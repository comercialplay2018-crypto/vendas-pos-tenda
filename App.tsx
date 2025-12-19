
import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Package, Users, History, Settings as SettingsIcon, 
  LogOut, Plus, Search, Trash2, Edit3, Camera, Download, ChevronRight, Menu, X, Calendar, Lock, User as UserIcon, ShieldCheck, Loader2, Tag, Banknote, XCircle, CheckCircle2, ShoppingBag, ArrowRight, Upload, Image as ImageIcon, Minus, CheckSquare, Square, Save
} from 'lucide-react';
import { dbService, UserWithPin } from './services/dbService';
import { Product, Customer, Sale, User, Settings as SettingsType, PaymentMethod, Installment } from './types';
import { Scanner } from './components/Scanner';
import { generateLabelPDF, generateReceiptPDF } from './utils/pdfUtils';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [team, setTeam] = useState<UserWithPin[]>([]);
  const [loginData, setLoginData] = useState({ username: '', pin: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'customers' | 'sales' | 'settings'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<SettingsType>({ companyName: 'Vibrant POS' });
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const [cart, setCart] = useState<{ product: Product; qty: number; discount: number }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [installmentCount, setInstallmentCount] = useState<number>(1);

  // Modais
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const unsubProds = dbService.onProductsChange(setProducts);
    const unsubCusts = dbService.onCustomersChange(setCustomers);
    const unsubSales = dbService.onSalesChange(setSales);
    const unsubUsers = dbService.onUsersChange(setTeam);
    const unsubSettings = dbService.onSettingsChange(setSettings);
    return () => { 
      unsubProds(); 
      unsubCusts(); 
      unsubSales(); 
      unsubUsers();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setSearchResults(products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.code.toLowerCase().includes(searchQuery.toLowerCase())
      ));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, products]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { product, qty: 1, discount: 0 }];
    });
    setSearchQuery('');
  };

  const updateCartItem = (productId: string, updates: Partial<{qty: number, discount: number}>) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => {
      const price = Number(item.product.sellPrice) || 0;
      const discount = Number(item.discount) || 0;
      const qty = Number(item.qty) || 1;
      return sum + ((price - discount) * qty);
    }, 0);
  };
  
  const calculateFee = () => {
    if (paymentMethod === 'crediario') return calculateSubtotal() * 0.055;
    return 0;
  };

  const calculateTotal = () => {
    const total = calculateSubtotal() + calculateFee();
    return isNaN(total) ? 0 : total;
  };

  const calculateChange = () => {
    const received = parseFloat(amountReceived) || 0;
    const total = calculateTotal();
    return Math.max(0, received - total);
  };

  const generateInstallments = (total: number, count: number): Installment[] => {
    const installments: Installment[] = [];
    const val = total / count;
    for (let i = 1; i <= count; i++) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (30 * i));
      installments.push({
        number: i,
        value: Number(val.toFixed(2)),
        dueDate: dueDate.toISOString()
      });
    }
    return installments;
  };

  const finishSale = async () => {
    if (isFinishing) return;
    if (cart.length === 0) { alert("Adicione produtos ao carrinho."); return; }
    if (!currentUser) { alert("Você precisa estar logado."); return; }
    
    const total = calculateTotal();
    const received = parseFloat(amountReceived) || 0;

    if (paymentMethod === 'dinheiro' && received < total) {
      alert("Valor recebido insuficiente.");
      return;
    }

    if (paymentMethod === 'crediario' && !selectedCustomer) {
      alert("Selecione um cliente para realizar venda no Crediário.");
      return;
    }
    
    setIsFinishing(true);
    try {
      const saleData: any = {
        timestamp: Date.now(),
        sellerId: currentUser.id,
        sellerName: currentUser.name,
        status: 'finalizada' as const,
        items: cart.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: Number(item.qty) || 1,
          price: Number(item.product.sellPrice) || 0,
          discount: Number(item.discount) || 0
        })),
        subtotal: Number(calculateSubtotal().toFixed(2)),
        fee: Number(calculateFee().toFixed(2)),
        total: Number(total.toFixed(2)),
        paymentMethod: paymentMethod,
        amountPaid: paymentMethod === 'dinheiro' ? received : total,
        change: paymentMethod === 'dinheiro' ? calculateChange() : 0,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        customerId: selectedCustomer?.id
      };

      if (paymentMethod === 'crediario') {
        saleData.installments = generateInstallments(total, installmentCount);
      }

      const saleId = await dbService.saveSale(saleData);
      
      generateReceiptPDF({ ...saleData, id: saleId } as Sale, settings).catch(() => {});
      
      setCart([]);
      setSelectedCustomer(null);
      setPaymentMethod('pix');
      setAmountReceived('');
      setInstallmentCount(1);
      alert("Venda Finalizada com Sucesso!");
    } catch (e: any) {
      alert("Erro ao finalizar: " + e.message);
    } finally {
      setIsFinishing(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      if (loginData.username === 'admin' && loginData.pin === '1234') {
        setCurrentUser({ id: 'admin', name: 'Administrador Mestre', role: 'admin' });
      } else {
        const foundUser = team.find(u => u.name.toLowerCase() === loginData.username.toLowerCase() && u.pin === loginData.pin);
        if (foundUser) {
          setCurrentUser({ id: foundUser.id, name: foundUser.name, role: foundUser.role });
        } else {
          alert('Credenciais inválidas.');
        }
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-600 via-purple-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-tr from-pink-500 to-orange-400 rounded-3xl flex items-center justify-center text-white font-black text-4xl shadow-xl rotate-3">V</div>
          </div>
          <h1 className="text-3xl font-black text-center mb-8 text-gray-800 tracking-tight">VibrantPOS</h1>
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <input type="text" placeholder="Usuário" value={loginData.username} onChange={(e) => setLoginData({...loginData, username: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" required />
            <input type="password" placeholder="PIN" value={loginData.pin} onChange={(e) => setLoginData({...loginData, pin: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" required />
            <button type="submit" disabled={isLoggingIn} className="w-full py-5 bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-2xl font-black text-lg shadow-xl disabled:opacity-50">
              {isLoggingIn ? <Loader2 className="animate-spin mx-auto" size={24} /> : 'ACESSAR PDV'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* SIDEBAR - DESKTOP */}
      <nav className="hidden md:flex flex-col w-28 bg-white border-r shadow-xl sticky top-0 h-screen overflow-y-auto z-30">
        <div className="p-4 flex flex-col items-center gap-6 py-10 h-full">
          <div className="w-14 h-14 bg-gradient-to-tr from-pink-500 to-orange-400 rounded-2xl flex items-center justify-center text-white font-black text-2xl rotate-6 shadow-lg mb-4">V</div>
          <div className="flex flex-col gap-4 flex-1 w-full px-2">
            <NavIcon icon={<ShoppingCart size={24}/>} active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} label="Venda" />
            <NavIcon icon={<Package size={24}/>} active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} label="Estoque" />
            <NavIcon icon={<Users size={24}/>} active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} label="Clientes" />
            <NavIcon icon={<History size={24}/>} active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} label="Vendas" />
            <NavIcon icon={<SettingsIcon size={24}/>} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Ajustes" />
          </div>
          <NavIcon icon={<LogOut size={24}/>} onClick={() => setCurrentUser(null)} label="Sair" color="text-red-400" />
        </div>
      </nav>

      {/* HEADER - MOBILE */}
      <header className="md:hidden bg-white border-b p-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center text-white font-black text-sm">V</div>
          <div className="font-black text-gray-800 text-lg tracking-tight">{settings.companyName || 'VibrantPOS'}</div>
        </div>
        <button onClick={() => setCurrentUser(null)} className="p-2 text-red-500 bg-red-50 rounded-lg"><LogOut size={20} /></button>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
            <div className="lg:col-span-8 space-y-6">
              <div className="relative z-[60]">
                <div className="flex gap-4 items-center bg-white p-4 rounded-3xl shadow-xl border">
                  <Search className="text-gray-300 ml-2" size={24} />
                  <input 
                    type="text" 
                    placeholder="Buscar produto por nome ou código..." 
                    className="flex-1 p-2 outline-none font-bold" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="p-2 text-gray-300 hover:text-gray-600"><X size={20}/></button>
                  )}
                  <button onClick={() => setIsScannerOpen(true)} className="p-4 bg-gradient-to-tr from-pink-500 to-orange-400 text-white rounded-2xl shadow-lg"><Camera size={24}/></button>
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white rounded-[2rem] shadow-2xl overflow-hidden divide-y border mt-2 max-h-72 overflow-y-auto z-[100]">
                    {searchResults.map(product => (
                      <button key={product.id} onClick={() => addToCart(product)} className="w-full p-6 flex justify-between items-center hover:bg-pink-50 transition-colors">
                        <div className="text-left">
                          <p className="text-[10px] font-black text-pink-500 uppercase">{product.code}</p>
                          <p className="font-bold text-gray-800">{product.name}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-black text-xl">R$ {Number(product.sellPrice).toFixed(2)}</span>
                          <Plus className="text-pink-500" size={20} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {cart.map(item => (
                    <div key={item.product.id} className="p-6 bg-white rounded-[2.5rem] border shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-pink-500 uppercase tracking-widest">{item.product.code}</p>
                          <h4 className="font-bold text-gray-800 line-clamp-1">{item.product.name}</h4>
                        </div>
                        <button onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><X size={20}/></button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase">Quantidade</label>
                          <div className="flex items-center bg-gray-50 rounded-xl p-1">
                            <button onClick={() => updateCartItem(item.product.id, {qty: Math.max(1, item.qty - 1)})} className="w-8 h-8 bg-white rounded-lg shadow-sm font-black">-</button>
                            <span className="flex-1 text-center font-black text-sm">{item.qty}</span>
                            <button onClick={() => updateCartItem(item.product.id, {qty: item.qty + 1})} className="w-8 h-8 bg-pink-500 text-white rounded-lg font-black shadow-sm">+</button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase">Desconto R$</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="w-full p-2 bg-gray-50 border rounded-xl font-bold text-sm outline-none focus:border-pink-500"
                            value={item.discount || ''}
                            placeholder="0.00"
                            onChange={(e) => updateCartItem(item.product.id, { discount: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t flex justify-between items-center font-black">
                        <span className="text-gray-400 text-[10px] uppercase">Total Item</span>
                        <span className="text-gray-900">R$ {((Number(item.product.sellPrice) - item.discount) * item.qty).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery === '' && (
                <div className="flex flex-col items-center justify-center p-20 opacity-20">
                  <ShoppingBag size={80} className="mb-4" />
                  <p className="font-black uppercase tracking-widest">Carrinho Vazio</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6 border sticky top-8 z-40">
                <h2 className="font-black text-xl flex items-center gap-2"><ShoppingBag className="text-pink-500"/> Checkout</h2>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Cliente</label>
                    <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-pink-500" value={selectedCustomer?.id || ''} onChange={(e) => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)}>
                      <option value="">Consumidor Final</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Método de Pagamento</label>
                    <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-pink-500" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value as PaymentMethod); setAmountReceived(''); setInstallmentCount(1); }}>
                      <option value="pix">PIX</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="debito">Débito</option>
                      <option value="credito">Crédito</option>
                      <option value="crediario">Crediário (+5,5%)</option>
                    </select>
                  </div>

                  {paymentMethod === 'dinheiro' && (
                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Valor Recebido</label>
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-full p-4 bg-gray-50 border-2 border-pink-100 focus:border-pink-500 rounded-2xl text-lg font-black outline-none"
                          placeholder="0,00"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Troco</label>
                        <div className="w-full p-4 bg-green-50 text-green-600 rounded-2xl text-lg font-black flex items-center">
                          R$ {calculateChange().toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'crediario' && (
                    <div className="space-y-4 animate-in slide-in-from-top-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Número de Parcelas</label>
                        <select 
                          className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-pink-500" 
                          value={installmentCount} 
                          onChange={(e) => setInstallmentCount(Number(e.target.value))}
                        >
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                            <option key={n} value={n}>{n}x de R$ {(calculateTotal() / n).toFixed(2)}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-2xl space-y-2 max-h-40 overflow-y-auto border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase">Previsão de Vencimentos</p>
                        {generateInstallments(calculateTotal(), installmentCount).map(inst => (
                          <div key={inst.number} className="flex justify-between text-xs font-bold text-gray-700">
                            <span>Parcela {inst.number}</span>
                            <span className="text-gray-400">{new Date(inst.dueDate).toLocaleDateString()}</span>
                            <span>R$ {inst.value.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-gray-400 font-black text-[10px] uppercase">Total Geral</span>
                    <span className="text-3xl font-black text-gray-900">R$ {calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <button 
                  onClick={finishSale} 
                  disabled={isFinishing || cart.length === 0} 
                  className="w-full py-6 bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-3xl font-black text-xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex justify-center items-center gap-2"
                >
                  {isFinishing ? <Loader2 className="animate-spin" size={24}/> : "FINALIZAR VENDA"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <InventoryView 
            products={products} 
            onSave={(p: any) => editingProduct ? dbService.updateProduct(editingProduct.id, p) : dbService.saveProduct(p)} 
            onDelete={dbService.deleteProduct} 
            onEdit={(p: Product) => { setEditingProduct(p); setIsProductModalOpen(true); }}
            onAddNew={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
            isModalOpen={isProductModalOpen}
            setIsModalOpen={setIsProductModalOpen}
            editingProduct={editingProduct}
          />
        )}
        
        {activeTab === 'customers' && (
          <CustomersView 
            customers={customers} 
            onSave={(c: any) => editingCustomer ? dbService.updateCustomer(editingCustomer.id, c) : dbService.saveCustomer(c)} 
            onAddNew={() => { setEditingCustomer(null); setIsCustomerModalOpen(true); }}
            onEdit={(c: Customer) => { setEditingCustomer(c); setIsCustomerModalOpen(true); }}
            isModalOpen={isCustomerModalOpen}
            setIsModalOpen={setIsCustomerModalOpen}
            editingCustomer={editingCustomer}
          />
        )}

        {activeTab === 'sales' && <SalesHistory sales={sales} setSales={setSales} settings={settings} />}
        {activeTab === 'settings' && <SettingsView settings={settings} onSave={dbService.saveSettings} />}
      </main>

      {/* MOBILE NAV */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-[2rem] shadow-2xl flex items-center justify-around p-2 z-[60]">
        <MobileNavIcon icon={<ShoppingCart/>} label="Venda" active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} />
        <MobileNavIcon icon={<Package/>} label="Estoque" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <MobileNavIcon icon={<Users/>} label="Clientes" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
        <MobileNavIcon icon={<History/>} label="Vendas" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
        <MobileNavIcon icon={<SettingsIcon/>} label="Ajustes" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </nav>

      {isScannerOpen && <Scanner onScan={(code) => { const p = products.find(prod => prod.code === code); if(p) addToCart(p); else alert("Produto não cadastrado"); }} onClose={() => setIsScannerOpen(false)} />}
    </div>
  );
};

const NavIcon = ({ icon, active, onClick, label, color }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 p-4 rounded-2xl w-full transition-all group ${active ? 'bg-gradient-to-tr from-pink-500 to-orange-400 text-white shadow-lg' : color || 'text-gray-400 hover:bg-pink-50 hover:text-pink-500'}`}>
    {icon}
    <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const MobileNavIcon = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center flex-1 py-2 gap-1 transition-all ${active ? 'text-pink-500' : 'text-gray-400'}`}>
    <div className={`p-2 rounded-xl ${active ? 'bg-pink-100' : ''}`}>{icon}</div>
    <span className="text-[8px] font-black uppercase">{label}</span>
  </button>
);

// VIEW DE ESTOQUE MELHORADA COM MODAL
const InventoryView = ({ products, onSave, onDelete, onEdit, onAddNew, isModalOpen, setIsModalOpen, editingProduct }: any) => {
  const [formData, setFormData] = useState({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' });

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name,
        code: editingProduct.code,
        sellPrice: String(editingProduct.sellPrice),
        buyPrice: String(editingProduct.buyPrice || 0),
        quantity: String(editingProduct.quantity)
      });
    } else {
      setFormData({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' });
    }
  }, [editingProduct, isModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: formData.name,
      code: formData.code,
      sellPrice: parseFloat(formData.sellPrice) || 0,
      buyPrice: parseFloat(formData.buyPrice) || 0,
      quantity: parseInt(formData.quantity) || 0
    });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Estoque Global</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Sincronizado na Nuvem</p>
        </div>
        <button onClick={onAddNew} className="bg-pink-500 text-white px-6 py-4 rounded-2xl font-black shadow-lg flex items-center gap-2 hover:scale-[1.02] transition-all">
          <Plus size={20}/> NOVO PRODUTO
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-6">Código</th>
                <th className="p-6">Nome</th>
                <th className="p-6">Venda</th>
                <th className="p-6">Estoque</th>
                <th className="p-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.length === 0 ? (
                <tr><td colSpan={5} className="p-20 text-center opacity-20 font-black uppercase">Nenhum produto cadastrado</td></tr>
              ) : (
                products.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-6 font-mono font-bold text-pink-500">{p.code}</td>
                    <td className="p-6 font-bold text-gray-800">{p.name}</td>
                    <td className="p-6 font-black">R$ {Number(p.sellPrice).toFixed(2)}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.quantity < 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        {p.quantity} un
                      </span>
                    </td>
                    <td className="p-6 flex justify-center gap-2">
                      <button onClick={() => onEdit(p)} className="p-3 text-blue-400 hover:bg-blue-50 rounded-xl transition-colors"><Edit3 size={18}/></button>
                      <button onClick={() => confirm('Deseja excluir este produto?') && onDelete(p.id)} className="p-3 text-red-400 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Nome do Produto</label>
                <input required className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Código / EAN</label>
                  <input required className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Preço de Venda (R$)</label>
                  <input required type="number" step="0.01" className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.sellPrice} onChange={e=>setFormData({...formData, sellPrice: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Preço de Custo (R$)</label>
                  <input type="number" step="0.01" className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.buyPrice} onChange={e=>setFormData({...formData, buyPrice: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Estoque Atual</label>
                  <input required type="number" className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.quantity} onChange={e=>setFormData({...formData, quantity: e.target.value})} />
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-pink-500 text-white font-black rounded-2xl shadow-xl mt-4 flex justify-center items-center gap-2">
                <Save size={20}/> {editingProduct ? 'ATUALIZAR' : 'CADASTRAR'} NO ESTOQUE
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// VIEW DE CLIENTES MELHORADA
const CustomersView = ({ customers, onSave, onAddNew, onEdit, isModalOpen, setIsModalOpen, editingCustomer }: any) => {
  const [formData, setFormData] = useState({ name: '', contact: '' });

  useEffect(() => {
    if (editingCustomer) {
      setFormData({ name: editingCustomer.name, contact: editingCustomer.contact });
    } else {
      setFormData({ name: '', contact: '' });
    }
  }, [editingCustomer, isModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Base de Clientes</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Cadastro para Crediário e Fidelidade</p>
        </div>
        <button onClick={onAddNew} className="bg-purple-600 text-white px-6 py-4 rounded-2xl font-black shadow-lg flex items-center gap-2 hover:scale-[1.02] transition-all">
          <Plus size={20}/> NOVO CLIENTE
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.length === 0 ? (
          <div className="col-span-full p-20 text-center opacity-20 font-black uppercase">Nenhum cliente registrado</div>
        ) : (
          customers.map((c: any) => (
            <div key={c.id} className="bg-white p-6 rounded-[2rem] border shadow-sm flex items-center justify-between group hover:shadow-xl transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center font-black text-2xl group-hover:bg-purple-600 group-hover:text-white transition-all">
                  {c.name ? c.name[0].toUpperCase() : 'C'}
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg leading-tight">{c.name}</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tighter">{c.contact || 'Sem contato'}</p>
                </div>
              </div>
              <button onClick={() => onEdit(c)} className="p-3 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded-xl transition-all"><Edit3 size={18}/></button>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800">{editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Nome Completo</label>
                <input required className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} placeholder="Ex: João Silva" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">WhatsApp / Contato</label>
                <input className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={formData.contact} onChange={e=>setFormData({...formData, contact: e.target.value})} placeholder="(00) 00000-0000" />
              </div>
              <button type="submit" className="w-full py-5 bg-purple-600 text-white font-black rounded-2xl shadow-xl mt-4 flex justify-center items-center gap-2">
                <Save size={20}/> {editingCustomer ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR CADASTRO'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SalesHistory = ({ sales, setSales, settings }: { sales: Sale[], setSales: any, settings: SettingsType }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === sales.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sales.map(s => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    if (!window.confirm(`VOCÊ REALMENTE DESEJA EXCLUIR ${count} VENDA(S)?\nEsta ação é irreversível.`)) return;

    setIsDeleting(true);
    const originalSales = [...sales];
    const idsToProcess = [...selectedIds];

    setSales(sales.filter(s => !selectedIds.has(s.id)));
    setSelectedIds(new Set());

    try {
      for (const id of idsToProcess) {
        await dbService.deleteSale(id);
      }
      alert(`${count} venda(s) excluída(s) com sucesso.`);
    } catch (e: any) {
      alert("Houve um erro ao processar a exclusão: " + e.message);
      setSales(originalSales);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Histórico de Vendas</h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Gerencie e acompanhe seus registros</p>
        </div>
        
        {selectedIds.size > 0 && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] md:relative md:bottom-0 md:left-0 md:translate-x-0 bg-gray-900 text-white px-6 py-4 rounded-[2rem] shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-4 border-2 border-pink-500">
            <span className="font-black text-sm whitespace-nowrap">{selectedIds.size} selecionado(s)</span>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  const id = [...selectedIds][0];
                  const sale = sales.find(s => s.id === id);
                  if (sale) generateReceiptPDF(sale, settings);
                }}
                disabled={selectedIds.size !== 1}
                className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 disabled:opacity-30 transition-all flex items-center gap-2"
              >
                <Download size={18}/> <span className="text-[10px] font-black uppercase hidden lg:inline">PDF</span>
              </button>
              <button 
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="p-3 bg-red-500 hover:bg-red-600 rounded-xl text-white transition-all flex items-center gap-2"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>}
                <span className="text-[10px] font-black uppercase hidden lg:inline">Excluir</span>
              </button>
            </div>
            <button onClick={() => setSelectedIds(new Set())} className="p-2 text-gray-500 hover:text-white"><X size={20}/></button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-6 w-16">
                  <button onClick={toggleAll} className="w-6 h-6 flex items-center justify-center rounded-lg border-2 border-gray-200 transition-all">
                    {selectedIds.size === sales.length && sales.length > 0 ? <CheckSquare size={16} className="text-pink-500"/> : <Square size={16} className="text-gray-200"/>}
                  </button>
                </th>
                <th className="p-6">Data & Hora</th>
                <th className="p-6">Cliente</th>
                <th className="p-6">Pagamento</th>
                <th className="p-6">Total</th>
                <th className="p-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-32 text-center text-gray-300 font-black uppercase opacity-20">
                    <History size={64} className="mx-auto mb-4"/>
                    Sem registros para exibir
                  </td>
                </tr>
              ) : (
                sales.map(s => (
                  <tr key={s.id} className={`hover:bg-gray-50 transition-colors group ${selectedIds.has(s.id) ? 'bg-pink-50/30' : ''}`}>
                    <td className="p-6">
                      <button onClick={() => toggleSelect(s.id)} className={`w-6 h-6 flex items-center justify-center rounded-lg border-2 transition-all ${selectedIds.has(s.id) ? 'bg-pink-500 border-pink-500 text-white' : 'border-gray-200 text-transparent'}`}>
                        <CheckSquare size={14} />
                      </button>
                    </td>
                    <td className="p-6">
                      <div className="font-bold text-gray-800">{new Date(s.timestamp).toLocaleDateString()}</div>
                      <div className="text-[10px] text-gray-400 font-black uppercase">{new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </td>
                    <td className="p-6">
                      <div className="font-bold text-gray-700">{s.customerName || 'Consumidor Final'}</div>
                      <div className="text-[10px] text-pink-500 font-black uppercase tracking-tighter">ID: {s.id.substring(0, 10)}</div>
                    </td>
                    <td className="p-6">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase inline-block ${s.paymentMethod === 'pix' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {s.paymentMethod}
                      </span>
                    </td>
                    <td className="p-6 font-black text-xl text-gray-900">R$ {Number(s.total).toFixed(2)}</td>
                    <td className="p-6">
                      <div className="flex justify-center gap-3">
                        <button 
                          onClick={() => generateReceiptPDF(s, settings)} 
                          className="p-3 bg-white border text-gray-400 rounded-2xl hover:text-pink-500 hover:border-pink-200 transition-all flex items-center justify-center"
                          title="Baixar Cupom"
                        >
                          <Download size={18}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ settings, onSave }: { settings: SettingsType, onSave: (s: SettingsType) => void }) => {
  const [ls, setLs] = useState(settings);

  useEffect(() => {
    setLs(settings);
  }, [settings]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'pixQrUrl') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLs({ ...ls, [field]: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2">
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-2xl space-y-8">
        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3"><SettingsIcon className="text-pink-500" /> Configurações Gerais</h2>
        
        <div className="space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Nome Fantasia da Loja</label>
            <input className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-pink-500 outline-none rounded-2xl font-bold" value={ls.companyName} onChange={(e)=>setLs({...ls, companyName:e.target.value})} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border overflow-hidden flex items-center justify-center">
                {ls.logoUrl ? <img src={ls.logoUrl} className="w-full h-full object-contain" /> : <ImageIcon className="text-gray-200" size={32} />}
              </div>
              <div className="text-xs font-black uppercase">Logo da Empresa</div>
              <label className="w-full py-3 bg-white text-pink-500 border border-pink-100 rounded-xl text-xs font-black cursor-pointer hover:bg-pink-500 hover:text-white transition-all flex items-center justify-center gap-2">
                <Upload size={14} /> CARREGAR LOGO
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'logoUrl')} />
              </label>
            </div>

            <div className="p-6 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border overflow-hidden flex items-center justify-center">
                {ls.pixQrUrl ? <img src={ls.pixQrUrl} className="w-full h-full object-contain" /> : <ImageIcon className="text-gray-200" size={32} />}
              </div>
              <div className="text-xs font-black uppercase">QR Code PIX</div>
              <label className="w-full py-3 bg-white text-blue-500 border border-blue-100 rounded-xl text-xs font-black cursor-pointer hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-2">
                <Upload size={14} /> CARREGAR QR
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'pixQrUrl')} />
              </label>
            </div>
          </div>
        </div>

        <button onClick={() => { onSave(ls); alert("Configurações atualizadas na nuvem!"); }} className="w-full py-5 bg-gradient-to-tr from-pink-500 to-orange-400 text-white font-black rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest">Salvar Alterações</button>
      </div>
    </div>
  );
};

export default App;
