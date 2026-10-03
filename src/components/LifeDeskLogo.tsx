import React, { useId } from 'react';

interface LifeDeskLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'mark' | 'monochrome';
  isProcessing?: boolean;
  state?: 'idle' | 'processing' | 'voice' | 'success';
  className?: string;
  onClick?: () => void;
}

export const LifeDeskLogo: React.FC<LifeDeskLogoProps> = ({
  size = 'md',
  variant = 'full',
  isProcessing = false,
  state,
  className = '',
  onClick,
}) => {
  const uid = useId().replace(/:/g, '');
  const activeState = state || (isProcessing ? 'processing' : 'idle');

  const pixelSizes = {
    sm: 24,
    md: 32,
    lg: 46,
    xl: 68,
  };

  const px = pixelSizes[size];

  return (
    <div
      onClick={onClick}
      className={`group inline-flex items-center gap-2.5 select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div
        className="relative shrink-0 transition-transform duration-200 group-hover:scale-[1.03]"
        style={{ width: px, height: px }}
      >
        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xs"
        >
          {variant === 'monochrome' ? (
            <>
              <path
                d="M60 22L102 44V76L60 98L18 76V44L60 22Z"
                className="fill-current opacity-20 stroke-current"
                strokeWidth="2.5"
              />
              <path d="M60 25L98 45L60 65L22 45L60 25Z" className="fill-current opacity-30" />
              <path d="M34 46L54 36V56L34 66Z" className="fill-current opacity-80" />
              <path d="M66 56L86 46V66L66 76Z" className="fill-current opacity-90" />
              <circle cx="60" cy="56" r="6" className="fill-current stroke-current" strokeWidth="2" />
              <circle cx="60" cy="56" r="2.5" className="fill-background" />
            </>
          ) : (
            <>
              <defs>
                <linearGradient
                  id={`ld-desk-${uid}`}
                  x1="20"
                  y1="20"
                  x2="100"
                  y2="100"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="55%" stopColor="var(--accent-hover)" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
                <linearGradient
                  id={`ld-left-${uid}`}
                  x1="30"
                  y1="30"
                  x2="60"
                  y2="70"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="var(--accent-light)" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
                <linearGradient
                  id={`ld-right-${uid}`}
                  x1="60"
                  y1="40"
                  x2="90"
                  y2="80"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
              </defs>

              {/* Isometric Desk Baseline */}
              <path
                d="M60 22L102 44V76L60 98L18 76V44L60 22Z"
                fill={`url(#ld-desk-${uid})`}
                stroke="var(--accent-hover)"
                strokeWidth="2"
                className="transition-all duration-300"
              />

              {/* Desk Top Chamfer (Upper Surface) */}
              <path
                d="M60 25L98 45L60 65L22 45L60 25Z"
                fill="var(--accent)"
                fillOpacity="0.45"
              />

              {/* Left Document Module */}
              <g className="transition-transform duration-300 group-hover:-translate-y-0.5">
                <path d="M34 46L54 36V56L34 66Z" fill={`url(#ld-left-${uid})`} />
                <path d="M34 46L54 36L44 31L24 41Z" fill="var(--accent-light)" fillOpacity="0.85" />
              </g>

              {/* Right Action / Knowledge Module */}
              <g className="transition-transform duration-300 group-hover:translate-y-0.5">
                <path d="M66 56L86 46V66L66 76Z" fill={`url(#ld-right-${uid})`} />
                <path d="M66 56L86 46L76 41L56 51Z" fill="#7dd3fc" fillOpacity="0.85" />
              </g>

              {/* Connecting orbit traces */}
              <path
                d="M44 51L54 56M66 56L76 61"
                stroke="#ffffff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeDasharray="2 2"
                className={
                  activeState === 'processing'
                    ? 'opacity-100 animate-pulse'
                    : 'opacity-80'
                }
              />

              {/* Voice / Processing subtle central node halo */}
              {(activeState === 'processing' || activeState === 'voice') && (
                <circle
                  cx="60"
                  cy="56"
                  r="13"
                  fill="var(--accent-light)"
                  fillOpacity="0.3"
                  className="animate-ping"
                />
              )}

              {activeState === 'success' && (
                <circle
                  cx="60"
                  cy="56"
                  r="11"
                  fill="#10b981"
                  fillOpacity="0.35"
                />
              )}

              {/* Central Organizing Hub Node */}
              <circle
                cx="60"
                cy="56"
                r="6.5"
                fill="#ffffff"
                stroke={activeState === 'success' ? '#10b981' : 'var(--accent)'}
                strokeWidth="2.5"
                className="transition-transform duration-300 group-hover:scale-110"
              />
              <circle
                cx="60"
                cy="56"
                r="2.8"
                fill={activeState === 'success' ? '#10b981' : 'var(--accent)'}
                className={activeState === 'processing' ? 'animate-pulse' : ''}
              />

              {/* Desk bevel rim */}
              <path
                d="M18 76L60 98L102 76"
                stroke={activeState === 'success' ? '#34d399' : 'var(--accent-light)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-75 group-hover:opacity-100 transition-opacity"
              />
            </>
          )}
        </svg>

        {activeState === 'processing' && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600" />
          </span>
        )}
      </div>

      {variant === 'full' && (
        <div className="flex flex-col text-left">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white leading-none">
            LifeDesk
          </span>
        </div>
      )}
    </div>
  );
};
