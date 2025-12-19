
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, Package, Users, History, Settings as SettingsIcon, 
  LogOut, Plus, Search, Trash2, Edit3, Camera, Download, X, Loader2, 
  ShoppingBag, Printer, TrendingUp, Filter, BarChart3, Tent, Sparkles
} from 'lucide-react';
import { dbService, UserWithPin } from './services/dbService';
import { Product, Customer, Sale, User, Settings as SettingsType, PaymentMethod, Installment } from './types';
import { Scanner } from './components/Scanner';
import { generateLabelPDF, generateReceiptPDF, generateAllLabelsPDF } from './utils/pdfUtils';
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
      unsubProds(); unsubCusts(); unsubSales(); unsubUsers(); unsubSettings();
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
    setCart(prev => prev.map(item => item.product.id === productId ? { ...item, ...updates } : item));
  };

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + ((Number(item.product.sellPrice) - Number(item.discount)) * Number(item.qty)), 0);
  const calculateFee = () => (paymentMethod === 'crediario' ? calculateSubtotal() * 0.055 : 0);
  const calculateTotal = () => calculateSubtotal() + calculateFee();
  const calculateChange = () => {
    const received = parseFloat(amountReceived) || 0;
    const total = calculateTotal();
    return Math.max(0, received - total);
  };

  const finishSale = async () => {
    if (isFinishing || cart.length === 0 || !currentUser) return;
    const total = calculateTotal();
    const received = parseFloat(amountReceived) || 0;

    if (paymentMethod === 'dinheiro' && received < total) {
      alert("Valor recebido insuficiente.");
      return;
    }

    if (paymentMethod === 'crediario' && !selectedCustomer) {
      alert("Selecione um cliente para venda no Crediário.");
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
          quantity: item.qty,
          price: Number(item.product.sellPrice),
          discount: item.discount
        })),
        subtotal: calculateSubtotal(),
        fee: calculateFee(),
        total: total,
        paymentMethod: paymentMethod,
        amountPaid: paymentMethod === 'dinheiro' ? received : total,
        change: paymentMethod === 'dinheiro' ? calculateChange() : 0,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        customerId: selectedCustomer?.id
      };

      const saleId = await dbService.saveSale(saleData);
      generateReceiptPDF({ ...saleData, id: saleId } as Sale, settings).catch(() => {});
      setCart([]); setSelectedCustomer(null); setPaymentMethod('pix'); setAmountReceived('');
      alert("Venda Finalizada!");
    } catch (e: any) {
      alert("Erro ao finalizar: " + e.message);
    } finally {
      setIsFinishing(false);
    }
  };

  // Fix: Implemented handleLoginSubmit to handle user authentication via PIN
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const user = team.find(u => u.name.toLowerCase() === loginData.username.toLowerCase() && u.pin === loginData.pin);
    if (user) {
      setCurrentUser({ id: user.id, name: user.name, role: user.role });
    } else {
      alert("Usuário ou PIN incorretos.");
    }
    setIsLoggingIn(false);
  };

  // Fix: Implemented handleGenerateInsights using Gemini 3 Flash to analyze sales data
  const handleGenerateInsights = async () => {
    if (sales.length === 0) {
      alert("Não há vendas para analisar.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const salesSummary = sales.slice(0, 30).map(s => ({
        total: s.total,
        items: s.items.length,
        method: s.paymentMethod,
        date: new Date(s.timestamp).toLocaleDateString()
      }));

      const prompt = `Analise os seguintes dados de vendas da loja "${settings.companyName}" e forneça 3 insights estratégicos curtos e práticos em português para o proprietário:
      
      Dados recentes de vendas: ${JSON.stringify(salesSummary)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      if (response.text) {
        alert("INSIGHTS DA IA TENDA JL:\n\n" + response.text);
      }
    } catch (error) {
      console.error("Erro ao gerar insights com IA:", error);
      alert("Ocorreu um erro ao processar os dados com Inteligência Artificial.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-600 via-rose-500 to-amber-500 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border-t-[12px] border-orange-600">
          <div className="flex justify-center mb-10">
            <div className="w-24 h-24 bg-gradient-to-tr from-orange-600 to-rose-500 rounded-3xl flex items-center justify-center text-white shadow-2xl rotate-3">
              <Tent size={56} strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-4xl font-black text-center mb-2 text-gray-800 tracking-tighter">Tenda JL</h1>
          <p className="text-center text-gray-400 text-[10px] font-black uppercase tracking-widest mb-10">Frente de Caixa Premium</p>
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <input type="text" placeholder="USUÁRIO" value={loginData.username} onChange={(e) => setLoginData({...loginData, username: e.target.value})} className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-2xl outline-none font-black focus:border-orange-500 transition-all text-center" required />
            <input type="password" placeholder="PIN" value={loginData.pin} onChange={(e) => setLoginData({...loginData, pin: e.target.value})} className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-2xl outline-none font-black focus:border-orange-500 transition-all text-center" required />
            <button type="submit" disabled={isLoggingIn} className="w-full py-6 bg-gradient-to-r from-orange-600 to-rose-500 text-white rounded-[2rem] font-black text-xl shadow-xl hover:brightness-110 active:scale-95 transition-all">
              {isLoggingIn ? <Loader2 className="animate-spin mx-auto" size={28} /> : 'ENTRAR NO SISTEMA'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* SIDEBAR */}
      <nav className="hidden md:flex flex-col w-28 bg-white border-r shadow-2xl sticky top-0 h-screen overflow-y-auto z-30">
        <div className="p-4 flex flex-col items-center gap-8 py-12 h-full">
          <div className="w-16 h-16 bg-gradient-to-tr from-orange-600 to-rose-500 rounded-2xl flex items-center justify-center text-white rotate-6 shadow-xl mb-6">
            <Tent size={32} />
          </div>
          <div className="flex flex-col gap-6 flex-1 w-full px-2">
            <NavIcon icon={<ShoppingCart size={24}/>} active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} label="Vendas" />
            <NavIcon icon={<Package size={24}/>} active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} label="Estoque" />
            <NavIcon icon={<Users size={24}/>} active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} label="Clientes" />
            <NavIcon icon={<History size={24}/>} active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} label="Relatórios" />
            <NavIcon icon={<SettingsIcon size={24}/>} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Ajustes" />
          </div>
          <NavIcon icon={<LogOut size={24}/>} onClick={() => setCurrentUser(null)} label="Sair" color="text-rose-400" />
        </div>
      </nav>

      {/* HEADER MOBILE */}
      <header className="md:hidden bg-white border-b p-5 flex justify-between items-center sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white">
            <Tent size={22} />
          </div>
          <div className="font-black text-gray-800 text-xl tracking-tighter uppercase">Tenda JL</div>
        </div>
        <button onClick={() => setCurrentUser(null)} className="p-3 text-rose-500 bg-rose-50 rounded-xl"><LogOut size={22} /></button>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-10 overflow-y-auto pb-28 md:pb-10">
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-gradient-to-r from-orange-600 to-rose-500 p-8 rounded-[3rem] shadow-2xl text-white flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase opacity-70 tracking-widest mb-1">Caixa do Dia</p>
                  <h3 className="text-4xl font-black">R$ {dailyEarnings.toFixed(2)}</h3>
                </div>
                <div className="bg-white/20 p-5 rounded-3xl backdrop-blur-sm"><TrendingUp size={40} /></div>
              </div>

              <div className="relative z-[60]">
                <div className="flex gap-4 items-center bg-white p-6 rounded-[2.5rem] shadow-2xl border-2 border-transparent focus-within:border-orange-600 transition-all">
                  <Search className="text-gray-300 ml-2" size={28} />
                  <input type="text" placeholder="Pesquisar produto ou código..." className="flex-1 p-2 outline-none font-bold text-lg" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <button onClick={() => setIsScannerOpen(true)} className="p-5 bg-gradient-to-tr from-orange-600 to-rose-500 text-white rounded-2xl shadow-lg hover:scale-105 transition-all"><Camera size={28}/></button>
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white rounded-[2rem] shadow-2xl overflow-hidden divide-y border mt-4 max-h-80 overflow-y-auto z-[100] border-orange-100">
                    {searchResults.map(product => (
                      <button key={product.id} onClick={() => addToCart(product)} className="w-full p-6 flex justify-between items-center hover:bg-orange-50 transition-colors">
                        <div className="text-left">
                          <p className="text-[10px] font-black text-orange-600 uppercase mb-1">{product.code}</p>
                          <p className="font-bold text-gray-800 text-lg">{product.name}</p>
                        </div>
                        <div className="flex items-center gap-6">
                          <span className="font-black text-2xl">R$ {Number(product.sellPrice).toFixed(2)}</span>
                          <div className="bg-orange-600 p-2 rounded-lg text-white"><Plus size={24} /></div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {cart.map(item => (
                    <div key={item.product.id} className="p-7 bg-white rounded-[2.5rem] border-2 border-gray-100 shadow-lg relative overflow-hidden group hover:border-orange-200 transition-all">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{item.product.code}</p>
                          <h4 className="font-black text-gray-800 text-xl leading-tight">{item.product.name}</h4>
                        </div>
                        <button onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))} className="p-3 text-gray-300 hover:text-rose-500 transition-colors bg-gray-50 rounded-xl"><X size={22}/></button>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Qtd</label>
                          <div className="flex items-center bg-gray-50 rounded-2xl p-2 border">
                            <button onClick={() => updateCartItem(item.product.id, {qty: Math.max(1, item.qty - 1)})} className="w-10 h-10 bg-white rounded-xl shadow-sm font-black text-xl">-</button>
                            <span className="flex-1 text-center font-black text-lg">{item.qty}</span>
                            <button onClick={() => updateCartItem(item.product.id, {qty: item.qty + 1})} className="w-10 h-10 bg-orange-600 text-white rounded-xl font-black shadow-sm text-xl">+</button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Desconto R$</label>
                          <input type="number" className="w-full p-4 bg-gray-50 border rounded-2xl font-black text-lg outline-none focus:border-orange-500" value={item.discount || ''} placeholder="0,00" onChange={(e) => updateCartItem(item.product.id, { discount: parseFloat(e.target.value) || 0 })} />
                        </div>
                      </div>
                      <div className="mt-6 pt-6 border-t flex justify-between items-center">
                        <span className="text-gray-400 font-black text-[10px] uppercase">Subtotal Item</span>
                        <span className="text-2xl font-black text-gray-900">R$ {((Number(item.product.sellPrice) - item.discount) * item.qty).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-24 opacity-10 grayscale">
                  <ShoppingBag size={120} className="mb-6" />
                  <p className="font-black text-2xl uppercase tracking-[0.2em]">Ponto de Venda Vazio</p>
                </div>
              )}
            </div>

            {/* Sidebar Checkout */}
            <div className="lg:col-span-4">
              <div className="bg-white p-10 rounded-[3rem] shadow-2xl space-y-8 border-2 border-orange-50 sticky top-10">
                <h2 className="font-black text-2xl flex items-center gap-3"><ShoppingBag className="text-orange-600" size={32}/> Checkout</h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Cliente</label>
                    <select className="w-full p-5 bg-gray-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-orange-600" value={selectedCustomer?.id || ''} onChange={(e) => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)}>
                      <option value="">Consumidor Final</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Pagamento</label>
                    <select className="w-full p-5 bg-gray-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-orange-600" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value as PaymentMethod); setAmountReceived(''); }}>
                      <option value="pix">PIX</option>
                      <option value="dinheiro">Dinheiro (Espécie)</option>
                      <option value="debito">Cartão de Débito</option>
                      <option value="credito">Cartão de Crédito</option>
                      <option value="crediario">Crediário Interno</option>
                    </select>
                  </div>

                  {/* CAMPO DE VALOR RECEBIDO EM DINHEIRO */}
                  {paymentMethod === 'dinheiro' && (
                    <div className="space-y-2 animate-in slide-in-from-top-4 duration-300">
                      <label className="text-[11px] font-black text-orange-600 uppercase ml-2">Valor Recebido (R$)</label>
                      <input 
                        type="number" 
                        placeholder="Ex: 100,00" 
                        className="w-full p-5 bg-orange-50 border-2 border-orange-200 rounded-2xl font-black text-2xl outline-none focus:border-orange-600 text-orange-700"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                      />
                      {parseFloat(amountReceived) > calculateTotal() && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex justify-between items-center">
                          <span className="text-[10px] font-black text-green-600 uppercase">Troco</span>
                          <span className="text-xl font-black text-green-700">R$ {calculateChange().toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-8 border-t-2 border-dashed flex flex-col gap-2">
                  <div className="flex justify-between items-end">
                    <span className="text-gray-400 font-black text-[11px] uppercase">Valor Final</span>
                    <span className="text-4xl font-black text-gray-900 tracking-tighter">R$ {calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <button 
                  onClick={finishSale} 
                  disabled={isFinishing || cart.length === 0} 
                  className="w-full py-8 bg-gradient-to-r from-orange-600 to-rose-500 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl hover:scale-[1.03] active:scale-95 transition-all flex justify-center items-center gap-3 disabled:opacity-50"
                >
                  {isFinishing ? <Loader2 className="animate-spin" size={32}/> : "FINALIZAR AGORA"}
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
            onPrintAll={() => generateAllLabelsPDF(products)}
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
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-white/95 backdrop-blur-2xl border border-gray-200 rounded-[2.5rem] shadow-2xl flex items-center justify-around p-3 z-[60]">
        <MobileNavIcon icon={<ShoppingCart/>} label="Vendas" active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} />
        <MobileNavIcon icon={<Package/>} label="Estoque" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <MobileNavIcon icon={<Users/>} label="Clientes" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
        <MobileNavIcon icon={<History/>} label="Relatórios" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
        <MobileNavIcon icon={<SettingsIcon/>} label="Menu" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </nav>

      {isScannerOpen && <Scanner onScan={(code) => { const p = products.find(prod => prod.code === code); if(p) addToCart(p); else alert("Código não encontrado!"); }} onClose={() => setIsScannerOpen(false)} />}
    </div>
  );
};

const NavIcon = ({ icon, active, onClick, label, color }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-2 p-5 rounded-3xl w-full transition-all group ${active ? 'bg-gradient-to-tr from-orange-600 to-rose-500 text-white shadow-2xl' : color || 'text-gray-400 hover:bg-orange-50 hover:text-orange-600'}`}>
    {icon}
    <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const MobileNavIcon = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center flex-1 py-3 gap-1 transition-all ${active ? 'text-orange-600 scale-110' : 'text-gray-400'}`}>
    <div className={`p-3 rounded-2xl ${active ? 'bg-orange-100 shadow-sm' : ''}`}>{icon}</div>
    <span className="text-[8px] font-black uppercase tracking-tighter">{label}</span>
  </button>
);

// INVENTORY VIEW
const InventoryView = ({ products, onSave, onDelete, onEdit, onAddNew, isModalOpen, setIsModalOpen, editingProduct, onPrintAll }: any) => {
  const [formData, setFormData] = useState({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' });

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name, code: editingProduct.code,
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
      name: formData.name, code: formData.code,
      sellPrice: parseFloat(formData.sellPrice) || 0,
      buyPrice: parseFloat(formData.buyPrice) || 0,
      quantity: parseInt(formData.quantity) || 0
    });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-800 tracking-tighter">Estoque Central</h1>
          <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest">Gestão de Produtos JL</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button onClick={onPrintAll} className="flex-1 md:flex-none bg-white text-orange-600 px-8 py-5 rounded-[2rem] font-black shadow-xl flex items-center justify-center gap-3 border-2 border-orange-50 hover:bg-orange-50 transition-all">
            <Printer size={22}/> TODAS ETIQUETAS
          </button>
          <button onClick={onAddNew} className="flex-1 md:flex-none bg-orange-600 text-white px-8 py-5 rounded-[2rem] font-black shadow-2xl flex items-center justify-center gap-3 hover:scale-105 transition-all">
            <Plus size={22}/> NOVO PRODUTO
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border-2 border-gray-100 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[11px] font-black text-gray-400 uppercase tracking-widest border-b-2">
              <tr>
                <th className="p-8">Código</th>
                <th className="p-8">Nome do Produto</th>
                <th className="p-8">Custo Unit.</th>
                <th className="p-8">Preço Venda</th>
                <th className="p-8">Estoque</th>
                <th className="p-8 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.length === 0 ? (
                <tr><td colSpan={6} className="p-32 text-center opacity-10 font-black text-3xl uppercase">Sem Produtos</td></tr>
              ) : (
                products.map((p: any) => (
                  <tr key={p.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="p-8 font-mono font-black text-orange-600">{p.code}</td>
                    <td className="p-8 font-black text-gray-800 text-lg">{p.name}</td>
                    <td className="p-8 font-bold text-gray-400">R$ {Number(p.buyPrice || 0).toFixed(2)}</td>
                    <td className="p-8 font-black text-xl">R$ {Number(p.sellPrice).toFixed(2)}</td>
                    <td className="p-8">
                      <div className={`inline-flex items-center px-5 py-2 rounded-2xl text-xs font-black uppercase ${p.quantity < 5 ? 'bg-rose-100 text-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.1)]' : 'bg-green-100 text-green-600 shadow-[0_0_10px_rgba(22,163,74,0.1)]'}`}>
                        {p.quantity} UN
                      </div>
                    </td>
                    <td className="p-8">
                      <div className="flex justify-center gap-3">
                        <button onClick={() => generateLabelPDF(p, 1)} title="Etiqueta Un." className="p-4 text-orange-600 bg-orange-50 rounded-2xl hover:bg-orange-100 transition-all"><Printer size={20}/></button>
                        <button onClick={() => onEdit(p)} className="p-4 text-blue-600 bg-blue-50 rounded-2xl hover:bg-blue-100 transition-all"><Edit3 size={20}/></button>
                        <button onClick={() => confirm('Apagar este produto?') && onDelete(p.id)} className="p-4 text-rose-600 bg-rose-50 rounded-2xl hover:bg-rose-100 transition-all"><Trash2 size={20}/></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PRODUTO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-3xl border-t-[10px] border-orange-600">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter">{editingProduct ? 'Editar' : 'Novo'} Produto</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-4 bg-gray-100 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all"><X size={24}/></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Nome Comercial</label>
                <input required placeholder="Nome do Produto" className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-orange-600" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Cód. Identificação</label>
                   <input required placeholder="CÓDIGO" className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-orange-600" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})} />
                </div>
                <div className="space-y-2">
                   <label className="text-[11px] font-black text-orange-600 uppercase ml-2">Preço de Venda</label>
                   <input required placeholder="R$ 0,00" type="number" step="0.01" className="w-full p-5 bg-orange-50 border-2 border-orange-100 rounded-3xl font-black text-2xl outline-none focus:border-orange-600 text-orange-700" value={formData.sellPrice} onChange={e=>setFormData({...formData, sellPrice: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Preço de Custo</label>
                   <input required placeholder="R$ 0,00" type="number" step="0.01" className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-orange-600" value={formData.buyPrice} onChange={e=>setFormData({...formData, buyPrice: e.target.value})} />
                </div>
                <div className="space-y-2">
                   <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Qtd em Estoque</label>
                   <input required placeholder="0" type="number" className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-orange-600" value={formData.quantity} onChange={e=>setFormData({...formData, quantity: e.target.value})} />
                </div>
              </div>
              <button type="submit" className="w-full py-6 bg-gradient-to-r from-orange-600 to-rose-500 text-white font-black text-xl rounded-3xl shadow-2xl hover:brightness-110 active:scale-95 transition-all mt-6">
                {editingProduct ? 'CONCLUIR ATUALIZAÇÃO' : 'EFETIVAR CADASTRO'}
              </button>
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
    if (editingCustomer) setFormData({ name: editingCustomer.name, contact: editingCustomer.contact });
    else setFormData({ name: '', contact: '' });
  }, [editingCustomer, isModalOpen]);
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); setIsModalOpen(false); };
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-800 tracking-tighter">Clientes Fidelizados</h1>
          <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest">Base de Dados Tenda JL</p>
        </div>
        <button onClick={onAddNew} className="bg-rose-500 text-white px-8 py-5 rounded-[2rem] font-black shadow-2xl flex items-center gap-3 hover:scale-105 transition-all">
          <Plus size={22}/> ADICIONAR CLIENTE
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {customers.map((c: any) => (
          <div key={c.id} className="bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-lg flex items-center justify-between group hover:border-orange-300 transition-all hover:shadow-2xl">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center font-black text-3xl group-hover:bg-orange-600 group-hover:text-white transition-all shadow-inner">
                {c.name[0].toUpperCase()}
              </div>
              <div>
                <h3 className="font-black text-gray-800 text-xl leading-tight">{c.name}</h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">{c.contact || 'S/ CONTATO'}</p>
              </div>
            </div>
            <button onClick={() => onEdit(c)} className="p-4 text-gray-300 hover:text-orange-600 hover:bg-orange-50 rounded-2xl transition-all"><Edit3 size={22}/></button>
          </div>
        ))}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl border-t-[10px] border-rose-500">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter">{editingCustomer ? 'Editar' : 'Novo'} Cliente</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-4 bg-gray-100 rounded-full hover:bg-rose-50 transition-all"><X size={24}/></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <input required placeholder="NOME COMPLETO" className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-rose-500" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <input placeholder="WHATSAPP / CELULAR" className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-rose-500" value={formData.contact} onChange={e=>setFormData({...formData, contact: e.target.value})} />
              <button type="submit" className="w-full py-6 bg-rose-500 text-white font-black text-xl rounded-3xl shadow-2xl hover:brightness-110 transition-all mt-6">FINALIZAR CADASTRO</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// SALES HISTORY
const SalesHistory = ({ sales, dailyEarnings, settings, onGenerateInsights, isAnalyzing }: any) => {
  const [customerFilter, setCustomerFilter] = useState('');
  const filteredSales = useMemo(() => sales.filter((s: Sale) => s.customerName?.toLowerCase().includes(customerFilter.toLowerCase())), [sales, customerFilter]);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-gradient-to-tr from-orange-600 to-rose-500 p-10 rounded-[3rem] shadow-2xl text-white">
          <p className="text-[11px] font-black uppercase opacity-70 tracking-widest mb-2">Total Vendido Hoje</p>
          <h3 className="text-5xl font-black tracking-tighter">R$ {dailyEarnings.toFixed(2)}</h3>
          <p className="text-[10px] font-bold opacity-50 mt-4 uppercase">Relatório em tempo real</p>
        </div>
        <div className="col-span-1 md:col-span-2 bg-white p-10 rounded-[3rem] border-2 border-gray-100 shadow-xl flex flex-col justify-center">
          <div className="flex items-center gap-5 bg-gray-50 p-6 rounded-3xl border-2 border-transparent focus-within:border-orange-300 transition-all shadow-inner">
            <Filter className="text-gray-300" size={30} />
            <input type="text" placeholder="Filtrar por nome de cliente..." className="bg-transparent flex-1 outline-none font-black text-lg" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} />
            {customerFilter && <button onClick={() => setCustomerFilter('')} className="p-2 text-gray-300 hover:text-rose-500"><X size={20}/></button>}
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-gray-800 tracking-tighter">Vendas Concluídas</h2>
        <button onClick={onGenerateInsights} disabled={isAnalyzing || sales.length === 0} className="bg-gray-100 text-gray-600 px-8 py-4 rounded-[2rem] font-black text-xs flex items-center gap-3 hover:bg-orange-600 hover:text-white transition-all disabled:opacity-50 shadow-sm">
          {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} INTELIGÊNCIA ARTIFICIAL
        </button>
      </div>
      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border-2 border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[11px] font-black text-gray-400 uppercase tracking-widest border-b-2">
              <tr>
                <th className="p-8">Horário</th>
                <th className="p-8">Cliente</th>
                <th className="p-8">Forma de Pagto</th>
                <th className="p-8">Valor Total</th>
                <th className="p-8 text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSales.map((s: any) => (
                <tr key={s.id} className="hover:bg-orange-50/20 transition-colors">
                  <td className="p-8">
                    <div className="font-black text-gray-800 text-lg">{new Date(s.timestamp).toLocaleDateString()}</div>
                    <div className="text-[10px] text-gray-400 font-black uppercase">{new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-8"><div className="font-black text-gray-700">{s.customerName || 'Venda Balcão'}</div></td>
                  <td className="p-8"><span className="text-[10px] font-black px-4 py-2 bg-gray-100 rounded-xl uppercase tracking-widest">{s.paymentMethod}</span></td>
                  <td className="p-8 font-black text-2xl text-gray-900">R$ {Number(s.total).toFixed(2)}</td>
                  <td className="p-8 text-center"><button onClick={() => generateReceiptPDF(s, settings)} className="p-5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-2xl transition-all shadow-sm"><Download size={24}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ settings, onSave }: any) => {
  const [ls, setLs] = useState(settings);
  return (
    <div className="bg-white p-12 rounded-[3rem] border-2 border-gray-100 shadow-3xl max-w-xl space-y-10 border-t-[10px] border-orange-600">
      <h2 className="text-3xl font-black text-gray-800 tracking-tighter flex items-center gap-4"><SettingsIcon className="text-orange-600" size={36} /> Configurações Gerais</h2>
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Razão Social / Nome da Loja</label>
          <input className="w-full p-6 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-xl outline-none focus:border-orange-600" value={ls.companyName} onChange={(e)=>setLs({...ls, companyName:e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-black text-gray-400 uppercase ml-2">Logo URL (Opcional)</label>
          <input className="w-full p-6 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-orange-600" placeholder="https://..." value={ls.logoUrl || ''} onChange={(e)=>setLs({...ls, logoUrl:e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-black text-gray-400 uppercase ml-2">QR Code PIX URL</label>
          <input className="w-full p-6 bg-gray-50 border-2 border-transparent rounded-3xl font-black text-lg outline-none focus:border-orange-600" placeholder="https://..." value={ls.pixQrUrl || ''} onChange={(e)=>setLs({...ls, pixQrUrl:e.target.value})} />
        </div>
      </div>
      <button onClick={() => onSave(ls)} className="w-full py-7 bg-orange-600 text-white font-black text-2xl rounded-3xl shadow-2xl hover:brightness-110 active:scale-95 transition-all">EFETUAR ALTERAÇÕES</button>
    </div>
  );
};

export default App;
