/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { CommandParser } from './commands/CommandParser';
import { MobileData, AudioState, MODEL, SAMPLE_RATE, SYSTEM_INSTRUCTION, controlMobileSystemTool, VOICE_MODULES } from './utils/Constants';
import { Mic, MicOff, Power, Shield, Zap, Activity, Volume2, Settings, Terminal, Battery, ShieldCheck, Wifi, Thermometer, Lightbulb, Send, Cpu, MessageSquare, ChevronDown, ChevronUp, HardDrive, Bluetooth, Signal, LayoutDashboard, Lock, Terminal as TerminalIcon, X } from 'lucide-react';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(VOICE_MODULES[0].id);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [activeModule, setActiveModule] = useState<'core' | 'dashboard' | 'terminal' | 'security' | 'connectivity'>('core');
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

  const toggleConnectivity = async (type: 'wifi' | 'bluetooth', currentValue: string) => {
    const newValue = currentValue === 'OFF' || currentValue === 'ON' ? (currentValue === 'ON' ? 'OFF' : 'ON') : (currentValue === 'CONNECTED' ? 'OFF' : 'ON');
    const action = type === 'wifi' ? 'toggle-wifi' : 'toggle-bluetooth';
    
    try {
      await fetch("/api/mobile/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: "connectivity", action, value: newValue }),
      });
      fetchMobileData();
    } catch (e) {
      console.error("Failed to toggle connectivity", e);
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
  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6 p-8"
          >
            <div className="md:col-span-2 grid grid-cols-2 gap-6">
              {/* CPU Usage */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between aspect-square">
                <div className="flex justify-between items-start">
                  <Cpu className="w-5 h-5 opacity-40" />
                  <span className="text-[10px] opacity-20 uppercase tracking-widest">Processor</span>
                </div>
                <div>
                  <h3 className="text-4xl font-light tracking-tighter mb-1">{mobileData?.system?.cpu || 0}%</h3>
                  <p className="text-[9px] opacity-40 uppercase tracking-widest">CPU Load</p>
                </div>
              </div>
              {/* RAM Usage */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between aspect-square">
                <div className="flex justify-between items-start">
                  <Activity className="w-5 h-5 opacity-40" />
                  <span className="text-[10px] opacity-20 uppercase tracking-widest">Memory</span>
                </div>
                <div>
                  <h3 className="text-4xl font-light tracking-tighter mb-1">{mobileData?.system?.ram?.used || 0} GB</h3>
                  <p className="text-[9px] opacity-40 uppercase tracking-widest">RAM Allocation</p>
                </div>
              </div>
              {/* Temperature */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between aspect-square">
                <div className="flex justify-between items-start">
                  <Thermometer className="w-5 h-5 opacity-40" />
                  <span className="text-[10px] opacity-20 uppercase tracking-widest">Thermal</span>
                </div>
                <div>
                  <h3 className="text-4xl font-light tracking-tighter mb-1">{mobileData?.system?.temp || 0}°C</h3>
                  <p className="text-[9px] opacity-40 uppercase tracking-widest">Core Temp</p>
                </div>
              </div>
              {/* Battery */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between aspect-square">
                <div className="flex justify-between items-start">
                  <Battery className="w-5 h-5 opacity-40" />
                  <span className="text-[10px] opacity-20 uppercase tracking-widest">Energy</span>
                </div>
                <div>
                  <h3 className="text-4xl font-light tracking-tighter mb-1">{mobileData?.battery?.level || 0}%</h3>
                  <p className="text-[9px] opacity-40 uppercase tracking-widest">{mobileData?.battery?.status}</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-6">
              {/* Storage */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex-1">
                <div className="flex justify-between items-start mb-8">
                  <HardDrive className="w-5 h-5 opacity-40" />
                  <span className="text-[10px] opacity-20 uppercase tracking-widest">Storage</span>
                </div>
                <div className="space-y-4">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-1000" 
                      style={{ width: `${((mobileData?.storage?.used || 0) / (mobileData?.storage?.total || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] tracking-widest uppercase">
                    <span className="opacity-40">Used</span>
                    <span>{mobileData?.storage?.used} GB</span>
                  </div>
                  <div className="flex justify-between text-[10px] tracking-widest uppercase">
                    <span className="opacity-40">Total</span>
                    <span>{mobileData?.storage?.total} GB</span>
                  </div>
                </div>
              </div>
              {/* Uptime */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                <p className="text-[9px] opacity-20 uppercase tracking-widest mb-2">System Uptime</p>
                <p className="text-xl font-light tracking-widest">{mobileData?.system?.uptime}</p>
              </div>
            </div>
          </motion.div>
        );
      case 'terminal':
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl h-[60vh] bg-black/40 border border-white/10 rounded-3xl p-8 font-mono flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6 opacity-40">
              <TerminalIcon className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-[0.3em]">System Terminal</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
              {logs.map((log, i) => (
                <div key={i} className="text-[11px] flex gap-4">
                  <span className="opacity-20">[{new Date().toLocaleTimeString()}]</span>
                  <span className="opacity-60">{log}</span>
                </div>
              ))}
              <div className="text-[11px] text-white/80 animate-pulse">_</div>
            </div>
          </motion.div>
        );
      case 'security':
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-2xl flex flex-col items-center gap-12 p-8"
          >
            <div className="relative">
              <ShieldCheck className="w-32 h-32 text-white/10" />
              <motion.div 
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Lock className="w-8 h-8" />
              </motion.div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-light tracking-[0.5em] uppercase">Secure Enclave</h2>
              <p className="text-[10px] opacity-40 uppercase tracking-widest">All systems operational and encrypted</p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full">
              {[
                { label: 'Firewall', status: 'Active' },
                { label: 'Encryption', status: 'AES-256' },
                { label: 'Biometrics', status: 'Enabled' },
                { label: 'Network', status: 'Protected' },
              ].map((item, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-[9px] opacity-40 uppercase tracking-widest">{item.label}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest">{item.status}</span>
                </div>
              ))}
            </div>
          </motion.div>
        );
      case 'connectivity':
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[10px] font-bold tracking-[0.5em] uppercase opacity-40">Connectivity Hub</h2>
            </div>

            <div className="grid gap-6">
              {/* Wi-Fi */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${mobileData?.connectivity?.wifi === 'CONNECTED' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/20'}`}>
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest uppercase mb-1">Wi-Fi</p>
                    <p className="text-[9px] opacity-40 uppercase tracking-tighter">{mobileData?.connectivity?.wifi}</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleConnectivity('wifi', mobileData?.connectivity?.wifi || 'OFF')}
                  className={`px-4 py-2 rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all ${mobileData?.connectivity?.wifi === 'CONNECTED' ? 'bg-white text-black' : 'border border-white/20 text-white/40'}`}
                >
                  {mobileData?.connectivity?.wifi === 'CONNECTED' ? 'Disconnect' : 'Connect'}
                </button>
              </div>

              {/* Bluetooth */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${mobileData?.connectivity?.bluetooth === 'ON' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/20'}`}>
                    <Bluetooth className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest uppercase mb-1">Bluetooth</p>
                    <p className="text-[9px] opacity-40 uppercase tracking-tighter">{mobileData?.connectivity?.bluetooth}</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleConnectivity('bluetooth', mobileData?.connectivity?.bluetooth || 'OFF')}
                  className={`px-4 py-2 rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all ${mobileData?.connectivity?.bluetooth === 'ON' ? 'bg-white text-black' : 'border border-white/20 text-white/40'}`}
                >
                  {mobileData?.connectivity?.bluetooth === 'ON' ? 'Turn Off' : 'Turn On'}
                </button>
              </div>

              {/* Mobile Data / Signal */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/10 text-white">
                    <Signal className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest uppercase mb-1">Mobile Data</p>
                    <p className="text-[9px] opacity-40 uppercase tracking-tighter">Signal: {mobileData?.connectivity?.signal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((bar) => (
                    <div 
                      key={bar} 
                      className={`w-1 rounded-full transition-all ${bar <= 4 ? 'bg-white h-3' : 'bg-white/10 h-3'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        );
      default:
        return (
          <div className="flex flex-col items-center">
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
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/10 overflow-hidden flex flex-col items-center">
      {/* System Rail */}
      <div className="fixed left-0 top-0 bottom-0 w-20 flex flex-col items-center py-12 gap-8 z-30 border-r border-white/5 bg-black/20 backdrop-blur-xl">
        {[
          { id: 'core', icon: MessageSquare, label: 'Core' },
          { id: 'dashboard', icon: LayoutDashboard, label: 'Stats' },
          { id: 'terminal', icon: TerminalIcon, label: 'Logs' },
          { id: 'security', icon: Lock, label: 'Safe' },
          { id: 'connectivity', icon: Wifi, label: 'Link' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveModule(item.id as any)}
            className={`group relative p-4 rounded-2xl transition-all duration-500 ${
              activeModule === item.id ? 'bg-white text-black' : 'text-white/20 hover:text-white/40'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-white text-black text-[8px] uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Minimal Header */}
      <header className="w-full pl-28 pr-8 py-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/10'}`} />
          <span className="text-[9px] tracking-[0.4em] font-bold opacity-30 uppercase">JARVIS OS // {activeModule}</span>
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

      <main className="flex-1 w-full pl-20 flex flex-col items-center justify-center p-12 relative z-10 overflow-y-auto">
        {renderModule()}
      </main>

      {/* Minimal Input Bar */}
      <footer className="w-full pl-28 pr-12 pb-12 flex justify-center">
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
