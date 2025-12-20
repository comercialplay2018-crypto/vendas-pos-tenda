
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import { X, RefreshCw, ShieldCheck, ShieldAlert, Fingerprint, KeyRound } from 'lucide-react';

interface ScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  mode?: 'product' | 'admin' | 'login';
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onClose, mode = 'product' }) => {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "reader";

  const isAdmin = mode === 'admin';
  const isLogin = mode === 'login';

  useEffect(() => {
    // Usamos um timeout curto para garantir que o React renderizou o div "reader" no DOM
    const initTimer = setTimeout(() => {
      const startScanner = async () => {
        try {
          const html5QrCode = new Html5Qrcode(scannerId);
          html5QrCodeRef.current = html5QrCode;

          const config = { 
            fps: 15, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0 
          };

          await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            (decodedText) => {
              onScan(decodedText);
            },
            () => {}
          );
          setIsInitializing(false);
        } catch (err: any) {
          console.error("Erro ao iniciar câmera:", err);
          setError("Não foi possível acessar a câmera. Verifique as permissões.");
          setIsInitializing(false);
        }
      };

      startScanner();
    }, 100);

    return () => {
      clearTimeout(initTimer);
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.warn);
      }
    };
  }, []);

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn("Erro ao parar scanner:", err);
      }
    }
    onClose();
  };

  const getThemeColors = () => {
    if (isAdmin) return 'bg-rose-950/90 border-rose-500 text-rose-500';
    if (isLogin) return 'bg-orange-950/90 border-orange-500 text-orange-500';
    return 'bg-black border-pink-500 text-pink-500';
  };

  const getHeaderIcon = () => {
    if (isAdmin) return <ShieldAlert className="text-rose-500 animate-pulse" size={24}/>;
    if (isLogin) return <KeyRound className="text-orange-500 animate-bounce" size={24}/>;
    return <ShieldCheck className="text-green-500" size={24}/>;
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-0 md:p-4 backdrop-blur-md ${isLogin ? 'bg-orange-950/40' : isAdmin ? 'bg-rose-950/40' : 'bg-black/40'}`}>
      <div className={`relative w-full h-full md:max-w-md md:h-auto md:rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border-4 ${getThemeColors().split(' ')[1]}`}>
        
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
          <div className="text-white">
            <div className="flex items-center gap-2">
              {getHeaderIcon()}
              <h2 className="font-black text-lg tracking-tight uppercase">
                {isLogin ? 'ACESSO RÁPIDO' : isAdmin ? 'AUTORIZAÇÃO REQUERIDA' : 'SCANNER DE PRODUTOS'}
              </h2>
            </div>
            <p className="text-[10px] uppercase font-bold text-white/70">
              {isLogin ? 'Escaneie seu crachá para entrar' : isAdmin ? 'Aproxime o Cartão do Administrador' : 'Aponte para o código de barras'}
            </p>
          </div>
          <button 
            onClick={stopScanner} 
            className="p-3 bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 bg-black relative flex items-center justify-center min-h-[450px]">
          <div id={scannerId} className="w-full h-full object-cover"></div>
          
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`w-64 h-64 border-2 rounded-3xl relative ${getThemeColors().split(' ')[1]}`}>
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br-lg"></div>
              <div className={`absolute top-1/2 left-0 right-0 h-0.5 animate-pulse ${getThemeColors().split(' ')[2].replace('text', 'bg')}`}></div>
            </div>
          </div>

          {isInitializing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4">
              <RefreshCw className="text-orange-500 animate-spin" size={48} />
              <p className="text-white font-black text-xs uppercase tracking-widest">Ativando Câmera...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-8 text-center">
              <div className="bg-red-500/20 text-red-500 p-6 rounded-3xl border border-red-500/30">
                <p className="font-bold mb-4">{error}</p>
                <button 
                  onClick={onClose}
                  className="bg-white text-black px-6 py-2 rounded-xl font-black text-xs"
                >
                  VOLTAR
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={`p-6 ${isLogin ? 'bg-orange-900' : isAdmin ? 'bg-rose-900' : 'bg-black/80'} text-center`}>
          <div className="flex items-center justify-center gap-2">
            {isLogin && <Fingerprint size={16} className="text-orange-300 animate-pulse"/>}
            <p className="text-white text-[11px] font-black uppercase tracking-widest">
              {isLogin ? 'RECONHECIMENTO DE CRACHÁ' : isAdmin ? 'ESTORNO PROTEGIDO - TENDA JL' : 'SISTEMA DE LEITURA INTELIGENTE'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
