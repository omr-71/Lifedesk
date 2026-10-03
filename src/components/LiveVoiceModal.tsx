import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Volume2, AlertCircle } from 'lucide-react';
import { LiveVoiceSession } from '../services/voice';
import { LifeDeskLogo } from './LifeDeskLogo';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'speaking' | 'listening'
  >('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionRef = useRef<LiveVoiceSession | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      const session = new LiveVoiceSession({
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
        },
        onError: (err) => {
          setErrorMessage(err);
        },
        onInterrupted: () => {
          // Speech interrupted by user
        },
      });

      sessionRef.current = session;
      session.start();

      return () => {
        session.stop();
        sessionRef.current = null;
      };
    }
  }, [isOpen]);

  const handleClose = () => {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          aria-label="Close voice conversation"
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-2 pt-2 flex flex-col items-center">
          <LifeDeskLogo
            size="md"
            variant="mark"
            isProcessing={status === 'listening' || status === 'speaking'}
          />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-1">
            LifeDesk Voice
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
            Speak naturally to think through projects, review your desk, or organize tasks in real time.
          </p>
        </div>

        {/* Central Audio Waveform / Radar */}
        <div className="py-6 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {(status === 'listening' || status === 'speaking') && (
              <>
                <div
                  className={`absolute w-36 h-36 rounded-full border border-indigo-400/30 animate-ping ${
                    status === 'speaking' ? 'border-sky-400/40' : ''
                  }`}
                />
                <div
                  className={`absolute w-28 h-28 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 ${
                    status === 'speaking' ? 'animate-pulse bg-sky-500/20' : ''
                  }`}
                />
              </>
            )}

            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
                status === 'speaking'
                  ? 'bg-sky-600 text-white ring-4 ring-sky-300 dark:ring-sky-900'
                  : status === 'listening'
                  ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 dark:ring-indigo-900'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {status === 'speaking' ? (
                <Volume2 className="w-8 h-8 animate-pulse" />
              ) : status === 'listening' ? (
                <Mic className="w-8 h-8 animate-pulse" />
              ) : (
                <MicOff className="w-8 h-8" />
              )}
            </div>
          </div>
        </div>

        <div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {status === 'connecting'
              ? 'Starting voice session...'
              : status === 'connected' || status === 'listening'
              ? 'Listening... Speak anytime'
              : status === 'speaking'
              ? 'Speaking...'
              : 'Session ended'}
          </span>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition shadow-xs cursor-pointer"
          >
            End Voice Session
          </button>
        </div>
      </div>
    </div>
  );
};
