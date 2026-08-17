import React, { useState, useEffect } from 'react';
import cleanLogo from '../../assets/electsun-software-team-clean.jpg';

interface SplashScreenProps {
  onFinish?: () => void;
  minDurationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDurationMs = 2400
}) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const startTime = Date.now();
    const intervalTime = 30;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(100, Math.round((elapsed / minDurationMs) * 100));
      setProgress(rawProgress);

      if (elapsed >= minDurationMs) {
        clearInterval(timer);
        setIsFadingOut(true);
        setTimeout(() => {
          setIsVisible(false);
          if (onFinish) onFinish();
        }, 500);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [minDurationMs, onFinish]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#18181b] select-none transition-opacity duration-500 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center max-w-lg w-full px-6">
        {/* Logotipo Limpio y Grande */}
        <div className="w-full max-w-md mb-8 flex justify-center">
          <img
            src={cleanLogo}
            alt="Electsun Software Team"
            className="w-full h-auto max-h-56 object-contain block select-none pointer-events-none"
          />
        </div>

        {/* Barra de Carga Simple y Sobria */}
        <div className="w-64 max-w-xs space-y-2">
          <div className="w-full h-1 bg-[#27272a] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-zinc-500 font-mono">
            <span>Cargando...</span>
            <span>{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
