import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Maximize2, Mic, MicOff, PhoneOff, ShieldAlert, Sparkles, Video, VideoOff } from 'lucide-react';

export default function JitsiMeeting({
  roomName,
  domain = 'meet.jit.si',
  displayName = 'Peerza Learner',
  email = '',
  partner = null,
  note = '',
  onLeave = () => {}
}) {
  const containerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    // Load external_api.js from configured domain
    const loadScript = () => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          return resolve(window.JitsiMeetExternalAPI);
        }
        const existingScript = document.getElementById('jitsi-external-api-script');
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(window.JitsiMeetExternalAPI));
          existingScript.addEventListener('error', () => reject(new Error('Failed to load Jitsi API script.')));
          return;
        }

        const script = document.createElement('script');
        script.id = 'jitsi-external-api-script';
        script.src = `https://${domain}/external_api.js`;
        script.async = true;
        script.onload = () => {
          if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI);
          else reject(new Error('Jitsi External API not found after script load.'));
        };
        script.onerror = () => reject(new Error(`Could not connect to Jitsi server at ${domain}.`));
        document.body.appendChild(script);
      });
    };

    loadScript()
      .then((JitsiMeetExternalAPI) => {
        if (isCancelled || !containerRef.current) return;

        // Clean up any stale instance
        if (jitsiApiRef.current) {
          try { jitsiApiRef.current.dispose(); } catch {}
          jitsiApiRef.current = null;
        }

        const options = {
          roomName,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          userInfo: {
            displayName,
            email
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableClosePage: false,
            toolbarButtons: [
              'camera',
              'chat',
              'desktop',
              'fullscreen',
              'hangup',
              'microphone',
              'raisehand',
              'tileview',
              'settings'
            ]
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_REMOTE_DISPLAY_NAME: partner?.name || 'Learning Partner',
            TOOLBAR_ALWAYS_VISIBLE: true
          }
        };

        const api = new JitsiMeetExternalAPI(domain, options);
        jitsiApiRef.current = api;

        api.addEventListeners({
          videoConferenceJoined: () => {
            if (!isCancelled) setLoading(false);
          },
          videoConferenceLeft: () => {
            onLeave();
          },
          readyToClose: () => {
            onLeave();
          },
          audioMuteStatusChanged: ({ muted }) => {
            if (!isCancelled) setIsMuted(muted);
          },
          videoMuteStatusChanged: ({ muted }) => {
            if (!isCancelled) setIsVideoMuted(muted);
          }
        });

        // Set ready state after short timeout in case event is missed
        setTimeout(() => {
          if (!isCancelled) setLoading(false);
        }, 1500);
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Jitsi initialization failed:', err);
          setError(err.message || 'Could not start video call.');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing Jitsi instance:', e);
        }
        jitsiApiRef.current = null;
      }
    };
  }, [roomName, domain, displayName, email]);

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleHangup = () => {
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.executeCommand('hangup');
      } catch {
        onLeave();
      }
    } else {
      onLeave();
    }
  };

  return (
    <div className="jitsi-call-shell">
      <header className="jitsi-call-header">
        <div className="jitsi-brand">
          <button className="jitsi-back-btn" onClick={handleHangup} title="Leave call">
            <ArrowLeft size={17} /> Back
          </button>
          <div className="jitsi-brand-info">
            <h2>
              Peerza Live Call <span className="jitsi-spark"><Sparkles size={13} /></span>
            </h2>
            <p>
              Session with <b>{partner?.name || 'Learner'}</b>
              {note ? ` · “${note.slice(0, 50)}${note.length > 50 ? '…' : ''}”` : ''}
            </p>
          </div>
        </div>

        <div className="jitsi-header-actions">
          <span className="jitsi-room-pill" title={`Conference Room: ${roomName}`}>
            <span className="room-dot" /> {roomName.slice(0, 24)}…
          </span>
          <button className="jitsi-action-btn" onClick={toggleFullscreen} title="Toggle fullscreen">
            <Maximize2 size={16} />
          </button>
          <button className="jitsi-leave-btn" onClick={handleHangup}>
            <PhoneOff size={15} /> Leave Call
          </button>
        </div>
      </header>

      <div className="jitsi-container-wrap">
        {loading && (
          <div className="jitsi-loading-overlay">
            <Loader2 className="animate-spin" size={32} />
            <h3>Connecting to your learning session…</h3>
            <p>Establishing encrypted audio/video connection with {partner?.name || 'partner'}.</p>
          </div>
        )}

        {error && (
          <div className="jitsi-error-overlay">
            <ShieldAlert size={36} />
            <h3>Could not connect to video room</h3>
            <p>{error}</p>
            <p className="jitsi-error-tip">
              Ensure you have granted camera/microphone permissions and that your network allows access to {domain}.
            </p>
            <button className="primary-button" onClick={handleHangup}>
              Back to Sessions
            </button>
          </div>
        )}

        <div ref={containerRef} className="jitsi-iframe-container" />
      </div>
    </div>
  );
}
