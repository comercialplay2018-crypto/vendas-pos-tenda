
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, Package, Users, History, Settings as SettingsIcon, 
  LogOut, Plus, Search, Trash2, Edit3, Camera, Download, X, Loader2, 
  ShoppingBag, Printer, TrendingUp, Filter, BarChart3, Tent, Sparkles, Calendar,
  CreditCard, CheckCircle2, Clock, Ban, ShieldCheck, ShieldAlert, UserPlus, Fingerprint,
  QrCode, ScanLine
} from 'lucide-react';
import { dbService, UserWithPin } from './services/dbService';
import { Product, Customer, Sale, User, Settings as SettingsType, PaymentMethod, Installment } from './types';
import { Scanner } from './components/Scanner';
import { generateLabelPDF, generateReceiptPDF, generateAllLabelsPDF, generateLoginCardPDF } from './utils/pdfUtils';
import { GoogleGenAI } from "@google/genai";

const APP_VERSION = "3.3.1-PRODUCTION";
const ADMIN_QR_KEY = "TENDA-JL-ADMIN-2025"; 

// LOGIN MESTRE PARA EMERGÊNCIA
const MASTER_ADMIN_USER = "ADMIN";
const MASTER_ADMIN_PIN = "202525";

const generateInstallments = (total: number, count: number): Installment[] => {
  const installments: Installment[] = [];
  const installmentValue = total / count;
  for (let i = 1; i <= count; i++) {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + i);
    installments.push({
      number: i,
      value: installmentValue,
      dueDate: dueDate.toISOString(),
      status: 'pendente'
    });
  }
  return installments;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [team, setTeam] = useState<UserWithPin[]>([]);
  const [loginData, setLoginData] = useState({ username: '', pin: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'customers' | 'sales' | 'settings' | 'crediario' | 'team'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<SettingsType>({ companyName: 'Vendas Tenda JL' });
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'product' | 'admin' | 'login'>('product');
  const [pendingVoidSaleId, setPendingVoidSaleId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const [cart, setCart] = useState<{ product: Product; qty: number; discount: number }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [installmentCount, setInstallmentCount] = useState<number>(1);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithPin | null>(null);

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
      .filter(s => s.status === 'finalizada' && new Date(s.timestamp).toLocaleDateString() === today)
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

  const handleScannerScan = async (code: string) => {
    if (scannerMode === 'product') {
      const p = products.find(prod => prod.code === code);
      if (p) addToCart(p);
      else alert("Produto não cadastrado!");
      setIsScannerOpen(false);
    } else if (scannerMode === 'admin') {
      if (code === ADMIN_QR_KEY) {
        if (pendingVoidSaleId) {
          await dbService.voidSale(pendingVoidSaleId);
          alert("AUTORIZADO: Venda estornada.");
        }
        setIsScannerOpen(false);
        setPendingVoidSaleId(null);
      } else {
        alert("Acesso Negado.");
      }
    } else if (scannerMode === 'login') {
      if (code.startsWith('TENDA-LOGIN|')) {
        const parts = code.split('|');
        const username = parts[1];
        const pin = parts[2];
        
        if (username.toUpperCase() === MASTER_ADMIN_USER && pin === MASTER_ADMIN_PIN) {
          setCurrentUser({ id: 'master', name: 'SUPER ADMIN', role: 'admin' });
          setIsScannerOpen(false);
          return;
        }

        const user = team.find(u => u.name.toLowerCase() === username.toLowerCase() && u.pin === pin);
        if (user) {
          setCurrentUser({ id: user.id, name: user.name, role: user.role });
          setIsScannerOpen(false);
        } else {
          alert("Acesso Inválido ou Usuário Removido.");
        }
      } else {
        alert("Este não é um QR Code de acesso válido.");
      }
    }
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
      alert("Selecione um cliente.");
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
      alert("Venda Concluída!");
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setIsFinishing(false);
    }
  };

  const handleGenerateInsights = async () => {
    if (sales.length === 0) {
      alert("Nenhuma venda disponível para análise.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const activeSales = sales.filter(s => s.status === 'finalizada').slice(0, 50);
      const salesSummary = activeSales.map(s => ({
        total: s.total,
        payment: s.paymentMethod,
        date: new Date(s.timestamp).toLocaleDateString(),
        customer: s.customerName
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Como um consultor de varejo experiente, analise estes dados de vendas recentes da loja "${settings.companyName}" e forneça 3 recomendações estratégicas curtas e acionáveis em Português para aumentar as vendas e fidelizar clientes. Dados: ${JSON.stringify(salesSummary)}`,
      });

      if (response.text) {
        alert("RELATÓRIO DE INSIGHTS IA:\n\n" + response.text);
      }
    } catch (error) {
      console.error("Erro na análise da IA:", error);
      alert("Não foi possível gerar o relatório de insights no momento.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    // Check para login mestre
    if (loginData.username.toUpperCase() === MASTER_ADMIN_USER && loginData.pin === MASTER_ADMIN_PIN) {
      setCurrentUser({ id: 'master', name: 'SUPER ADMIN', role: 'admin' });
      setIsLoggingIn(false);
      return;
    }

    const user = team.find(u => u.name.toLowerCase() === loginData.username.toLowerCase() && u.pin === loginData.pin);
    if (user) {
      setCurrentUser({ id: user.id, name: user.name, role: user.role });
    } else {
      alert("Login incorreto.");
    }
    setIsLoggingIn(false);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-600 via-rose-500 to-amber-500 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border-t-[12px] border-orange-600 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <button onClick={() => { setScannerMode('login'); setIsScannerOpen(true); }} className="p-4 bg-orange-50 text-orange-600 rounded-2xl hover:bg-orange-600 hover:text-white transition-all shadow-sm">
              <ScanLine size={24} />
            </button>
          </div>
          
          <div className="flex justify-center mb-10">
            {settings.logoUrl ? (
               <img src={settings.logoUrl} alt="Logo" className="w-24 h-24 object-contain shadow-2xl rounded-3xl" />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-tr from-orange-600 to-rose-500 rounded-3xl flex items-center justify-center text-white shadow-2xl rotate-3">
                <Tent size={56} strokeWidth={2.5} />
              </div>
            )}
          </div>
          <h1 className="text-4xl font-black text-center mb-2 text-gray-800 tracking-tighter uppercase">{settings.companyName || "Tenda JL"}</h1>
          <p className="text-center text-gray-400 text-[10px] font-black uppercase tracking-widest mb-10">PDV {APP_VERSION}</p>
          
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <input type="text" placeholder="USUÁRIO" value={loginData.username} onChange={(e) => setLoginData({...loginData, username: e.target.value})} className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-2xl outline-none font-black focus:border-orange-500 transition-all text-center" required />
            <input type="password" placeholder="PIN" value={loginData.pin} onChange={(e) => setLoginData({...loginData, pin: e.target.value})} className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-2xl outline-none font-black focus:border-orange-500 transition-all text-center" required />
            <button type="submit" disabled={isLoggingIn} className="w-full py-6 bg-gradient-to-r from-orange-600 to-rose-500 text-white rounded-[2rem] font-black text-xl shadow-xl hover:brightness-110 active:scale-95 transition-all">
              {isLoggingIn ? <Loader2 className="animate-spin mx-auto" size={28} /> : 'ENTRAR'}
            </button>
          </form>

          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="h-px w-24 bg-gray-100"></div>
            <button onClick={() => { setScannerMode('login'); setIsScannerOpen(true); }} className="flex items-center gap-3 text-orange-600 font-black text-xs uppercase tracking-widest py-3 px-6 bg-orange-50 rounded-full hover:scale-105 transition-all">
              <QrCode size={18}/> Acesso por Crachá
            </button>
          </div>
        </div>

        {/* Scanner disponível na tela de login */}
        {isScannerOpen && (
          <Scanner 
            onScan={handleScannerScan} 
            onClose={() => { setIsScannerOpen(false); setScannerMode('product'); }} 
            mode={scannerMode}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      <nav className="hidden md:flex flex-col w-28 bg-white border-r shadow-2xl sticky top-0 h-screen overflow-y-auto z-30">
        <div className="p-4 flex flex-col items-center gap-8 py-12 h-full">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} className="w-16 h-16 object-contain rounded-xl" />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-tr from-orange-600 to-rose-500 rounded-2xl flex items-center justify-center text-white rotate-6 shadow-xl mb-6">
              <Tent size={32} />
            </div>
          )}
          <div className="flex flex-col gap-6 flex-1 w-full px-2">
            <NavIcon icon={<ShoppingCart size={24}/>} active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} label="Caixa" />
            <NavIcon icon={<CreditCard size={24}/>} active={activeTab === 'crediario'} onClick={() => setActiveTab('crediario')} label="Crediário" />
            <NavIcon icon={<Package size={24}/>} active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} label="Estoque" />
            <NavIcon icon={<Users size={24}/>} active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} label="Clientes" />
            <NavIcon icon={<History size={24}/>} active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} label="Vendas" />
            {currentUser.role === 'admin' && <NavIcon icon={<UserPlus size={24}/>} active={activeTab === 'team'} onClick={() => setActiveTab('team')} label="Equipe" />}
            <NavIcon icon={<SettingsIcon size={24}/>} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Config" />
          </div>
          <NavIcon icon={<LogOut size={24}/>} onClick={() => setCurrentUser(null)} label="Sair" color="text-rose-400" />
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto pb-28 md:pb-10">
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-gradient-to-r from-orange-600 to-rose-500 p-8 rounded-[3rem] shadow-2xl text-white flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase opacity-70 tracking-widest mb-1">Caixa de Hoje</p>
                  <h3 className="text-4xl font-black text-white">R$ {dailyEarnings.toFixed(2)}</h3>
                </div>
                <div className="bg-white/20 p-5 rounded-3xl backdrop-blur-sm"><TrendingUp size={40} /></div>
              </div>

              <div className="relative z-[60]">
                <div className="flex gap-4 items-center bg-white p-6 rounded-[2.5rem] shadow-2xl border-2 border-transparent focus-within:border-orange-600 transition-all">
                  <Search className="text-gray-300 ml-2" size={28} />
                  <input type="text" placeholder="Buscar por nome ou código..." className="flex-1 p-2 outline-none font-bold text-lg" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <button onClick={() => { setScannerMode('product'); setIsScannerOpen(true); }} className="p-5 bg-gradient-to-tr from-orange-600 to-rose-500 text-white rounded-2xl shadow-lg"><Camera size={28}/></button>
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white rounded-[2rem] shadow-2xl overflow-hidden divide-y border mt-4 max-h-80 overflow-y-auto z-[100] border-orange-100">
                    {searchResults.map(product => (
                      <button key={product.id} onClick={() => addToCart(product)} className="w-full p-6 flex justify-between items-center hover:bg-orange-50 transition-colors">
                        <div className="text-left">
                          <p className="font-bold text-gray-800 text-lg">{product.name}</p>
                          <p className="text-[10px] font-black text-orange-600 uppercase mb-1">{product.code}</p>
                        </div>
                        <span className="font-black text-2xl">R$ {Number(product.sellPrice).toFixed(2)}</span>
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
                        <button onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))} className="p-3 text-rose-500 bg-rose-50 hover:bg-rose-100 transition-colors rounded-xl">
                          <Trash2 size={22}/>
                        </button>
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
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-24 opacity-10 grayscale">
                  <ShoppingBag size={120} className="mb-6" />
                  <p className="font-black text-2xl uppercase tracking-[0.2em]">Ponto de Venda Livre</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white p-10 rounded-[3rem] shadow-2xl space-y-8 border-2 border-orange-50 sticky top-10">
                <h2 className="font-black text-2xl flex items-center gap-3"><ShoppingBag className="text-orange-600" size={32}/> Finalizar</h2>
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
                      <option value="debito">Débito</option>
                      <option value="credito">Crédito</option>
                      <option value="crediario">Crediário Interno</option>
                    </select>
                  </div>
                  
                  {paymentMethod === 'dinheiro' && (
                    <div className="space-y-4 animate-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-orange-600 uppercase ml-2">Valor Recebido (R$)</label>
                        <input type="number" step="0.01" className="w-full p-5 bg-orange-50 rounded-2xl font-black text-2xl outline-none border-2 border-orange-200 focus:border-orange-600" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} placeholder="0.00" />
                      </div>
                      <div className="p-5 bg-green-50 rounded-2xl border-2 border-green-100 flex justify-between items-center">
                        <span className="text-[10px] font-black text-green-600 uppercase">Troco</span>
                        <span className="text-2xl font-black text-green-700">R$ {calculateChange().toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'crediario' && (
                    <div className="space-y-4 animate-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-orange-600 uppercase ml-2">Parcelamento</label>
                        <select className="w-full p-5 bg-orange-50 border-2 border-orange-200 rounded-2xl font-black text-xl outline-none focus:border-orange-600 text-orange-700" value={installmentCount} onChange={(e) => setInstallmentCount(Number(e.target.value))}>
                          {[...Array(12)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1}x de R$ {(calculateTotal() / (i + 1)).toFixed(2)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-8 border-t-2 border-dashed flex flex-col gap-2">
                  <div className="flex justify-between items-end">
                    <span className="text-gray-400 font-black text-[11px] uppercase">Total</span>
                    <span className="text-4xl font-black text-gray-900 tracking-tighter">R$ {calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
                <button 
                  onClick={finishSale} 
                  disabled={isFinishing || cart.length === 0} 
                  className="w-full py-8 bg-gradient-to-r from-orange-600 to-rose-500 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl hover:scale-[1.03] active:scale-95 transition-all flex justify-center items-center gap-3 disabled:opacity-50"
                >
                  {isFinishing ? <Loader2 className="animate-spin" size={32}/> : "FINALIZAR VENDA"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'crediario' && (
          <CrediarioManagement 
            sales={sales.filter(s => s.paymentMethod === 'crediario' && s.status === 'finalizada')} 
            customers={customers} 
            onUpdateInstallments={dbService.updateSaleInstallments}
          />
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

        {activeTab === 'team' && currentUser.role === 'admin' && (
          <TeamView 
            team={team} 
            onSave={(u: any) => editingUser ? dbService.updateUser(editingUser.id, u) : dbService.saveUser(u)}
            onDelete={dbService.deleteUser}
            onAddNew={() => { setEditingUser(null); setIsUserModalOpen(true); }}
            onEdit={(u: UserWithPin) => { setEditingUser(u); setIsUserModalOpen(true); }}
            isModalOpen={isUserModalOpen}
            setIsModalOpen={setIsUserModalOpen}
            editingUser={editingUser}
            settings={settings}
          />
        )}

        {activeTab === 'sales' && (
          <SalesHistory 
            sales={sales} 
            dailyEarnings={dailyEarnings} 
            settings={settings} 
            onGenerateInsights={handleGenerateInsights} 
            isAnalyzing={isAnalyzing} 
            onVoidAttempt={(saleId: string) => {
              setPendingVoidSaleId(saleId);
              setScannerMode('admin');
              setIsScannerOpen(true);
            }}
          />
        )}
        {activeTab === 'settings' && <SettingsView settings={settings} onSave={dbService.saveSettings} />}
      </main>

      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-white/95 backdrop-blur-2xl border border-gray-200 rounded-[2.5rem] shadow-2xl flex items-center justify-around p-3 z-[60]">
        <MobileNavIcon icon={<ShoppingCart/>} label="Caixa" active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} />
        <MobileNavIcon icon={<CreditCard/>} label="Crediário" active={activeTab === 'crediario'} onClick={() => setActiveTab('crediario')} />
        <MobileNavIcon icon={<Package/>} label="Estoque" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <MobileNavIcon icon={<Users/>} label="Clientes" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
        <MobileNavIcon icon={<History/>} label="Vendas" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
        {currentUser.role === 'admin' && <MobileNavIcon icon={<UserPlus/>} label="Equipe" active={activeTab === 'team'} onClick={() => setActiveTab('team')} />}
        <MobileNavIcon icon={<SettingsIcon/>} label="Menu" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </nav>

      {isScannerOpen && (
        <Scanner 
          onScan={handleScannerScan} 
          onClose={() => { setIsScannerOpen(false); setScannerMode('product'); setPendingVoidSaleId(null); }} 
          mode={scannerMode}
        />
      )}
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

const TeamView = ({ team, onSave, onDelete, onEdit, onAddNew, isModalOpen, setIsModalOpen, editingUser, settings }: any) => {
  const [formData, setFormData] = useState({ name: '', pin: '', role: 'vendedor' as 'vendedor' | 'admin' });
  useEffect(() => {
    if (editingUser) setFormData({ name: editingUser.name, pin: editingUser.pin, role: editingUser.role });
    else setFormData({ name: '', pin: '', role: 'vendedor' });
  }, [editingUser, isModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-black text-gray-800 tracking-tighter">Equipe</h1><p className="text-[11px] text-gray-400 font-black uppercase tracking-widest">Gestão de Vendedores</p></div>
        <button onClick={onAddNew} className="bg-orange-600 text-white px-8 py-4 rounded-[2rem] font-black shadow-xl flex items-center gap-2"><UserPlus size={20}/> NOVO USUÁRIO</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {team.map((u: any) => (
          <div key={u.id} className="bg-white p-6 rounded-[2.5rem] shadow-lg border-2 border-gray-50 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-black text-xl">{u.name[0].toUpperCase()}</div>
                <div>
                  <h3 className="font-black text-gray-800">{u.name}</h3>
                  <span className="text-[9px] font-black uppercase text-gray-400 px-2 py-0.5 bg-gray-50 border rounded-lg">{u.role}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onEdit(u)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit3 size={18}/></button>
                <button onClick={() => confirm('Remover acesso?') && onDelete(u.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={18}/></button>
              </div>
            </div>
            
            <button 
              onClick={() => generateLoginCardPDF(u, settings)}
              className="w-full py-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-3 text-gray-500 font-black text-[10px] uppercase hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-all"
            >
              <QrCode size={18}/> Gerar Crachá de Acesso
            </button>
          </div>
        ))}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl">
            <h2 className="text-2xl font-black mb-8">{editingUser ? 'Editar' : 'Novo'} Usuário</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required placeholder="NOME DO USUÁRIO" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <input required placeholder="PIN DE ACESSO (NÚMEROS)" maxLength={6} className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" value={formData.pin} onChange={e=>setFormData({...formData, pin: e.target.value})} />
              <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-orange-600" value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value as any})}>
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
              <div className="flex gap-4 mt-6">
                <button type="button" onClick={()=>setIsModalOpen(false)} className="flex-1 py-4 font-black text-gray-400">VOLTAR</button>
                <button type="submit" className="flex-1 py-4 bg-orange-600 text-white rounded-2xl font-black shadow-xl">SALVAR</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SalesHistory = ({ sales, dailyEarnings, settings, onGenerateInsights, isAnalyzing, onVoidAttempt }: any) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-tr from-orange-600 to-rose-500 p-8 rounded-[3rem] text-white shadow-xl">
          <p className="text-[11px] font-black uppercase opacity-70 mb-1">Caixa Ativo de Hoje</p>
          <h3 className="text-4xl font-black tracking-tighter">R$ {dailyEarnings.toFixed(2)}</h3>
          <p className="text-[10px] mt-2 opacity-60">* Não inclui canceladas</p>
        </div>
        <div className="bg-white p-8 rounded-[3rem] shadow-lg flex items-center justify-between">
          <h4 className="font-black text-gray-500 uppercase text-xs tracking-widest">Relatório IA</h4>
          <button onClick={onGenerateInsights} disabled={isAnalyzing} className="p-4 bg-gray-50 rounded-2xl text-orange-600 hover:bg-orange-600 hover:text-white transition-all shadow-sm">
            {isAnalyzing ? <Loader2 className="animate-spin" /> : <Sparkles size={24} />}
          </button>
        </div>
      </div>
      <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border-2 border-gray-50">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
              <tr><th className="p-6">Status</th><th className="p-6">Data</th><th className="p-6">Cliente</th><th className="p-6 text-right">Total</th><th className="p-6 text-center">Ações</th></tr>
            </thead>
            <tbody className="divide-y">
              {sales.map((s: Sale) => (
                <tr key={s.id} className={`transition-all ${s.status === 'cancelada' ? 'bg-gray-50 opacity-40 grayscale' : 'hover:bg-gray-50/50'}`}>
                  <td className="p-6">
                    {s.status === 'cancelada' ? (
                      <span className="bg-rose-100 text-rose-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase border border-rose-200 flex items-center gap-1 w-fit"><ShieldAlert size={10}/> Cancelada</span>
                    ) : (
                      <span className="bg-green-100 text-green-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase border border-green-200 flex items-center gap-1 w-fit"><CheckCircle2 size={10}/> Finalizada</span>
                    )}
                  </td>
                  <td className="p-6">
                    <div className="font-black text-gray-800">{new Date(s.timestamp).toLocaleDateString()}</div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase">{new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-6 font-bold text-gray-600">{s.customerName || 'Balcão'}</td>
                  <td className={`p-6 text-right font-black text-xl ${s.status === 'cancelada' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    R$ {Number(s.total).toFixed(2)}
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => generateReceiptPDF(s, settings)} 
                        className="p-3 text-gray-400 hover:text-orange-600 hover:bg-white rounded-xl transition-all border shadow-sm" 
                        title="Baixar Recibo"
                      >
                        <Download size={18}/>
                      </button>
                      {s.status === 'finalizada' && (
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVoidAttempt(s.id); }} 
                          className="px-5 py-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all font-black text-[10px] flex items-center gap-2 border border-rose-100 shadow-sm"
                        >
                          <Ban size={14}/> ESTORNAR
                        </button>
                      )}
                    </div>
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

const CrediarioManagement = ({ sales, customers, onUpdateInstallments }: any) => {
  const [filterCustomer, setFilterCustomer] = useState('');
  const filteredSales = useMemo(() => {
    return sales.filter((s: Sale) => s.customerName?.toLowerCase().includes(filterCustomer.toLowerCase()) && s.status !== 'cancelada');
  }, [sales, filterCustomer]);

  const togglePayment = async (sale: Sale, installmentNumber: number) => {
    if (!sale.id || !sale.installments) return;
    const newInstallments = sale.installments.map(inst => {
      if (inst.number === installmentNumber) {
        const isPaid = inst.status === 'pago';
        return { ...inst, status: (isPaid ? 'pendente' : 'pago') as 'pendente' | 'pago', paidAt: isPaid ? undefined : Date.now() };
      }
      return inst;
    });
    try { await onUpdateInstallments(sale.id, newInstallments); } catch (e) { alert("Erro ao atualizar parcela."); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div><h1 className="text-3xl font-black text-gray-800 tracking-tighter">Gestão de Crediário</h1><p className="text-[11px] text-gray-400 font-black uppercase tracking-widest">Controle Financeiro</p></div>
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-transparent focus-within:border-orange-600 transition-all flex items-center gap-4"><Search className="text-gray-300" /><input type="text" placeholder="Filtrar cliente..." className="flex-1 font-bold outline-none" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} /></div>
      <div className="space-y-6">
        {filteredSales.map((sale: Sale) => {
          const totalPaid = sale.installments?.filter(i => i.status === 'pago').reduce((sum, i) => sum + i.value, 0) || 0;
          const totalPending = (sale.total || 0) - totalPaid;
          return (
            <div key={sale.id} className="bg-white rounded-[3rem] p-8 shadow-xl border-2 border-gray-50 group hover:border-orange-200 transition-all">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                <div className="flex items-center gap-4"><div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600"><Users size={28} /></div><div><h3 className="text-xl font-black text-gray-800">{sale.customerName}</h3><p className="text-[10px] font-black text-gray-400 uppercase">Venda de {new Date(sale.timestamp).toLocaleDateString()}</p></div></div>
                <div className="flex gap-4"><div className="px-5 py-3 bg-green-50 rounded-2xl border border-green-100 text-center"><p className="text-[9px] font-black text-green-600 uppercase">Recebido</p><p className="font-black text-green-700">R$ {totalPaid.toFixed(2)}</p></div><div className="px-5 py-3 bg-rose-50 rounded-2xl border border-rose-100 text-center"><p className="text-[9px] font-black text-rose-600 uppercase">Pendente</p><p className="font-black text-rose-700">R$ {totalPending.toFixed(2)}</p></div></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sale.installments?.map(inst => (
                  <button key={inst.number} onClick={() => togglePayment(sale, inst.number)} className={`p-5 rounded-[2rem] border-2 transition-all flex flex-col gap-2 relative overflow-hidden ${inst.status === 'pago' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-100 hover:border-orange-300'}`}>
                    <div className="flex justify-between items-center w-full"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Parcela {inst.number}</span>{inst.status === 'pago' ? <CheckCircle2 size={18} /> : <Clock size={18} className="text-orange-400" />}</div>
                    <span className="text-lg font-black tracking-tighter">R$ {inst.value.toFixed(2)}</span>
                    <span className="text-[10px] font-bold opacity-60">Venc: {new Date(inst.dueDate).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InventoryView = ({ products, onSave, onDelete, onEdit, isModalOpen, setIsModalOpen, editingProduct, onPrintAll }: any) => {
  const [formData, setFormData] = useState({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' });
  useEffect(() => {
    if (editingProduct) setFormData({ name: editingProduct.name, code: editingProduct.code, sellPrice: String(editingProduct.sellPrice), buyPrice: String(editingProduct.buyPrice || ''), quantity: String(editingProduct.quantity) });
    else setFormData({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' });
  }, [editingProduct, isModalOpen]);
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave({ name: formData.name, code: formData.code, sellPrice: parseFloat(formData.sellPrice) || 0, buyPrice: parseFloat(formData.buyPrice) || 0, quantity: parseInt(formData.quantity) || 0 }); setIsModalOpen(false); };
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-black text-gray-800 tracking-tighter">Estoque</h1><p className="text-[11px] text-gray-400 font-black uppercase tracking-widest">Controle de Produtos</p></div>
        <div className="flex gap-3"><button onClick={onPrintAll} className="bg-white border-2 border-orange-100 text-orange-600 px-6 py-4 rounded-[2rem] font-black shadow-lg flex items-center gap-2"><Printer size={20}/> ETIQUETAS</button><button onClick={() => { setFormData({ name: '', code: '', sellPrice: '', buyPrice: '', quantity: '' }); setIsModalOpen(true); }} className="bg-orange-600 text-white px-8 py-4 rounded-[2rem] font-black shadow-2xl flex items-center gap-2 hover:scale-105 transition-all"><Plus size={20}/> NOVO ITEM</button></div>
      </div>
      <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
            <tr><th className="p-6">Produto</th><th className="p-6">Preço Venda</th><th className="p-6">Estoque</th><th className="p-6 text-center">Ações</th></tr>
          </thead>
          <tbody className="divide-y">
            {products.map((p: any) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-6"><p className="font-black text-gray-800">{p.name}</p><p className="text-[9px] font-mono text-orange-600 uppercase">{p.code}</p></td>
                <td className="p-6 font-black text-lg">R$ {Number(p.sellPrice).toFixed(2)}</td>
                <td className="p-6"><span className={`px-4 py-1 rounded-full text-[10px] font-black ${p.quantity < 5 ? 'bg-rose-100 text-rose-600' : 'bg-green-100 text-green-600'}`}>{p.quantity} UN</span></td>
                <td className="p-6 flex justify-center gap-2"><button onClick={() => onEdit(p)} className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Edit3 size={18}/></button><button onClick={() => confirm('Apagar?') && onDelete(p.id)} className="p-3 bg-rose-50 text-rose-600 rounded-xl"><Trash2 size={18}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-3xl">
            <h2 className="text-2xl font-black mb-8">{editingProduct ? 'Editar' : 'Novo'} Produto</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required placeholder="NOME DO PRODUTO" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <input required placeholder="CÓDIGO / SCANNER" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 ml-2">PREÇO DE COMPRA (Custo)</label>
                  <input required placeholder="0.00" type="number" step="0.01" className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-orange-600" value={formData.buyPrice} onChange={e=>setFormData({...formData, buyPrice: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-orange-600 ml-2">PREÇO DE VENDA</label>
                  <input required placeholder="0.00" type="number" step="0.01" className="w-full p-4 bg-orange-50 rounded-2xl font-bold outline-none border-2 border-orange-100 focus:border-orange-600" value={formData.sellPrice} onChange={e=>setFormData({...formData, sellPrice: e.target.value})} />
                </div>
              </div>
              <input required placeholder="QUANTIDADE EM ESTOQUE" type="number" className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-orange-600" value={formData.quantity} onChange={e=>setFormData({...formData, quantity: e.target.value})} />
              <div className="flex gap-4 mt-6">
                <button type="button" onClick={()=>setIsModalOpen(false)} className="flex-1 py-4 font-black text-gray-400">CANCELAR</button>
                <button type="submit" className="flex-1 py-4 bg-orange-600 text-white rounded-2xl font-black shadow-xl">SALVAR ITEM</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const CustomersView = ({ customers, onSave, onAddNew, onEdit, isModalOpen, setIsModalOpen, editingCustomer }: any) => {
  const [formData, setFormData] = useState({ name: '', contact: '' });
  useEffect(() => {
    if (editingCustomer) setFormData({ name: editingCustomer.name, contact: editingCustomer.contact });
    else setFormData({ name: '', contact: '' });
  }, [editingCustomer, isModalOpen]);
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); setIsModalOpen(false); };
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center"><div><h1 className="text-3xl font-black text-gray-800 tracking-tighter">Clientes</h1></div><button onClick={onAddNew} className="bg-rose-500 text-white px-8 py-4 rounded-[2rem] font-black shadow-xl flex items-center gap-2"><Plus size={20}/> CADASTRAR CLIENTE</button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {customers.map((c: any) => (
          <div key={c.id} className="bg-white p-6 rounded-[2.5rem] shadow-lg border-2 border-gray-50 flex items-center justify-between hover:border-orange-200 transition-all">
            <div className="flex items-center gap-4"><div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-black text-xl">{c.name[0]}</div><div><h3 className="font-black text-gray-800">{c.name}</h3><p className="text-[10px] text-gray-400 font-bold">{c.contact || 'S/ CONTATO'}</p></div></div>
            <button onClick={() => onEdit(c)} className="p-3 text-gray-300 hover:text-orange-600 transition-colors"><Edit3 size={20}/></button>
          </div>
        ))}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl">
            <h2 className="text-2xl font-black mb-8">Novo Cliente</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required placeholder="NOME COMPLETO" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-rose-500 outline-none" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} /><input placeholder="TELEFONE (WhatsApp)" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-rose-500 outline-none" value={formData.contact} onChange={e=>setFormData({...formData, contact: e.target.value})} /><button type="submit" className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black mt-6 shadow-xl">SALVAR CLIENTE</button><button type="button" onClick={()=>setIsModalOpen(false)} className="w-full py-2 font-black text-gray-400">VOLTAR</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsView = ({ settings, onSave }: any) => {
  const [ls, setLs] = useState(settings);
  return (
    <div className="max-w-xl mx-auto bg-white p-10 rounded-[3rem] shadow-2xl border-t-[10px] border-orange-600 space-y-8 animate-in slide-in-from-bottom-4">
      <h2 className="text-2xl font-black flex items-center gap-3"><SettingsIcon className="text-orange-600"/> Ajustes do PDV</h2>
      <div className="space-y-4">
        <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 ml-2">NOME DA EMPRESA</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" value={ls.companyName} onChange={e=>setLs({...ls, companyName: e.target.value})} /></div>
        <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 ml-2">URL DA LOGOMARCA (PNG)</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" placeholder="https://..." value={ls.logoUrl || ''} onChange={e=>setLs({...ls, logoUrl: e.target.value})} /></div>
        <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 ml-2">URL DO QR CODE PIX (Recebimentos)</label><input className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-orange-600 outline-none" placeholder="https://..." value={ls.pixQrUrl || ''} onChange={e=>setLs({...ls, pixQrUrl: e.target.value})} /></div>
      </div>
      <button onClick={() => onSave(ls)} className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black shadow-xl hover:brightness-110 active:scale-95 transition-all">SALVAR CONFIGURAÇÕES</button>
      <div className="text-center opacity-30 text-[9px] font-black tracking-widest mt-10">BUILD VERSION: {APP_VERSION}</div>
    </div>
  );
};

export default App;
