
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, Package, Users, History, Settings as SettingsIcon, 
  LogOut, Plus, Search, Trash2, Edit3, Camera, Download, X, Loader2, 
  ShoppingBag, Upload, Image as ImageIcon, CheckSquare, Square, Save, 
  Sparkles, Wand2, Tent, TrendingUp, Filter, BarChart3, CalendarDays, Printer
} from 'lucide-react';
import { dbService, UserWithPin } from './services/dbService';
import { Product, Customer, Sale, User, Settings as SettingsType, PaymentMethod, Installment } from './types';
import { Scanner } from './components/Scanner';
import { generateLabelPDF, generateReceiptPDF } from './utils/pdfUtils';
import { GoogleGenAI } from "@google/genai";

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
  const [settings, setSettings] = useState<SettingsType>({ companyName: 'Vendas Tenda JL' });
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

  // AI State
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const dailyEarnings = useMemo(() => {
    const today = new Date().toLocaleDateString();
    return sales
      .filter(s => new Date(s.timestamp).toLocaleDateString() === today)
      .reduce((sum, s) => sum + s.total, 0);
  }, [sales]);

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

  const handleGenerateInsights = async () => {
    if (sales.length === 0) return alert("Não há vendas para analisar.");
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const salesSummary = sales.slice(0, 10).map(s => ({
        total: s.total,
        payment: s.paymentMethod,
        customer: s.customerName
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analise estas últimas 10 vendas e me dê 3 insights estratégicos curtos sobre o negócio: ${JSON.stringify(salesSummary)}. Responda em Português do Brasil.`,
        config: {
          systemInstruction: "Você é um consultor de negócios experiente, especializado em análise de dados de varejo. Seja direto e prático em seus insights.",
        },
      });
      alert("Insights da IA:\n\n" + (response.text || "Não foi possível gerar insights no momento."));
    } catch (error) {
      console.error("AI Error:", error);
      alert("Erro ao gerar insights com IA.");
    } finally {
      setIsAnalyzing(false);
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
      <div className="min-h-screen bg-gradient-to-br from-orange-500 via-pink-600 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border-t-8 border-orange-400">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-tr from-orange-500 to-pink-500 rounded-3xl flex items-center justify-center text-white shadow-xl rotate-3">
              <Tent size={48} strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-3xl font-black text-center mb-2 text-gray-800 tracking-tight">Tenda JL</h1>
          <p className="text-center text-gray-400 text-xs font-bold uppercase tracking-widest mb-8">Sistema de Vendas</p>
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <input type="text" placeholder="Usuário" value={loginData.username} onChange={(e) => setLoginData({...loginData, username: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold focus:border-orange-500 transition-all" required />
            <input type="password" placeholder="PIN" value={loginData.pin} onChange={(e) => setLoginData({...loginData, pin: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold focus:border-orange-500 transition-all" required />
            <button type="submit" disabled={isLoggingIn} className="w-full py-5 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-2xl font-black text-lg shadow-xl disabled:opacity-50 hover:brightness-110 active:scale-95 transition-all">
              {isLoggingIn ? <Loader2 className="animate-spin mx-auto" size={24} /> : 'INICIAR SESSÃO'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* SIDEBAR */}
      <nav className="hidden md:flex flex-col w-28 bg-white border-r shadow-xl sticky top-0 h-screen overflow-y-auto z-30">
        <div className="p-4 flex flex-col items-center gap-6 py-10 h-full">
          <div className="w-14 h-14 bg-gradient-to-tr from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center text-white rotate-6 shadow-lg mb-4">
            <Tent size={28} />
          </div>
          <div className="flex flex-col gap-4 flex-1 w-full px-2">
            <NavIcon icon={<ShoppingCart size={24}/>} active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} label="PDV" />
            <NavIcon icon={<Package size={24}/>} active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} label="Estoque" />
            <NavIcon icon={<Users size={24}/>} active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} label="Clientes" />
            <NavIcon icon={<History size={24}/>} active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} label="Vendas" />
            <NavIcon icon={<SettingsIcon size={24}/>} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Ajustes" />
          </div>
          <NavIcon icon={<LogOut size={24}/>} onClick={() => setCurrentUser(null)} label="Sair" color="text-red-400" />
        </div>
      </nav>

      {/* HEADER MOBILE */}
      <header className="md:hidden bg-white border-b p-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
            <Tent size={18} />
          </div>
          <div className="font-black text-gray-800 text-lg tracking-tight">Tenda JL</div>
        </div>
        <button onClick={() => setCurrentUser(null)} className="p-2 text-red-500 bg-red-50 rounded-lg"><LogOut size={20} /></button>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
            <div className="lg:col-span-8 space-y-6">
              {/* Daily Gain Card for Quick View */}
              <div className="bg-gradient-to-r from-orange-400 to-pink-500 p-6 rounded-[2.5rem] shadow-xl text-white flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase opacity-80 tracking-widest">Vendido Hoje</p>
                  <h3 className="text-3xl font-black">R$ {dailyEarnings.toFixed(2)}</h3>
                </div>
                <div className="bg-white/20 p-4 rounded-2xl">
                  <TrendingUp size={32} />
                </div>
              </div>

              <div className="relative z-[60]">
                <div className="flex gap-4 items-center bg-white p-4 rounded-3xl shadow-xl border focus-within:border-orange-500 transition-all">
                  <Search className="text-gray-300 ml-2" size={24} />
                  <input 
                    type="text" 
                    placeholder="Nome do produto ou código..." 
                    className="flex-1 p-2 outline-none font-bold" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                  />
                  <button onClick={() => setIsScannerOpen(true)} className="p-4 bg-gradient-to-tr from-orange-500 to-pink-500 text-white rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all"><Camera size={24}/></button>
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white rounded-[2rem] shadow-2xl overflow-hidden divide-y border mt-2 max-h-72 overflow-y-auto z-[100]">
                    {searchResults.map(product => (
                      <button key={product.id} onClick={() => addToCart(product)} className="w-full p-6 flex justify-between items-center hover:bg-orange-50 transition-colors">
                        <div className="text-left">
                          <p className="text-[10px] font-black text-orange-500 uppercase">{product.code}</p>
                          <p className="font-bold text-gray-800">{product.name}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-black text-xl">R$ {Number(product.sellPrice).toFixed(2)}</span>
                          <Plus className="text-orange-500" size={20} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {cart.map(item => (
                    <div key={item.product.id} className="p-6 bg-white rounded-[2.5rem] border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{item.product.code}</p>
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
                            <button onClick={() => updateCartItem(item.product.id, {qty: item.qty + 1})} className="w-8 h-8 bg-orange-500 text-white rounded-lg font-black shadow-sm">+</button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase">Desconto R$</label>
                          <input 
                            type="number" 
                            className="w-full p-2 bg-gray-50 border rounded-xl font-bold text-sm outline-none"
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
              ) : (
                <div className="flex flex-col items-center justify-center p-20 opacity-20">
                  <ShoppingBag size={80} className="mb-4" />
                  <p className="font-black uppercase tracking-widest">Carrinho Vazio</p>
                </div>
              )}
            </div>

            {/* Checkout Section */}
            <div className="lg:col-span-4">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6 border sticky top-8">
                <h2 className="font-black text-xl flex items-center gap-2"><ShoppingBag className="text-orange-500"/> Checkout</h2>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Cliente</label>
                    <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-orange-500" value={selectedCustomer?.id || ''} onChange={(e) => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)}>
                      <option value="">Consumidor Final</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Pagamento</label>
                    <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-orange-500" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value as PaymentMethod); setAmountReceived(''); }}>
                      <option value="pix">PIX</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="debito">Débito</option>
                      <option value="credito">Crédito</option>
                      <option value="crediario">Crediário (+5,5%)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t flex flex-col gap-2">
                  <div className="flex justify-between items-end">
                    <span className="text-gray-400 font-black text-[10px] uppercase">Total Geral</span>
                    <span className="text-3xl font-black text-gray-900">R$ {calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <button 
                  onClick={finishSale} 
                  disabled={isFinishing || cart.length === 0} 
                  className="w-full py-6 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-3xl font-black text-xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
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
            sales={sales}
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

        {activeTab === 'sales' && (
          <SalesHistory 
            sales={sales} 
            dailyEarnings={dailyEarnings}
            settings={settings} 
            onGenerateInsights={handleGenerateInsights} 
            isAnalyzing={isAnalyzing} 
          />
        )}
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
  <button onClick={onClick} className={`flex flex-col items-center gap-1 p-4 rounded-2xl w-full transition-all group ${active ? 'bg-gradient-to-tr from-orange-500 to-pink-500 text-white shadow-lg' : color || 'text-gray-400 hover:bg-orange-50 hover:text-orange-500'}`}>
    {icon}
    <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const MobileNavIcon = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center flex-1 py-2 gap-1 transition-all ${active ? 'text-orange-500' : 'text-gray-400'}`}>
    <div className={`p-2 rounded-xl ${active ? 'bg-orange-100' : ''}`}>{icon}</div>
    <span className="text-[8px] font-black uppercase">{label}</span>
  </button>
);

// INVENTORY VIEW COM CONSULTA POR PERÍODO E BOTÃO DE ETIQUETAS
const InventoryView = ({ products, sales, onSave, onDelete, onEdit, onAddNew, isModalOpen, setIsModalOpen, editingProduct }: any) => {
  const [formData, setFormData] = useState({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' });
  const [isConsultOpen, setIsConsultOpen] = useState(false);
  const [consultData, setConsultData] = useState({ productId: '', start: '', end: '' });
  const [consultResult, setConsultResult] = useState<number | null>(null);

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

  const handleConsult = () => {
    if (!consultData.productId || !consultData.start || !consultData.end) return alert("Preencha todos os campos da consulta.");
    const start = new Date(consultData.start).getTime();
    const end = new Date(consultData.end).getTime() + 86400000; // end of day

    const totalSold = sales
      .filter((s: Sale) => s.timestamp >= start && s.timestamp <= end)
      .reduce((sum: number, s: Sale) => {
        const item = s.items.find(i => i.productId === consultData.productId);
        return sum + (item ? item.quantity : 0);
      }, 0);
    
    setConsultResult(totalSold);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Estoque Tenda JL</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Controle de Produtos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsConsultOpen(true)} className="bg-gray-100 text-gray-600 px-6 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-gray-200 transition-all">
            <BarChart3 size={20}/> CONSULTAR VENDAS
          </button>
          <button onClick={onAddNew} className="bg-orange-500 text-white px-6 py-4 rounded-2xl font-black shadow-lg flex items-center gap-2 hover:scale-[1.02] transition-all">
            <Plus size={20}/> NOVO PRODUTO
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-6">Código</th>
                <th className="p-6">Nome</th>
                <th className="p-6">Custo</th>
                <th className="p-6">Venda</th>
                <th className="p-6">Estoque</th>
                <th className="p-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center opacity-20 font-black uppercase">Nenhum produto cadastrado</td></tr>
              ) : (
                products.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-6 font-mono font-bold text-orange-500">{p.code}</td>
                    <td className="p-6 font-bold text-gray-800">{p.name}</td>
                    <td className="p-6 font-bold text-gray-400">R$ {Number(p.buyPrice || 0).toFixed(2)}</td>
                    <td className="p-6 font-black">R$ {Number(p.sellPrice).toFixed(2)}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.quantity < 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        {p.quantity} un
                      </span>
                    </td>
                    <td className="p-6 flex justify-center gap-2">
                      <button onClick={() => generateLabelPDF(p, 1)} title="Imprimir 1 Etiqueta" className="p-3 text-orange-500 hover:bg-orange-50 rounded-xl transition-colors"><Printer size={18}/></button>
                      <button onClick={() => onEdit(p)} className="p-3 text-blue-400 hover:bg-blue-50 rounded-xl transition-colors"><Edit3 size={18}/></button>
                      <button onClick={() => confirm('Excluir?') && onDelete(p.id)} className="p-3 text-red-400 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CONSULTA VENDAS POR PERÍODO */}
      {isConsultOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2"><BarChart3 className="text-orange-500" /> Consulta por Período</h2>
              <button onClick={() => { setIsConsultOpen(false); setConsultResult(null); }} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase">Selecione o Produto</label>
                <select className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={consultData.productId} onChange={e=>setConsultData({...consultData, productId: e.target.value})}>
                  <option value="">Escolha um produto...</option>
                  {products.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Data Início</label>
                  <input type="date" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={consultData.start} onChange={e=>setConsultData({...consultData, start: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Data Fim</label>
                  <input type="date" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={consultData.end} onChange={e=>setConsultData({...consultData, end: e.target.value})} />
                </div>
              </div>
              <button onClick={handleConsult} className="w-full py-5 bg-orange-500 text-white font-black rounded-2xl shadow-xl mt-4 flex justify-center items-center gap-2">
                CALCULAR DESEMPENHO
              </button>
              
              {consultResult !== null && (
                <div className="mt-8 p-8 bg-orange-50 rounded-3xl text-center border-2 border-orange-100 animate-in zoom-in-95">
                  <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-1">Total de Unidades Vendidas</p>
                  <h4 className="text-5xl font-black text-orange-600">{consultResult}</h4>
                  <p className="text-[10px] font-bold text-orange-400 mt-2">No período selecionado</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required placeholder="Nome do Produto" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="Código" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})} />
                <input required placeholder="Venda (R$)" type="number" step="0.01" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.sellPrice} onChange={e=>setFormData({...formData, sellPrice: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="Custo (R$)" type="number" step="0.01" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.buyPrice} onChange={e=>setFormData({...formData, buyPrice: e.target.value})} />
                <input required placeholder="Estoque" type="number" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.quantity} onChange={e=>setFormData({...formData, quantity: e.target.value})} />
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="flex-1 py-5 bg-orange-500 text-white font-black rounded-2xl shadow-xl">
                  {editingProduct ? 'ATUALIZAR' : 'CADASTRAR'}
                </button>
                {editingProduct && (
                   <button type="button" onClick={() => generateLabelPDF(editingProduct, 1)} className="px-6 py-5 bg-orange-100 text-orange-600 rounded-2xl font-black shadow-sm flex items-center gap-2">
                     <Printer size={20}/>
                   </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// CUSTOMERS VIEW
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
          <h1 className="text-2xl font-black text-gray-800">Clientes Tenda JL</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Base de Dados</p>
        </div>
        <button onClick={onAddNew} className="bg-pink-600 text-white px-6 py-4 rounded-2xl font-black shadow-lg flex items-center gap-2 hover:scale-[1.02] transition-all">
          <Plus size={20}/> NOVO CLIENTE
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.map((c: any) => (
          <div key={c.id} className="bg-white p-6 rounded-[2rem] border shadow-sm flex items-center justify-between group hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-pink-100 text-pink-600 rounded-2xl flex items-center justify-center font-black text-2xl group-hover:bg-pink-600 group-hover:text-white transition-all">
                {c.name[0].toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-lg leading-tight">{c.name}</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-tighter">{c.contact || 'Sem contato'}</p>
              </div>
            </div>
            <button onClick={() => onEdit(c)} className="p-3 text-gray-300 hover:text-pink-500 hover:bg-pink-50 rounded-xl transition-all"><Edit3 size={18}/></button>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800">{editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <input required placeholder="Nome do Cliente" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <input placeholder="WhatsApp" className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={formData.contact} onChange={e=>setFormData({...formData, contact: e.target.value})} />
              <button type="submit" className="w-full py-5 bg-pink-600 text-white font-black rounded-2xl shadow-xl mt-4">
                SALVAR
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// SALES HISTORY COM FILTRO POR CLIENTE E HOJE
const SalesHistory = ({ sales, dailyEarnings, settings, onGenerateInsights, isAnalyzing }: { sales: Sale[], dailyEarnings: number, settings: SettingsType, onGenerateInsights: () => void, isAnalyzing: boolean }) => {
  const [customerFilter, setCustomerFilter] = useState('');
  
  const filteredSales = useMemo(() => {
    return sales.filter(s => 
      s.customerName?.toLowerCase().includes(customerFilter.toLowerCase())
    );
  }, [sales, customerFilter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-tr from-orange-500 to-pink-500 p-8 rounded-[2.5rem] shadow-xl text-white">
          <p className="text-[10px] font-black uppercase opacity-70 tracking-widest mb-1">Ganhos do Dia</p>
          <h3 className="text-4xl font-black">R$ {dailyEarnings.toFixed(2)}</h3>
          <p className="text-[8px] font-bold opacity-50 mt-2 uppercase">Vendas confirmadas até agora</p>
        </div>
        
        <div className="col-span-1 md:col-span-2 bg-white p-8 rounded-[2.5rem] border flex flex-col justify-center">
          <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border-2 border-transparent focus-within:border-orange-200 transition-all">
            <Filter className="text-gray-300" size={24} />
            <input 
              type="text" 
              placeholder="Filtrar por nome de cliente..." 
              className="bg-transparent flex-1 outline-none font-bold"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
            {customerFilter && <button onClick={() => setCustomerFilter('')} className="p-2 text-gray-300"><X size={16}/></button>}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-gray-800">Histórico Recente</h2>
        <button 
          onClick={onGenerateInsights} 
          disabled={isAnalyzing || sales.length === 0}
          className="bg-gray-100 text-gray-600 px-6 py-3 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-orange-50 hover:text-orange-600 transition-all disabled:opacity-50"
        >
          {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          INSIGHTS DA IA
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-6">Data</th>
                <th className="p-6">Cliente</th>
                <th className="p-6">Pagamento</th>
                <th className="p-6">Total</th>
                <th className="p-6 text-center">Cupom</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSales.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-gray-800">{new Date(s.timestamp).toLocaleDateString()}</div>
                    <div className="text-[10px] text-gray-400 font-black uppercase">{new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-6">
                    <div className="font-bold text-gray-700">{s.customerName || 'Consumidor Final'}</div>
                  </td>
                  <td className="p-6">
                    <span className="text-[10px] font-black px-3 py-1 bg-gray-100 rounded-lg uppercase">{s.paymentMethod}</span>
                  </td>
                  <td className="p-6 font-black text-xl text-gray-900">R$ {Number(s.total).toFixed(2)}</td>
                  <td className="p-6 text-center">
                    <button onClick={() => generateReceiptPDF(s, settings)} className="p-3 text-gray-400 hover:text-orange-500 transition-all"><Download size={20}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ settings, onSave }: { settings: SettingsType, onSave: (s: SettingsType) => void }) => {
  const [ls, setLs] = useState(settings);
  useEffect(() => { setLs(settings); }, [settings]);

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border shadow-2xl max-w-lg space-y-8">
      <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3"><SettingsIcon className="text-orange-500" /> Configurações</h2>
      <div className="space-y-6">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase">Nome da Empresa</label>
          <input className="w-full p-4 bg-gray-50 border rounded-2xl font-bold" value={ls.companyName} onChange={(e)=>setLs({...ls, companyName:e.target.value})} />
        </div>
      </div>
      <button onClick={() => onSave(ls)} className="w-full py-5 bg-orange-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all">SALVAR ALTERAÇÕES</button>
    </div>
  );
};

export default App;
