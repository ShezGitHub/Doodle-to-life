import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Upload, Sparkles, ArrowLeft, Play, RefreshCw, Palette, CircleAlert as AlertCircle, Info, Star, Heart, Cloud, Sun, Pencil, CircleCheck as CheckCircle2, LogOut } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { generateDoodleVideo } from './services/geminiService';

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

type Screen = 'welcome' | 'projects' | 'capture' | 'camera' | 'review' | 'generating' | 'result' | 'memories';

interface Generation {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  drawing_prompt: string | null;
  parent_context: string | null;
  created_at: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
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
];

const CREDIT_PACKS = [
  { id: 'starter', label: 'Starter', credits: 5,  price: '$4.99',  unitAmount: 499 },
  { id: 'family',  label: 'Family',  credits: 20, price: '$14.99', unitAmount: 1499 },
  { id: 'studio',  label: 'Studio',  credits: 50, price: '$29.99', unitAmount: 2999 },
] as const;

function LegalPage({ page }: { page: 'tos' | 'privacy' }) {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-serif">
      <header className="p-6 flex items-center gap-2">
        <a href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
          <Palette className="w-7 h-7 text-[#5A5A40]" />
          <span className="text-xl font-bold tracking-tight">Doodlive</span>
        </a>
      </header>

      <main className="max-w-2xl mx-auto px-8 py-10 space-y-8 font-sans">
        {page === 'tos' ? (
          <>
            <div className="space-y-2">
              <h1 className="text-4xl font-serif font-light">Terms of Service</h1>
              <p className="text-sm text-[#1a1a1a]/40">Last updated: March 2026</p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">1. Service</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Doodlive ("we", "us") lets users upload images of drawings and generate short animated videos using Google Gemini/Veo AI. The service is intended for families and children, under parental supervision.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">2. Account &amp; Eligibility</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">You must sign in with a Google account to use Doodlive. By signing in, you confirm you are at least 18 years old, or are a parent/guardian using the service on behalf of a child. You are responsible for all activity under your account.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">3. Credits &amp; Payments</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Each video generation costs 1 credit. New accounts receive 1 free credit. Additional credits can be purchased via Stripe Checkout. All sales are final — credits are non-refundable except where required by law. If a generation fails due to a technical error on our side, the credit is automatically refunded to your account.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">4. Content</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">You retain ownership of images you upload. By uploading, you grant us a limited licence to process your image solely for the purpose of generating your video. You must not upload images that contain harmful, illegal, or offensive content. We reserve the right to refuse or remove content at our discretion.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">5. Limitation of Liability</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Doodlive is provided "as is". We make no guarantees about availability or video quality. To the maximum extent permitted by law, our total liability to you is limited to the amount you paid us in the 30 days before the claim arose.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">6. Changes &amp; Termination</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">We may update these terms at any time. Continued use after changes constitutes acceptance. We may suspend or terminate accounts that violate these terms.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">7. Contact</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Questions? Email us at <a href="mailto:hello@doodlive.app" className="underline text-[#5A5A40]">hello@doodlive.app</a>.</p>
            </section>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-4xl font-serif font-light">Privacy Policy</h1>
              <p className="text-sm text-[#1a1a1a]/40">Last updated: March 2026</p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">1. Data We Collect</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">When you sign in with Google we receive your name, email address, and profile picture from Google. When you use the service we process the drawing images you upload to generate videos. We store your account details, credit balance, and session information in a local database.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">2. How We Use Your Data</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Your data is used solely to provide the service: to authenticate you, track credits, process payments, and generate your animated videos. We do not sell your data or use it for advertising.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">3. Third-Party Services</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">We use the following third-party services:</p>
              <ul className="list-disc list-inside text-[#1a1a1a]/70 space-y-1 ml-2">
                <li><strong>Google OAuth</strong> — for authentication (Google Privacy Policy applies)</li>
                <li><strong>Google Gemini / Veo</strong> — your uploaded image is sent to Google's AI to generate the video</li>
                <li><strong>Stripe</strong> — for payment processing (Stripe Privacy Policy applies)</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">4. Children's Privacy</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Doodlive is designed for use by families. We do not knowingly collect personal data from children under 13 directly — accounts must be created and managed by a parent or guardian. If you believe a child has provided personal data without parental consent, contact us and we will delete it promptly.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">5. Data Retention</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">Generated videos are stored on our servers temporarily and may be deleted after 30 days. Account data is retained while your account is active. You may request deletion of your account and data at any time by contacting us.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold">6. Contact</h2>
              <p className="text-[#1a1a1a]/70 leading-relaxed">For privacy questions or data deletion requests, email <a href="mailto:hello@doodlive.app" className="underline text-[#5A5A40]">hello@doodlive.app</a>.</p>
            </section>
          </>
        )}
      </main>

      <footer className="py-8 text-center border-t border-black/5">
        <a href="/" className="text-xs font-sans text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 transition-colors">
          ← Back to Doodlive
        </a>
      </footer>
    </div>
  );
}

export default function App() {
  // Simple client-side routing for legal pages
  const pathname = window.location.pathname;
  if (pathname === '/tos') return <LegalPage page="tos" />;
  if (pathname === '/privacy') return <LegalPage page="privacy" />;

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [credits, setCredits] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<number | null>(null);
  const [memories, setMemories] = useState<Generation[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [activeMemory, setActiveMemory] = useState<Generation | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [parentContext, setParentContext] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    // Check for successful payment redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const added = parseInt(params.get('credits') ?? '0', 10);
      if (added > 0) setPaymentSuccess(added);
      window.history.replaceState({}, '', '/');
    }

    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUser(data);
        if (data) setCredits(data.credits ?? 0);
      });
  }, []);

  // Dismiss payment success toast after 4s
  useEffect(() => {
    if (paymentSuccess === null) return;
    const t = setTimeout(() => setPaymentSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [paymentSuccess]);

  // Attach camera stream to video element once the camera screen has rendered
  useEffect(() => {
    if (screen === 'camera' && cameraStream && cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = cameraStream;
      cameraPreviewRef.current.play().catch(() => {});
    }
  }, [screen, cameraStream]);

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST' });
    setUser(null);
    setCredits(null);
    reset();
  };

  const handleBuyCredits = async (pack: typeof CREDIT_PACKS[number]['id']) => {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack }),
    });
    if (!res.ok) return;
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  const loadMemories = async () => {
    if (memoriesLoaded) return;
    const res = await fetch('/api/generations');
    if (res.ok) {
      setMemories(await res.json());
      setMemoriesLoaded(true);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const startCamera = async () => {
    // On mobile, use native camera input — far more reliable than getUserMedia on iOS
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      setScreen('camera');
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

    setScreen('generating');
    setError(null);

    try {
      const base64Data = capturedImage.split(',')[1];
      const mimeType = capturedImage.split(';')[0].split(':')[1];

      const result = await generateDoodleVideo(
        base64Data,
        mimeType,
        parentContext,
        selectedProject?.description
      );

      setCredits(result.credits);
      setVideoUrl(result.videoUrl);
      const genId = result.videoUrl.split('/').pop()?.replace('.mp4', '') ?? '';
      setMemories(prev => [{
        id: genId,
        video_url: result.videoUrl,
        thumbnail_url: `/api/images/${genId}.jpg`,
        drawing_prompt: selectedProject?.description ?? null,
        parent_context: parentContext || null,
        created_at: new Date().toISOString(),
      }, ...prev]);
      setScreen('result');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'no_credits' || err.message === 'no_credits') {
        setShowPaywall(true);
        setScreen('review');
        return;
      }

      const ERROR_MESSAGES: Record<string, string> = {
        quota_exceeded:      "Our AI is taking a quick breather — please try again in a few minutes! Your credit has been returned. 🎨",
        invalid_image:       "We couldn't read that image. Try a clearer photo with good lighting.",
        service_unavailable: "The animation service is temporarily busy. Please try again shortly.",
        generation_failed:   "Something went wrong creating your animation. Your credit has been returned — please try again!",
      };

      const msg = ERROR_MESSAGES[err.message] ?? "Something went wrong. Your credit has been returned — please try again!";
      setError(msg);
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

  // Loading state — wait for auth check before rendering anything
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-[#5A5A40]/20 border-t-[#5A5A40] rounded-full"
        />
      </div>
    );
  }

  // Login screen — shown when not authenticated
  if (user === null) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-serif flex flex-col">
        {/* Header */}
        <header className="p-6 flex items-center gap-2">
          <Palette className="w-7 h-7 text-[#5A5A40]" />
          <span className="text-xl font-bold tracking-tight">Doodlive</span>
        </header>

        {/* Main two-column content */}
        <main className="flex-1 flex items-center">
          <div className="max-w-6xl mx-auto w-full px-8 grid md:grid-cols-2 gap-16 items-center py-12">
            {/* Left column */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <h1 className="text-6xl lg:text-7xl font-light leading-tight">
                  Where <span className="italic">doodles</span><br />come to life.
                </h1>
                <p className="text-[#1a1a1a]/50 font-sans text-lg leading-relaxed max-w-sm">
                  Join thousands of families turning simple drawings into magical 3D animations.
                </p>
              </div>

              <div className="space-y-4">
                <a
                  href="/auth/google"
                  className="inline-flex items-center gap-3 bg-white border border-black/10 hover:border-[#5A5A40] hover:shadow-md transition-all rounded-full py-4 px-8 font-sans font-semibold text-[#1a1a1a]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </a>

                <div className="space-y-1">
                  <button
                    onClick={() => { setUser(undefined); fetch('/api/me').then(r => r.ok ? r.json() : null).then(setUser); }}
                    className="block text-xs text-[#1a1a1a]/40 font-sans hover:text-[#1a1a1a]/70 transition-colors"
                  >
                    Already logged in? Click here to refresh
                  </button>
                  <p className="text-xs text-[#1a1a1a]/30 font-sans">
                    By signing in, you agree to our{' '}
                    <a href="/tos" className="underline hover:text-[#1a1a1a]/60 transition-colors">Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" className="underline hover:text-[#1a1a1a]/60 transition-colors">Privacy Policy</a>.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Right column — demo video */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="relative"
            >
              <div className="relative rounded-[32px] overflow-hidden shadow-2xl bg-black aspect-video">
                <video
                  src="https://res.cloudinary.com/dnrccfwtk/video/upload/v1772217630/hf_20260227_093017_5262ad97-b8a4-4751-a1d9-bf30935662f3_rody1o.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="inline-flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full font-sans text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    Draw it, Snap it, Watch it Pop!
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </main>

        {/* Feature strip */}
        <div className="border-t border-black/5">
          <div className="max-w-6xl mx-auto px-8 py-8 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: '✨', label: 'Popping Animations' },
              { icon: '📷', label: 'Save Memories' },
              { icon: '❤️', label: 'Share with Family' },
            ].map(({ icon, label }) => (
              <div key={label} className="space-y-2">
                <div className="text-3xl">{icon}</div>
                <p className="text-[10px] uppercase tracking-[0.15em] font-sans font-bold text-[#1a1a1a]/40">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="py-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#1a1a1a]/30 font-sans font-bold">
            Powered by Gemini & Veo
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-serif selection:bg-[#5A5A40] selection:text-white">
      <header className="p-6 flex justify-between items-center max-w-4xl mx-auto w-full">
        <button
          onClick={reset}
          className="text-2xl font-bold tracking-tight flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <Palette className="w-8 h-8 text-[#5A5A40]" />
          <span>Doodlive</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Credit badge */}
          <button
            onClick={() => setShowPaywall(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-sans font-semibold transition-all",
              credits === 0
                ? "bg-red-50 text-red-500 border border-red-100 hover:bg-red-100"
                : "bg-[#5A5A40]/10 text-[#5A5A40] border border-[#5A5A40]/20 hover:bg-[#5A5A40]/20"
            )}
          >
            ⚡ <span>{credits ?? '…'}</span> <span className="font-normal opacity-70">{credits === 1 ? 'credit' : 'credits'}</span>
          </button>

          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-9 h-9 rounded-full border border-black/10" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-sm font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-sans text-[#1a1a1a]/50 hover:text-[#1a1a1a] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      {/* Payment success toast */}
      <AnimatePresence>
        {paymentSuccess !== null && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#5A5A40] text-white px-6 py-3 rounded-full shadow-xl font-sans text-sm font-semibold flex items-center gap-2"
          >
            ⚡ {paymentSuccess} credits added — let's create!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory viewer modal */}
      <AnimatePresence>
        {activeMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setActiveMemory(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[40px] shadow-2xl overflow-hidden max-w-2xl w-full"
            >
              <video
                src={activeMemory.video_url}
                controls
                autoPlay
                loop
                className="w-full aspect-video"
              />
              <div className="p-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold truncate">{activeMemory.drawing_prompt || 'Free Draw'}</p>
                  <p className="text-sm text-[#1a1a1a]/40 font-sans">
                    {new Date(activeMemory.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <a
                    href={activeMemory.video_url}
                    download="memory.mp4"
                    className="bg-[#5A5A40] text-white px-5 py-2.5 rounded-full font-sans font-semibold text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Save
                  </a>
                  <button
                    onClick={() => setActiveMemory(null)}
                    className="p-2.5 hover:bg-black/5 rounded-full transition-colors text-[#1a1a1a]/50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paywall modal */}
      <AnimatePresence>
        {showPaywall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowPaywall(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[40px] shadow-2xl p-10 max-w-lg w-full space-y-8"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h2 className="text-3xl font-light">Get more credits</h2>
                  <p className="text-[#1a1a1a]/50 font-sans text-sm">Each video generation uses 1 credit.</p>
                </div>
                <button onClick={() => setShowPaywall(false)} className="p-2 hover:bg-black/5 rounded-full transition-colors text-[#1a1a1a]/40 hover:text-[#1a1a1a]">✕</button>
              </div>

              <div className="space-y-3">
                {CREDIT_PACKS.map(pack => (
                  <button
                    key={pack.id}
                    onClick={() => handleBuyCredits(pack.id)}
                    className="w-full flex items-center justify-between bg-[#f5f5f0] hover:bg-[#5A5A40]/10 border border-transparent hover:border-[#5A5A40]/30 rounded-2xl px-6 py-4 transition-all group"
                  >
                    <div className="text-left">
                      <p className="font-bold text-lg">{pack.label} Pack</p>
                      <p className="text-sm text-[#1a1a1a]/50 font-sans">⚡ {pack.credits} credits</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-[#5A5A40]">{pack.price}</p>
                      <p className="text-xs text-[#1a1a1a]/40 font-sans">${(pack.unitAmount / pack.credits / 100).toFixed(2)} each</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        <AnimatePresence mode="wait">
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

              <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
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

                <button
                  onClick={() => { loadMemories(); setScreen('memories'); }}
                  className="group relative bg-white p-8 rounded-[32px] shadow-sm hover:shadow-xl transition-all border border-black/5 flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-[#f5f5f0] rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                    🎞️
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-semibold">My Memories</h3>
                    <p className="text-sm text-[#1a1a1a]/50 font-sans">Replay your animations.</p>
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
                <input
                  type="file"
                  ref={cameraInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  capture="environment"
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
                <div className="w-10" />
              </div>

              <div className="relative bg-black rounded-[40px] overflow-hidden aspect-[4/3] shadow-2xl border border-black/5">
                <video
                  ref={cameraPreviewRef}
                  autoPlay
                  playsInline
                  muted
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
                <a
                  href={videoUrl}
                  download="doodle-alive.mp4"
                  className="bg-[#5A5A40] text-white px-8 py-4 rounded-full font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Save Video
                </a>
              </div>
            </motion.div>
          )}
          {screen === 'memories' && (
            <motion.div
              key="memories"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('welcome')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <h2 className="text-4xl">My Memories</h2>
              </div>

              {memories.length === 0 ? (
                <div className="text-center py-24 space-y-4 text-[#1a1a1a]/40">
                  <div className="text-6xl">🎞️</div>
                  <p className="font-sans text-lg">No memories yet.</p>
                  <p className="font-sans text-sm">Bring a doodle to life to start your collection!</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {memories.map(gen => (
                    <button
                      key={gen.id}
                      onClick={() => setActiveMemory(gen)}
                      className="group bg-white rounded-3xl border border-black/5 hover:border-[#5A5A40] hover:shadow-md transition-all overflow-hidden text-left"
                    >
                      <div className="relative aspect-video bg-[#f5f5f0] overflow-hidden">
                        {gen.thumbnail_url ? (
                          <img
                            src={gen.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl">🎨</div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-3 shadow-lg">
                            <Play className="w-6 h-6 text-[#5A5A40] fill-current" />
                          </div>
                        </div>
                      </div>
                      <div className="p-4 space-y-1">
                        <p className="font-bold truncate">{gen.drawing_prompt || 'Free Draw'}</p>
                        <p className="text-xs text-[#1a1a1a]/40 font-sans">
                          {new Date(gen.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center pointer-events-none">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#1a1a1a]/30 font-sans font-bold pointer-events-auto">
          Powered by Gemini &amp; Veo
          {' · '}
          <a href="/tos" className="hover:text-[#1a1a1a]/60 transition-colors">Terms</a>
          {' · '}
          <a href="/privacy" className="hover:text-[#1a1a1a]/60 transition-colors">Privacy</a>
        </p>
      </footer>
    </div>
  );
}
