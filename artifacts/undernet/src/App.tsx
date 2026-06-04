import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useWallet } from "@/hooks/useWallet";
import { useCall } from "@/hooks/useCall";
import { useIsMobile } from "@/hooks/use-mobile";
import { initPWAInstall, isStandalone, registerServiceWorker } from "@/lib/pwa";
import { subscribeToPush } from "@/lib/notifications";
import { socketService } from "@/lib/socket";
import { webrtcService } from "@/lib/webrtc";
import { setMyUserId, clearAllChats, getChat } from "@/lib/chat-store";
import InstallScreen from "@/pages/install";
import Onboarding from "@/pages/onboarding";
import ChatList from "@/pages/chat-list";
import ChatScreen from "@/pages/chat-screen";
import AiChatScreen, { clearAiChatHistory } from "@/pages/ai-chat-screen";
import CallScreen from "@/pages/call-screen";
import Settings from "@/pages/settings";
import Profile from "@/pages/profile";
import About from "@/pages/about";
import DocsViewer from "@/pages/docs-viewer";
import type { WalletData } from "@/lib/wallet";

const queryClient = new QueryClient();

type Screen =
  | { type: "install" }
  | { type: "onboarding" }
  | { type: "chatList" }
  | { type: "chat"; conversationId: number }
  | { type: "aiChat" }
  | { type: "settings" }
  | { type: "profile"; from: "chatList" | "settings" }
  | { type: "about" }
  | { type: "docs"; from: "about" | "install" | "onboarding" }
  | { type: "call" };

// Roughly orders screens by depth so we can pick a forward (slide right→left)
// or back (slide left→right) animation when transitioning between them.
const SCREEN_DEPTH: Record<Screen["type"], number> = {
  install: 0,
  onboarding: 0,
  chatList: 1,
  chat: 2,
  aiChat: 2,
  settings: 2,
  profile: 3,
  about: 3,
  docs: 4,
  call: 4,
};

const screenVariants: Variants = {
  enter: (dir: 1 | -1) => ({
    x: dir === 1 ? "12%" : "-12%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: [0.22, 0.61, 0.36, 1] },
  },
  exit: (dir: 1 | -1) => ({
    x: dir === 1 ? "-12%" : "12%",
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  }),
};

interface ScreenLayerProps {
  screenKey: string;
  direction: 1 | -1;
  children: ReactNode;
}

function ScreenLayer({ screenKey, direction, children }: ScreenLayerProps) {
  return (
    <motion.div
      key={screenKey}
      custom={direction}
      variants={screenVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="screen-layer"
    >
      {children}
    </motion.div>
  );
}

function DesktopEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
        <span className="text-3xl font-mono font-bold text-primary neon-glow">U</span>
      </div>
      <div className="px-4 py-2 rounded-full bg-card border border-border">
        <p className="text-sm text-muted-foreground">Select a chat to start messaging</p>
      </div>
      <p className="text-xs text-muted-foreground/70 mt-4 max-w-xs leading-relaxed">
        Choose a conversation from the list, or start a new one to begin a private,
        wallet-to-wallet chat.
      </p>
    </div>
  );
}

function AppContent() {
  const { wallet, loading, login, logout, updateDisplayName, updateAvatarUrl } = useWallet();
  const { callInfo } = useCall();
  const isMobile = useIsMobile();
  const [screen, setScreen] = useState<Screen>({ type: "install" });
  const [showInstall, setShowInstall] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [callFromNotification, setCallFromNotification] = useState(false);
  const prevDepthRef = useRef<number>(SCREEN_DEPTH[screen.type]);
  const direction: 1 | -1 =
    SCREEN_DEPTH[screen.type] >= prevDepthRef.current ? 1 : -1;
  useEffect(() => {
    prevDepthRef.current = SCREEN_DEPTH[screen.type];
  }, [screen.type]);

  useEffect(() => {
    initPWAInstall();
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!wallet) {
      const dismissed = localStorage.getItem("undernet_install_dismissed");
      if (dismissed || isStandalone()) {
        setScreen({ type: "onboarding" });
      } else {
        setShowInstall(true);
        setScreen({ type: "install" });
      }
    } else {
      setMyUserId(wallet.userId);
      setScreen({ type: "chatList" });
      socketService.connect();
      webrtcService.registerSocketEvents();
      subscribeToPush().catch(() => {});
    }
  }, [wallet, loading]);

  useEffect(() => {
    if (callInfo.state === "incoming") {
      setShowCall(true);
    }
  }, [callInfo.state]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get("chat");
    const callId = params.get("call");
    if (chatId && wallet) {
      setScreen({ type: "chat", conversationId: parseInt(chatId, 10) });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (callId && wallet) {
      setCallFromNotification(true);
      setShowCall(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [wallet]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      const { type: msgType, data } = event.data || {};
      if (msgType === "notification_click" && data) {
        if (data.type === "call" && data.conversationId) {
          setCallFromNotification(true);
          setShowCall(true);
        } else if (data.conversationId) {
          setScreen({ type: "chat", conversationId: data.conversationId });
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const handleInstallContinue = useCallback(() => {
    localStorage.setItem("undernet_install_dismissed", "true");
    setShowInstall(false);
    setScreen({ type: "onboarding" });
  }, []);

  const handleLogin = useCallback(
    (w: WalletData) => {
      login(w);
      setScreen({ type: "chatList" });
    },
    [login],
  );

  const handleLogout = useCallback(() => {
    webrtcService.endCall();
    webrtcService.unregisterSocketEvents();
    socketService.disconnect();
    clearAllChats();
    clearAiChatHistory();
    logout();
    setScreen({ type: "onboarding" });
  }, [logout]);

  const handleStartCall = useCallback((conversationId: number, peerId: number, peerAddress: string) => {
    const chat = getChat(conversationId);
    setShowCall(true);
    webrtcService.startCall(conversationId, peerId, peerAddress, "voice", chat?.peerDisplayName, chat?.peerAvatarUrl).catch(() => {
      setShowCall(false);
    });
  }, []);

  const handleStartVideoCall = useCallback((conversationId: number, peerId: number, peerAddress: string) => {
    const chat = getChat(conversationId);
    setShowCall(true);
    webrtcService.startCall(conversationId, peerId, peerAddress, "video", chat?.peerDisplayName, chat?.peerAvatarUrl).catch(() => {
      setShowCall(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-2xl font-mono font-bold text-primary neon-glow">U</span>
          </div>
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const screenKey =
    screen.type === "chat" ? `chat-${screen.conversationId}` :
    screen.type === "profile" ? `profile-${screen.from}` :
    screen.type;

  // Desktop (Telegram-style) layout is used once a wallet exists and the
  // viewport is wide. Install/onboarding/docs flows have no wallet yet and so
  // stay in the centered single-column mobile shell on every screen size.
  const useDesktopLayout = !isMobile && !!wallet;

  const callOverlay = (
    <AnimatePresence>
      {showCall && (
        <motion.div
          key="call"
          className="screen-layer z-40"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 0.61, 0.36, 1] } }}
          exit={{ opacity: 0, y: 24, transition: { duration: 0.18 } }}
        >
          <CallScreen onClose={() => { setShowCall(false); setCallFromNotification(false); }} fromNotification={callFromNotification} />
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (useDesktopLayout && wallet) {
    let mainPanel: ReactNode;
    switch (screen.type) {
      case "chat":
        mainPanel = (
          <ChatScreen
            key={`chat-${screen.conversationId}`}
            conversationId={screen.conversationId}
            myAddress={wallet.address}
            onBack={() => setScreen({ type: "chatList" })}
            onCall={handleStartCall}
            onVideoCall={handleStartVideoCall}
          />
        );
        break;
      case "aiChat":
        mainPanel = <AiChatScreen onBack={() => setScreen({ type: "chatList" })} />;
        break;
      case "settings":
        mainPanel = (
          <Settings
            walletAddress={wallet.address}
            displayName={wallet.displayName}
            avatarUrl={wallet.avatarUrl}
            onBack={() => setScreen({ type: "chatList" })}
            onProfile={() => setScreen({ type: "profile", from: "settings" })}
            onAbout={() => setScreen({ type: "about" })}
            onLogout={handleLogout}
          />
        );
        break;
      case "profile":
        mainPanel = (
          <Profile
            key={`profile-${screen.from}`}
            walletAddress={wallet.address}
            displayName={wallet.displayName}
            avatarUrl={wallet.avatarUrl}
            onBack={() => setScreen({ type: screen.from === "settings" ? "settings" : "chatList" })}
            onUpdateName={updateDisplayName}
            onUpdateAvatar={updateAvatarUrl}
          />
        );
        break;
      case "about":
        mainPanel = (
          <About
            onBack={() => setScreen({ type: "settings" })}
            onOpenDocs={() => setScreen({ type: "docs", from: "about" })}
          />
        );
        break;
      case "docs":
        mainPanel = <DocsViewer onBack={() => setScreen({ type: "about" })} />;
        break;
      default:
        mainPanel = <DesktopEmptyState />;
    }

    return (
      <>
        <div className="h-full w-full flex bg-background overflow-hidden">
          <aside className="w-[clamp(300px,32%,400px)] shrink-0 h-full border-r border-border flex flex-col">
            <ChatList
              walletAddress={wallet.address}
              userId={wallet.userId}
              displayName={wallet.displayName}
              avatarUrl={wallet.avatarUrl}
              onOpenChat={(conversationId) => setScreen({ type: "chat", conversationId })}
              onOpenAiChat={() => setScreen({ type: "aiChat" })}
              onOpenSettings={() => setScreen({ type: "settings" })}
              onOpenProfile={() => setScreen({ type: "profile", from: "chatList" })}
              selectedConversationId={screen.type === "chat" ? screen.conversationId : undefined}
              aiChatActive={screen.type === "aiChat"}
            />
          </aside>
          <main className="flex-1 min-w-0 h-full relative bg-background">
            {mainPanel}
          </main>
        </div>
        {callOverlay}
      </>
    );
  }

  return (
    <>
      <div className="h-full w-full max-w-lg mx-auto relative overflow-hidden">
      <AnimatePresence mode="sync" initial={false} custom={direction}>
        {showInstall && screen.type === "install" && (
          <ScreenLayer key="install" screenKey="install" direction={direction}>
            <InstallScreen
              onContinue={handleInstallContinue}
              onOpenDocs={() => setScreen({ type: "docs", from: "install" })}
            />
          </ScreenLayer>
        )}

        {screen.type === "onboarding" && (
          <ScreenLayer key="onboarding" screenKey="onboarding" direction={direction}>
            <Onboarding
              onComplete={handleLogin}
              onOpenDocs={() => setScreen({ type: "docs", from: "onboarding" })}
            />
          </ScreenLayer>
        )}

        {screen.type === "chatList" && wallet && (
          <ScreenLayer key="chatList" screenKey="chatList" direction={direction}>
            <ChatList
              walletAddress={wallet.address}
              userId={wallet.userId}
              displayName={wallet.displayName}
              avatarUrl={wallet.avatarUrl}
              onOpenChat={(conversationId) => setScreen({ type: "chat", conversationId })}
              onOpenAiChat={() => setScreen({ type: "aiChat" })}
              onOpenSettings={() => setScreen({ type: "settings" })}
              onOpenProfile={() => setScreen({ type: "profile", from: "chatList" })}
            />
          </ScreenLayer>
        )}

        {screen.type === "aiChat" && wallet && (
          <ScreenLayer key="aiChat" screenKey="aiChat" direction={direction}>
            <AiChatScreen onBack={() => setScreen({ type: "chatList" })} />
          </ScreenLayer>
        )}

        {screen.type === "chat" && wallet && (
          <ScreenLayer key={screenKey} screenKey={screenKey} direction={direction}>
            <ChatScreen
              conversationId={screen.conversationId}
              myAddress={wallet.address}
              onBack={() => setScreen({ type: "chatList" })}
              onCall={handleStartCall}
              onVideoCall={handleStartVideoCall}
            />
          </ScreenLayer>
        )}

        {screen.type === "settings" && wallet && (
          <ScreenLayer key="settings" screenKey="settings" direction={direction}>
            <Settings
              walletAddress={wallet.address}
              displayName={wallet.displayName}
              avatarUrl={wallet.avatarUrl}
              onBack={() => setScreen({ type: "chatList" })}
              onProfile={() => setScreen({ type: "profile", from: "settings" })}
              onAbout={() => setScreen({ type: "about" })}
              onLogout={handleLogout}
            />
          </ScreenLayer>
        )}

        {screen.type === "about" && wallet && (
          <ScreenLayer key="about" screenKey="about" direction={direction}>
            <About
              onBack={() => setScreen({ type: "settings" })}
              onOpenDocs={() => setScreen({ type: "docs", from: "about" })}
            />
          </ScreenLayer>
        )}

        {screen.type === "docs" && (
          <ScreenLayer key="docs" screenKey="docs" direction={direction}>
            <DocsViewer
              onBack={() => {
                if (screen.type !== "docs") return;
                if (screen.from === "install") setScreen({ type: "install" });
                else if (screen.from === "onboarding") setScreen({ type: "onboarding" });
                else setScreen({ type: "about" });
              }}
            />
          </ScreenLayer>
        )}

        {screen.type === "profile" && wallet && (
          <ScreenLayer key={screenKey} screenKey={screenKey} direction={direction}>
            <Profile
              walletAddress={wallet.address}
              displayName={wallet.displayName}
              avatarUrl={wallet.avatarUrl}
              onBack={() => {
                if (screen.type === "profile") setScreen({ type: screen.from === "chatList" ? "chatList" : "settings" });
              }}
              onUpdateName={updateDisplayName}
              onUpdateAvatar={updateAvatarUrl}
            />
          </ScreenLayer>
        )}
      </AnimatePresence>
      </div>
      {callOverlay}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
