/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  Sparkles, 
  ArrowLeft, 
  Play, 
  RefreshCw, 
  Palette, 
  CheckCircle2,
  AlertCircle,
  Info,
  Star,
  Heart,
  Cloud,
  Sun,
  Pencil,
  Share2,
  Link,
  Coins,
  CreditCard,
  X,
  LogIn,
  LogOut
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  generateDoodleVideo, 
  checkApiKey, 
  openApiKeySelector,
  validateContent
} from './services/geminiService';
import { API_BASE_URL } from './config';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FloatingDoodle = ({ icon: Icon, delay = 0, className }: { icon: any, delay?: number, className?: string }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0 }}
    animate={{ 
      opacity: [0, 1, 1, 0],
      scale: [0, 1, 1, 0.5],
      y: [0, -120],
      x: [0, (Math.random() - 0.5) * 100],
      rotate: [0, (Math.random() - 0.5) * 45]
    }}
    transition={{ 
      duration: 4, 
      repeat: Infinity, 
      delay,
      ease: "easeInOut"
    }}
    className={cn("absolute pointer-events-none text-[#5A5A40]/20", className)}
  >
    <Icon className="w-8 h-8" />
  </motion.div>
);

const SavingIndicator = () => (
  <motion.div 
    initial={{ opacity: 0, x: 10 }}
    animate={{ opacity: 1, x: 0 }}
    className="flex items-center gap-2 bg-[#5A5A40]/5 px-4 py-2 rounded-full border border-[#5A5A40]/10"
  >
    <RefreshCw className="w-3 h-3 animate-spin text-[#5A5A40]" />
    <span className="text-[10px] uppercase tracking-widest font-sans font-bold text-[#5A5A40]">
      Saving Memory...
    </span>
  </motion.div>
);

type Screen = 'login' | 'welcome' | 'projects' | 'capture' | 'camera' | 'review' | 'generating' | 'result' | 'gallery' | 'shop';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  credits: number;
}

interface Memory {
  id: number;
  title: string;
  description: string;
  parent_note: string;
  drawing_image: string;
  video_data: string;
  created_at: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const PROJECTS: Project[] = [
  { id: '1', title: 'Space Explorer', description: 'Draw an astronaut or a cool spaceship!', icon: '🚀' },
  { id: '2', title: 'Magic Garden', description: 'Draw a flower that can talk or a giant mushroom!', icon: '🍄' },
  { id: '3', title: 'Dino Friend', description: 'Draw a friendly dinosaur eating a cupcake!', icon: '🦖' },
  { id: '4', title: 'Ocean Adventure', description: 'Draw a submarine or a fish with a crown!', icon: '🐙' },
  { id: '5', title: 'Robot Workshop', description: 'Draw a robot with many arms or a robot dog!', icon: '🤖' },
  { id: '6', title: 'Jungle Safari', description: 'Draw a lion with a mane or a cheeky monkey!', icon: '🦁' },
  { id: '7', title: 'Fairy Tale', description: 'Draw a magic castle or a friendly dragon!', icon: '🏰' },
  { id: '8', title: 'Monster Party', description: 'Draw a silly monster with three eyes!', icon: '👾' },
  { id: '9', title: 'Arctic Wonders', description: 'Draw a penguin sliding on ice or a polar bear!', icon: '🐧' },
  { id: '10', title: 'Candy Land', description: 'Draw a house made of candy or a giant lollipop!', icon: '🍭' },
  { id: '11', title: 'Super Hero', description: 'Draw yourself as a hero with a magic cape!', icon: '🦸' },
  { id: '12', title: 'Busy City', description: 'Draw a flying car or a very tall building!', icon: '🏙️' },
  { id: '13', title: 'Farm Life', description: 'Draw a happy cow or a tractor in the fields!', icon: '🚜' },
  { id: '14', title: 'Sports Day', description: 'Draw someone winning a race or a giant trophy!', icon: '🏆' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('doodle_auth_token'));
  const [screen, setScreen] = useState<Screen>('login');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [parentContext, setParentContext] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [credits, setCredits] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [currentMemoryId, setCurrentMemoryId] = useState<number | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (authToken) {
      headers['X-Auth-Token'] = authToken;
    }
    return fetch(url, { ...options, headers });
  };

  const init = async (tokenOverride?: string) => {
    const tokenToUse = tokenOverride || authToken || localStorage.getItem('doodle_auth_token');
    console.log("Init: Fetching user data with token:", tokenToUse ? "Present" : "None");
    try {
      const headers: Record<string, string> = {};
      if (tokenToUse) {
        headers['X-Auth-Token'] = tokenToUse;
      }
      const res = await fetch(`${API_BASE_URL}/api/user`, { headers });
      console.log("Init: User API response status:", res.status);
      if (res.ok) {
        const userData = await res.json();
        console.log("Init: User data received:", userData);
        if (userData) {
          setUser(userData);
          setCredits(userData.credits);
          setScreen('welcome');
        } else {
          console.log("Init: No user session found.");
        }
      }
    } catch (err) {
      console.error("Init: Failed to fetch user", err);
    }
    fetchMemories(tokenToUse);
  };

  useEffect(() => {
    init();

    // Listen for OAuth success from popup
    const handleMessage = (event: MessageEvent) => {
      console.log("Frontend received message:", event.data);
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const token = event.data.token;
        if (token) {
          console.log("OAuth Success! Token received, saving...");
          localStorage.setItem('doodle_auth_token', token);
          setAuthToken(token);
          init(token);
        } else {
          console.log("OAuth Success! No token received, re-initializing in 500ms...");
          setTimeout(() => init(), 500);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authToken]);

  const handleLogin = () => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const loginWindow = window.open(
      `${API_BASE_URL}/auth/google`,
      'google_login',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Fallback: Check for session every 2 seconds
    const checkInterval = setInterval(() => {
      if (loginWindow?.closed) {
        clearInterval(checkInterval);
        console.log("Login window closed, checking session...");
        // Wait a bit longer for the message handler to finish
        setTimeout(() => init(), 1000);
      }
    }, 1000);
  };

  const fetchCredits = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/credits`);
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
      }
    } catch (err) {
      console.error("Failed to fetch credits", err);
    }
  };

  const buyCredits = async (amount: number, priceInCents: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: priceInCents, credits: amount })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      }
    } catch (err) {
      console.error("Failed to initiate checkout", err);
    }
  };

  const deductCredit = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/credits/deduct`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to deduct credit", err);
      return false;
    }
  };

  const fetchMemories = async (tokenOverride?: string) => {
    const tokenToUse = tokenOverride || authToken;
    try {
      const headers: Record<string, string> = {};
      if (tokenToUse) {
        headers['X-Auth-Token'] = tokenToUse;
      }
      const res = await fetch(`${API_BASE_URL}/api/memories`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMemories(data);
      }
    } catch (err) {
      console.error("Failed to fetch memories", err);
    }
  };

  const saveMemory = async (vUrl: string) => {
    if (!capturedImage) return null;
    setIsSaving(true);
    try {
      const response = await fetch(vUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      const videoBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const res = await fetchWithAuth(`${API_BASE_URL}/api/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedProject?.title || "Free Draw",
          description: selectedProject?.description || "A magical free-hand drawing",
          parent_note: parentContext,
          drawing_image: capturedImage,
          video_data: videoBase64
        })
      });
      const data = await res.json();
      fetchMemories(authToken || undefined);
      return data.id;
    } catch (err) {
      console.error("Failed to save memory", err);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async (id: number | null, title: string) => {
    if (!id) return;
    const shareUrl = `${window.location.origin}/share/${id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Doodlive - ${title}`,
          text: `Check out this doodle I brought to life!`,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Error sharing", err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard!");
      } catch (err) {
        console.error("Error copying to clipboard", err);
      }
    }
  };

  const deleteMemory = async (id: number) => {
    try {
      await fetchWithAuth(`${API_BASE_URL}/api/memories/${id}`, { method: 'DELETE' });
      fetchMemories(authToken || undefined);
    } catch (err) {
      console.error("Failed to delete memory", err);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      setScreen('camera');
      if (cameraPreviewRef.current) {
        cameraPreviewRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const takePhoto = () => {
    if (cameraPreviewRef.current && canvasRef.current) {
      const video = cameraPreviewRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
        setScreen('review');
      }
    }
  };

  const handleStart = (mode: 'project' | 'free') => {
    if (mode === 'project') {
      setScreen('projects');
    } else {
      setSelectedProject(null);
      setScreen('capture');
    }
  };

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setScreen('capture');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
        setScreen('review');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBringToLife = async () => {
    if (!capturedImage) return;
    
    if (credits <= 0) {
      setScreen('shop');
      return;
    }

    setScreen('generating');
    setError(null);

    try {
      const base64Data = capturedImage.split(',')[1];
      const mimeType = capturedImage.split(';')[0].split(':')[1];
      
      // Safety check first
      const safetyResult = await validateContent(base64Data, mimeType, parentContext);
      if (!safetyResult.safe) {
        setError(safetyResult.reason || "This doodle looks a bit too wild for our magic filters! Let's try drawing something else.");
        setScreen('review');
        return;
      }

      // Deduct credit
      const success = await deductCredit();
      if (!success) {
        setError("Oops! You need more magic credits to bring this doodle to life.");
        setScreen('shop');
        return;
      }
      
      const url = await generateDoodleVideo(
        base64Data,
        mimeType,
        parentContext,
        selectedProject?.description
      );
      
      setVideoUrl(url);
      setScreen('result');
      const id = await saveMemory(url);
      setCurrentMemoryId(id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong while bringing your doodle to life.");
      setScreen('review');
    }
  };

  const reset = () => {
    setScreen('welcome');
    setCapturedImage(null);
    setParentContext('');
    setVideoUrl(null);
    setError(null);
    setSelectedProject(null);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-serif selection:bg-[#5A5A40] selection:text-white">
      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-4xl mx-auto w-full">
        <button 
          onClick={reset}
          className="text-2xl font-bold tracking-tight flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <Palette className="w-8 h-8 text-[#5A5A40]" />
          <span>Doodlive</span>
        </button>
        
        <div className="flex items-center gap-4">
          {user && (
            <>
              <button 
                onClick={() => setScreen('shop')}
                className="flex items-center gap-2 bg-white/50 backdrop-blur-sm border border-[#5A5A40]/10 px-3 py-1.5 rounded-full hover:bg-white transition-all group"
              >
                <Coins className="w-4 h-4 text-yellow-600 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold text-[#5A5A40]">{credits}</span>
              </button>
              <button 
                onClick={() => setScreen('gallery')}
                className="text-xs uppercase tracking-widest font-sans font-semibold text-[#5A5A40] hover:underline"
              >
                Memories ({memories.length})
              </button>
              <div className="flex items-center gap-4">
                {user.picture && (
                  <img 
                    src={user.picture} 
                    alt={user.name} 
                    className="w-8 h-8 rounded-full border border-[#5A5A40]/20"
                    referrerPolicy="no-referrer"
                  />
                )}
                <button 
                  onClick={async () => {
                    await fetchWithAuth(`${API_BASE_URL}/api/logout`, { method: 'POST' });
                    localStorage.removeItem('doodle_auth_token');
                    setAuthToken(null);
                    setUser(null);
                    setScreen('login');
                  }}
                  className="text-xs uppercase tracking-widest font-sans font-semibold text-red-500 hover:underline flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        <AnimatePresence mode="wait">
          {screen === 'login' && (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-4xl mx-auto space-y-12"
            >
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h1 className="text-7xl font-light leading-tight">
                      Where <span className="italic">doodles</span> come to life.
                    </h1>
                    <p className="text-xl text-[#1a1a1a]/60 font-sans">
                      Join thousands of families turning simple drawings into magical 3D animations.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={handleLogin}
                      className="inline-flex items-center gap-3 bg-white border border-black/10 px-8 py-4 rounded-full text-lg font-bold shadow-sm hover:shadow-md transition-all group"
                    >
                      <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                      Sign in with Google
                    </button>
                    <div className="pt-4">
                      <button 
                        onClick={() => init()}
                        className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a] transition-colors"
                      >
                        Already logged in? Click here to refresh
                      </button>
                    </div>
                    <p className="text-xs text-[#1a1a1a]/40 font-sans px-4">
                      By signing in, you agree to our Terms of Service.
                    </p>
                  </div>
                </div>

                <div className="relative aspect-video bg-black rounded-[40px] overflow-hidden shadow-2xl group">
                  {/* Onboarding Video */}
                  <video 
                    src="https://res.cloudinary.com/dnrccfwtk/video/upload/v1772217630/hf_20260227_093017_5262ad97-b8a4-4751-a1d9-bf30935662f3_rody1o.mp4" 
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                    <Play className="w-16 h-16 text-white opacity-50 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-6 left-6 right-6 p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 pointer-events-none">
                    <p className="text-white text-sm font-sans font-medium">
                      ✨ Draw it, Snap it, Watch it Pop!
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-8 pt-12 border-t border-black/5">
                {[
                  { label: "Popping Animations", icon: "✨" },
                  { label: "Save Memories", icon: "📸" },
                  { label: "Share with Family", icon: "💝" }
                ].map((feature) => (
                  <div key={feature.label} className="text-center space-y-2">
                    <div className="text-3xl">{feature.icon}</div>
                    <p className="text-xs uppercase tracking-widest font-sans font-bold text-[#1a1a1a]/40">{feature.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {screen === 'shop' && (
            <motion.div 
              key="shop"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12 max-w-2xl mx-auto"
            >
              <div className="text-center space-y-4">
                <div className="inline-block p-4 bg-yellow-100 rounded-full mb-4">
                  <Coins className="w-12 h-12 text-yellow-600" />
                </div>
                <h2 className="text-5xl">Magic Credits</h2>
                <p className="text-xl text-[#1a1a1a]/60 font-sans">Bring more doodles to life with magic credits!</p>
              </div>

              <div className="grid gap-6">
                {[
                  { amount: 10, price: '$9.99', priceCents: 999, label: 'Starter Pack', icon: '✨' },
                  { amount: 30, price: '$24.99', priceCents: 2499, label: 'Magic Bundle', icon: '🌟', popular: true },
                  { amount: 100, price: '$59.99', priceCents: 5999, label: 'Wizard Treasury', icon: '👑' },
                ].map((pack) => (
                  <button
                    key={pack.amount}
                    onClick={() => buyCredits(pack.amount, pack.priceCents)}
                    className={cn(
                      "relative bg-white p-8 rounded-[40px] border-2 transition-all flex items-center justify-between group",
                      pack.popular ? "border-[#5A5A40] shadow-xl scale-105" : "border-black/5 hover:border-[#5A5A40]/30"
                    )}
                  >
                    {pack.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#5A5A40] text-white px-4 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold">
                        Most Popular
                      </div>
                    )}
                    <div className="flex items-center gap-6">
                      <div className="text-4xl">{pack.icon}</div>
                      <div className="text-left">
                        <h4 className="text-2xl font-bold">{pack.amount} Credits</h4>
                        <p className="text-sm text-[#1a1a1a]/50 font-sans">{pack.label}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-[#5A5A40]">{pack.price}</div>
                      <div className="text-[10px] uppercase tracking-widest font-sans font-bold text-[#1a1a1a]/30">One-time purchase</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="text-center">
                <button 
                  onClick={() => setScreen('welcome')}
                  className="text-[#1a1a1a]/40 hover:text-[#1a1a1a] transition-colors font-sans text-sm uppercase tracking-widest font-bold"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'gallery' && (
            <motion.div 
              key="gallery"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('welcome')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-4xl">Doodle Memories</h2>
              </div>

              {memories.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[40px] border border-black/5">
                  <p className="text-xl text-[#1a1a1a]/40 font-sans">No memories yet. Start drawing to fill your gallery!</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-8">
                  {memories.map((memory) => (
                    <div key={memory.id} className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-black/5 group">
                      <div className="aspect-video relative">
                        <video 
                          src={memory.video_data} 
                          className="w-full h-full object-cover"
                          controls
                        />
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-xl font-bold">{memory.title}</h4>
                            <p className="text-xs text-[#1a1a1a]/40 font-sans">{new Date(memory.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleShare(memory.id, memory.title)}
                              className="text-[#5A5A40] hover:bg-[#5A5A40]/5 p-2 rounded-full transition-colors"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteMemory(memory.id)}
                              className="text-red-400 hover:text-red-600 p-2 transition-colors"
                            >
                              <RefreshCw className="w-4 h-4 rotate-45" />
                            </button>
                          </div>
                        </div>
                        {memory.parent_note && (
                          <p className="text-sm italic text-[#1a1a1a]/60">"{memory.parent_note}"</p>
                        )}
                        <div className="pt-4 border-t border-black/5 flex items-center gap-3">
                          <img src={memory.drawing_image} className="w-12 h-12 rounded-lg object-cover border border-black/5" alt="Original drawing" />
                          <p className="text-[10px] uppercase tracking-widest font-sans font-bold text-[#1a1a1a]/30">Original Drawing</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {screen === 'welcome' && (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-12 space-y-12"
            >
              <div className="space-y-4">
                <h1 className="text-6xl md:text-8xl font-light leading-tight">
                  Bring your <span className="italic">doodles</span> to life.
                </h1>
                <p className="text-xl text-[#1a1a1a]/60 max-w-xl mx-auto font-sans">
                  Turn your child's imagination into magical animations with a single photo.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                <button 
                  onClick={() => handleStart('project')}
                  className="group relative bg-white p-8 rounded-[32px] shadow-sm hover:shadow-xl transition-all border border-black/5 flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-[#f5f5f0] rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                    🎨
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-semibold">Start a Project</h3>
                    <p className="text-sm text-[#1a1a1a]/50 font-sans">Choose a fun theme to draw together.</p>
                  </div>
                </button>

                <button 
                  onClick={() => handleStart('free')}
                  className="group relative bg-[#5A5A40] text-white p-8 rounded-[32px] shadow-sm hover:shadow-xl transition-all flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                    ✨
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-semibold">Free Draw</h3>
                    <p className="text-sm text-white/60 font-sans">Upload any drawing and watch it pop out!</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'projects' && (
            <motion.div 
              key="projects"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('welcome')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-4xl">Choose a Project</h2>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {PROJECTS.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    className="bg-white p-6 rounded-3xl border border-black/5 hover:border-[#5A5A40] hover:shadow-md transition-all text-left flex gap-6 items-center group"
                  >
                    <div className="text-4xl group-hover:scale-110 transition-transform">{project.icon}</div>
                    <div>
                      <h4 className="text-xl font-bold">{project.title}</h4>
                      <p className="text-sm text-[#1a1a1a]/60 font-sans">{project.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {screen === 'capture' && (
            <motion.div 
              key="capture"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-8 max-w-2xl mx-auto text-center"
            >
              <div className="flex items-center justify-center gap-4 mb-12">
                <button onClick={() => setScreen(selectedProject ? 'projects' : 'welcome')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-4xl">Capture the Magic</h2>
              </div>

              {selectedProject && (
                <div className="bg-[#5A5A40]/5 p-6 rounded-3xl border border-[#5A5A40]/20 mb-8 inline-block">
                  <p className="text-sm uppercase tracking-widest font-sans font-bold text-[#5A5A40] mb-2">Current Project</p>
                  <p className="text-2xl italic">"{selectedProject.description}"</p>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-[4/3] bg-white rounded-[40px] border-2 border-dashed border-black/10 flex flex-col items-center justify-center cursor-pointer hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 transition-all group"
                >
                  <div className="w-16 h-16 bg-[#f5f5f0] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6 text-[#5A5A40]" />
                  </div>
                  <p className="text-lg font-bold">Upload Photo</p>
                  <p className="text-xs text-[#1a1a1a]/50 font-sans">From your gallery</p>
                </div>

                <div 
                  onClick={startCamera}
                  className="aspect-[4/3] bg-white rounded-[40px] border-2 border-dashed border-black/10 flex flex-col items-center justify-center cursor-pointer hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 transition-all group"
                >
                  <div className="w-16 h-16 bg-[#f5f5f0] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Camera className="w-6 h-6 text-[#5A5A40]" />
                  </div>
                  <p className="text-lg font-bold">Take Photo</p>
                  <p className="text-xs text-[#1a1a1a]/50 font-sans">Using your camera</p>
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </motion.div>
          )}

          {screen === 'camera' && (
            <motion.div 
              key="camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 max-w-2xl mx-auto text-center"
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <button onClick={() => { stopCamera(); setScreen('capture'); }} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-2xl">Smile for the Camera!</h2>
                <div className="w-10" /> {/* Spacer */}
              </div>

              <div className="relative bg-black rounded-[40px] overflow-hidden aspect-[4/3] shadow-2xl border border-black/5">
                <video 
                  ref={cameraPreviewRef}
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-[16px] border-white/10 pointer-events-none rounded-[40px]" />
              </div>

              <div className="flex justify-center pt-4">
                <button 
                  onClick={takePhoto}
                  className="w-20 h-20 bg-white border-8 border-[#5A5A40] rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
                >
                  <div className="w-12 h-12 bg-[#5A5A40] rounded-full" />
                </button>
              </div>
              
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {screen === 'review' && capturedImage && (
            <motion.div 
              key="review"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 max-w-2xl mx-auto"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('capture')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-4xl">Almost there!</h2>
              </div>

              <div className="bg-white p-4 rounded-[40px] shadow-sm border border-black/5">
                <img 
                  src={capturedImage} 
                  alt="Captured doodle" 
                  className="w-full aspect-[4/3] object-cover rounded-[32px]"
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm uppercase tracking-widest font-sans font-bold text-[#5A5A40] flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Parent's Note (Optional)
                  </label>
                  <textarea 
                    value={parentContext}
                    onChange={(e) => setParentContext(e.target.value)}
                    placeholder="Tell us more! e.g., 'The dragon is friendly and loves to dance'"
                    className="w-full p-6 bg-white rounded-3xl border border-black/5 focus:border-[#5A5A40] focus:ring-1 focus:ring-[#5A5A40] outline-none transition-all font-sans min-h-[120px]"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl flex items-start gap-3 border border-red-100 font-sans text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <button 
                  onClick={handleBringToLife}
                  className="w-full bg-[#5A5A40] text-white py-6 rounded-full text-2xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Sparkles className="w-6 h-6" />
                  Bring to Life!
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'generating' && (
            <motion.div 
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 space-y-12 relative"
            >
              <div className="relative inline-block">
                {/* Floating magic doodles */}
                <FloatingDoodle icon={Star} delay={0} className="top-0 left-0" />
                <FloatingDoodle icon={Heart} delay={1} className="top-10 right-0" />
                <FloatingDoodle icon={Cloud} delay={2} className="bottom-0 left-10" />
                <FloatingDoodle icon={Sun} delay={0.5} className="top-5 left-20" />
                <FloatingDoodle icon={Pencil} delay={1.5} className="bottom-5 right-10" />
                <FloatingDoodle icon={Sparkles} delay={2.5} className="top-20 left-0" />

                <motion.div 
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, 2, -2, 0]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="w-48 h-48 bg-white rounded-[40px] shadow-xl border border-black/5 flex items-center justify-center text-7xl relative z-10"
                >
                  ✨
                </motion.div>
                <div className="absolute inset-0 bg-[#5A5A40] blur-3xl opacity-20 animate-pulse" />
              </div>

              <div className="space-y-4">
                <h2 className="text-5xl italic font-light">Waking up the doodle...</h2>
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-[#1a1a1a]/60 font-sans">Our AI magic is turning the drawing into a 3D animation. This usually takes about a minute.</p>
                  
                  <div className="relative pt-4">
                    <div className="w-full bg-black/5 h-2 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-1/2 h-full bg-gradient-to-r from-transparent via-[#5A5A40] to-transparent"
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] uppercase tracking-widest font-sans font-bold text-[#5A5A40]/40">
                      <span>Sketching</span>
                      <span>Coloring</span>
                      <span>Animating</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-6 opacity-40">
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-xl"
                >
                  🎨
                </motion.div>
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.2 }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-xl"
                >
                  🖍️
                </motion.div>
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.4 }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-xl"
                >
                  🖌️
                </motion.div>
              </div>
            </motion.div>
          )}

          {screen === 'result' && videoUrl && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 max-w-3xl mx-auto text-center"
            >
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 bg-[#5A5A40]/10 text-[#5A5A40] px-4 py-1 rounded-full text-sm font-sans font-bold uppercase tracking-widest mb-4">
                  <CheckCircle2 className="w-4 h-4" />
                  Magic Complete
                </div>
                <h2 className="text-5xl">It's Alive!</h2>
              </div>

              <div className="relative group">
                <div className="absolute -inset-4 bg-gradient-to-tr from-[#5A5A40]/20 to-transparent blur-2xl opacity-50 rounded-[48px]" />
                <div className="relative bg-white p-4 rounded-[48px] shadow-2xl border border-black/5 overflow-hidden">
                  <video 
                    ref={videoRef}
                    src={videoUrl} 
                    controls 
                    autoPlay 
                    loop
                    className="w-full aspect-video object-cover rounded-[36px]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                <button 
                  onClick={reset}
                  className="bg-white text-[#1a1a1a] px-8 py-4 rounded-full font-bold border border-black/10 hover:bg-black/5 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  Create Another
                </button>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleShare(currentMemoryId, selectedProject?.title || "Free Draw")}
                    className="bg-white text-[#5A5A40] px-8 py-4 rounded-full font-bold border border-[#5A5A40]/20 hover:bg-[#5A5A40]/5 transition-all flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-5 h-5" />
                    Share
                  </button>
                  <a 
                    href={videoUrl} 
                    download="doodle-alive.mp4"
                    className="bg-[#5A5A40] text-white px-8 py-4 rounded-full font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    Save Video
                  </a>
                  {isSaving && <SavingIndicator />}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center pointer-events-none">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#1a1a1a]/30 font-sans font-bold">
          Powered by Gemini & Veo
        </p>
      </footer>
    </div>
  );
}
