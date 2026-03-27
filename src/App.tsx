/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { CommandParser } from './commands/CommandParser';
import { MobileData, AudioState, MODEL, SAMPLE_RATE, SYSTEM_INSTRUCTION, controlMobileSystemTool, VOICE_MODULES } from './utils/Constants';
import { Mic, MicOff, Power, Shield, Zap, Activity, Volume2, Settings, Terminal, Battery, ShieldCheck, Wifi, Thermometer, Lightbulb, Send, Cpu, MessageSquare, ChevronDown, ChevronUp, HardDrive } from 'lucide-react';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(VOICE_MODULES[0].id);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [audioState, setAudioState] = useState<AudioState>({
    isListening: false,
    isSpeaking: false,
    volume: 0,
  });
  const [status, setStatus] = useState("STANDBY");
  const [mobileData, setMobileData] = useState<MobileData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("Awaiting command, Sir.");
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'jarvis', text: string }[]>([]);

  const aiRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const analyzerRef = useRef<AnalyserNode | null>(null);

  // --- Audio Utilities ---
  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output.buffer;
  };

  const base64ToFloat32 = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Int16Array(new Uint8Array(binary.split('').map(c => c.charCodeAt(0))).buffer);
    const floats = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      floats[i] = bytes[i] / 32768.0;
    }
    return floats;
  };

  const getAudioContext = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    }
    return audioContextRef.current;
  };

  // --- Audio Playback ---
  const playNextInQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) return;

    try {
      isPlayingRef.current = true;
      setAudioState(prev => ({ ...prev, isSpeaking: true }));

      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const chunk = audioQueueRef.current.shift()!;
      const buffer = audioContext.createBuffer(1, chunk.length, SAMPLE_RATE);
      buffer.copyToChannel(chunk, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      
      if (analyzerRef.current) {
        source.connect(analyzerRef.current);
      }

      source.onended = () => {
        isPlayingRef.current = false;
        if (audioQueueRef.current.length === 0) {
          setAudioState(prev => ({ ...prev, isSpeaking: false }));
        }
        playNextInQueue();
      };

      source.start();
    } catch (e) {
      console.error("Playback error", e);
      isPlayingRef.current = false;
      setAudioState(prev => ({ ...prev, isSpeaking: false }));
    }
  }, []);

  // --- Mobile API Integration ---
  const fetchMobileData = async () => {
    try {
      const res = await fetch("/api/mobile/status");
      const data = await res.json();
      setMobileData(data);
    } catch (e) { console.error("Mobile Data Error", e); }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/mobile/logs");
      const data = await res.json();
      setLogs(data);
    } catch (e) { console.error("Logs Error", e); }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMobileData();
      fetchLogs();
    }, 3000);

    // Auto-initialize JARVIS
    const init = async () => {
      await startSession();
      // Note: startMic might still require a user gesture in some browsers
      // but we'll attempt it here for 'always online' behavior.
      setIsRecording(true);
      startMic();
    };
    init();

    return () => clearInterval(interval);
  }, []);

  // --- Connection Logic ---
  const startSession = async () => {
    if (sessionRef.current) return;
    try {
      setStatus("INITIALIZING...");
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      aiRef.current = ai;

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [controlMobileSystemTool] }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice as any } },
          },
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setStatus("SYSTEM ONLINE");
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  audioQueueRef.current.push(base64ToFloat32(part.inlineData.data));
                  playNextInQueue();
                }
                if (part.text) {
                  setOutputText(part.text);
                  setChatHistory(prev => [...prev.slice(-4), { role: 'jarvis', text: part.text! }]);
                }
              }
            }

            // Handle Function Calls
            if (message.toolCall?.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "controlMobileSystem") {
                  try {
                    const response = await fetch("/api/mobile/control", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(call.args),
                    });
                    const result = await response.json();
                    session.sendToolResponse({
                      functionResponses: [{
                        name: "controlMobileSystem",
                        id: call.id,
                        response: { result: result.message }
                      }]
                    });
                    fetchMobileData();
                  } catch (e) {
                    console.error("Tool execution failed", e);
                  }
                }
              }
            }

            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setAudioState(prev => ({ ...prev, isSpeaking: false }));
            }
          },
          onclose: () => {
            setIsConnected(false);
            setStatus("RECONNECTING...");
            stopMic();
            // Auto-reconnect after a short delay
            setTimeout(() => {
              if (!sessionRef.current) {
                startSession().then(() => {
                  setIsRecording(true);
                  startMic();
                });
              }
            }, 3000);
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setStatus("ERROR: RECONNECTING...");
            setTimeout(() => {
              if (!sessionRef.current) {
                startSession().then(() => {
                  setIsRecording(true);
                  startMic();
                });
              }
            }, 5000);
          }
        }
      });

      sessionRef.current = session;
    } catch (error) {
      console.error("Failed to start JARVIS:", error);
      setStatus("ERROR: INITIALIZATION FAILED");
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setIsConnected(false);
    setStatus("SYSTEM OFFLINE");
    stopMic();
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;

    const command = CommandParser.parse(inputText);
    if (command) {
      CommandParser.execute(command);
      setOutputText(`Executing command: ${command.type}...`);
      setChatHistory(prev => [...prev.slice(-4), { role: 'user', text: inputText }]);
      setInputText("");
      return;
    }

    if (sessionRef.current && isConnected) {
      sessionRef.current.sendRealtimeInput({
        text: inputText
      });
      setChatHistory(prev => [...prev.slice(-4), { role: 'user', text: inputText }]);
      setOutputText(`Processing...`);
      setInputText("");
    } else {
      setOutputText("System offline. Please initialize JARVIS.");
    }
  };

  const handlePowerToggle = async () => {
    // Repurposed as a "Wake Up" or "Manual Reconnect" button
    if (!isConnected) {
      await startSession();
      setIsRecording(true);
      startMic();
    } else {
      // If already connected, just ensure mic is on
      setIsRecording(true);
      startMic();
      setStatus("SYSTEM ONLINE");
    }
  };

  const handleVoiceChange = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    setShowVoiceMenu(false);
    if (isConnected) {
      stopSession();
      // startSession will be triggered by the auto-reconnect logic or manually
      setStatus("UPDATING VOICE MODULE...");
      setTimeout(() => {
        startSession().then(() => {
          setIsRecording(true);
          startMic();
        });
      }, 500);
    }
  };

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  // --- Microphone Logic ---
  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      analyzerRef.current = analyzer;
      source.connect(analyzer);

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for UI
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setAudioState(prev => ({ ...prev, volume: rms }));

        // Send to Gemini
        if (sessionRef.current && isConnected && isRecording) {
          const pcmBuffer = floatTo16BitPCM(inputData);
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmBuffer)));
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      setAudioState(prev => ({ ...prev, isListening: true }));
    } catch (err) {
      console.error("Mic access denied:", err);
      setStatus("ERROR: MIC ACCESS DENIED");
      setIsRecording(false);
    }
  };

  const stopMic = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioState(prev => ({ ...prev, isListening: false, volume: 0 }));
  };

  // --- UI Components ---
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/10 overflow-hidden flex flex-col items-center">
      {/* Minimal Header */}
      <header className="w-full p-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/10'}`} />
          <span className="text-[9px] tracking-[0.4em] font-bold opacity-30 uppercase">JARVIS</span>
        </div>
        
        <div className="flex items-center gap-8">
          {/* Voice Module Selector */}
          <div className="relative">
            <button 
              onClick={() => setShowVoiceMenu(!showVoiceMenu)}
              className="flex items-center gap-2 text-[9px] opacity-20 hover:opacity-100 transition-opacity uppercase tracking-[0.3em] font-medium"
            >
              <Volume2 className="w-3 h-3" />
              <span>{selectedVoice}</span>
              {showVoiceMenu ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
            </button>
            
            <AnimatePresence>
              {showVoiceMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full right-0 mt-4 w-48 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl"
                >
                  <div className="p-2 flex flex-col gap-1">
                    {VOICE_MODULES.map((voice) => (
                      <button
                        key={voice.id}
                        onClick={() => handleVoiceChange(voice.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-white/5 ${selectedVoice === voice.id ? 'bg-white/10' : ''}`}
                      >
                        <p className="text-[9px] font-bold tracking-widest uppercase mb-1">{voice.name}</p>
                        <p className="text-[8px] opacity-40 leading-tight">{voice.description}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-8 text-[9px] opacity-20 uppercase tracking-[0.3em] font-medium">
            <div className="flex items-center gap-2">
              <HardDrive className="w-3 h-3" />
              <span>{mobileData?.storage?.used || 0}/{mobileData?.storage?.total || 0} GB</span>
            </div>
            <div className="flex items-center gap-2">
              <Battery className="w-3 h-3" />
              <span>{mobileData?.battery?.level || 0}%</span>
            </div>
            <span>{status}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center p-12 relative z-10">
        {/* Minimal Core Visualization */}
        <div className="relative mb-24">
          <motion.div 
            animate={{ 
              scale: audioState.isSpeaking ? [1, 1.03, 1] : isRecording ? [1, 1.01, 1] : 1,
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-40 h-40 flex items-center justify-center"
          >
            {/* Subtle Pulse Rings */}
            <AnimatePresence>
              {(audioState.isSpeaking || isRecording) && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                  className="absolute inset-0 border border-white/10 rounded-full"
                />
              )}
            </AnimatePresence>
            
            {/* Central Orb */}
            <motion.div 
              animate={{ 
                opacity: isConnected ? 1 : 0.1,
                boxShadow: audioState.isSpeaking 
                  ? `0 0 ${20 + audioState.volume * 100}px rgba(255, 255, 255, 0.1)` 
                  : isRecording
                  ? `0 0 30px rgba(255, 255, 255, 0.05)`
                  : `0 0 0px rgba(255, 255, 255, 0)`
              }}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-1000 ${
                isRecording ? 'bg-white/20' : 'bg-white/5'
              } border border-white/10`}
            >
              <div className={`w-1 h-1 bg-white rounded-full ${audioState.isSpeaking ? 'scale-[3]' : isRecording ? 'scale-[2] animate-pulse' : 'opacity-20'} transition-all duration-500`} />
            </motion.div>
          </motion.div>
        </div>

        {/* Chat / Output */}
        <div className="w-full flex flex-col gap-8 mb-16">
          <AnimatePresence mode="popLayout">
            {chatHistory.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1 - (chatHistory.length - 1 - i) * 0.3, y: 0 }}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`px-0 py-1 text-[11px] leading-relaxed max-w-[90%] ${
                  msg.role === 'user' ? 'text-white/40 text-right' : 'text-white/90'
                }`}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {chatHistory.length === 0 && (
            <div className="text-center">
              <p className="text-[11px] text-white/20 tracking-wide uppercase">{outputText}</p>
            </div>
          )}
        </div>

        {/* Minimal Power Control */}
        <button
          onClick={handlePowerToggle}
          className={`group p-8 rounded-full transition-all duration-700 ${
            isConnected ? 'bg-white text-black scale-90' : 'bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40'
          }`}
        >
          <Power className="w-5 h-5" />
        </button>
      </main>

      {/* Minimal Input Bar */}
      <footer className="w-full p-12 flex justify-center">
        <div className="w-full max-w-md relative">
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="COMMAND"
            className="w-full bg-transparent border-b border-white/5 px-0 py-4 text-[10px] tracking-[0.2em] focus:outline-none focus:border-white/20 transition-all placeholder:text-white/5 uppercase"
          />
          <button 
            onClick={handleSendText}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-white/10 hover:text-white/40 transition-colors"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </footer>
    </div>
  );
}
