// Generated from the approved standalone design; markup is a verbatim port (class -> className, style strings -> objects).
import { useEffect, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import './landing.css';
import { FeatureCarousel } from './FeatureCarousel';

const FONT_LINKS = [
  'https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600&display=swap',
];
const TITLE = "BrandShield — Digital Risk Protection with explainable scores";
const DESCRIPTION = "BrandShield finds fake social profiles, cloned apps and look-alike domains, scores each one with its reasons, and keeps a person in charge of every takedown.";

export function LandingPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const soundRef = useRef<HTMLButtonElement>(null);

  // Document-level bits that only exist while the landing page is mounted.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const createdMeta = !meta;
    const prevDesc = meta?.content ?? '';
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = DESCRIPTION;
    const links = FONT_LINKS.map((href) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
      return l;
    });
    document.documentElement.classList.add('bs-landing-active');
    return () => {
      document.title = prevTitle;
      if (createdMeta) meta.remove();
      else meta.content = prevDesc;
      links.forEach((l) => l.remove());
      document.documentElement.classList.remove('bs-landing-active');
    };
  }, []);

  // Cursor dot: moved through its ref, no React state per mouse move.
  useEffect(() => {
    const dot = cursorRef.current;
    if (!dot || !window.matchMedia('(hover:hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: MouseEvent) => {
      dot.style.opacity = '1';
      dot.style.transform = 'translate(' + (e.clientX - 6) + 'px,' + (e.clientY - 6) + 'px)';
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, []);

  // Hero video + sound toggle.
  useEffect(() => {
    const v = videoRef.current;
    const b = soundRef.current;
    if (!v || !b) return;
    const fb = rootRef.current?.querySelector<HTMLElement>('.vfallback') ?? null;
    v.muted = true;
    v.defaultMuted = true;
    const onPlaying = () => { if (fb) fb.style.display = 'none'; };
    const onError = () => { b.style.display = 'none'; };
    v.addEventListener('playing', onPlaying);
    v.addEventListener('error', onError);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      v.removeAttribute('autoplay');
      v.pause();
      v.controls = true;
    }
    const onClick = () => {
      const on = v.muted;
      v.muted = !on;
      if (on && v.paused) void v.play();
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
      const label = b.querySelector('span');
      if (label) label.textContent = on ? 'Sound off' : 'Sound on';
    };
    b.addEventListener('click', onClick);
    return () => {
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('error', onError);
      b.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div
      className="bs-landing"
      ref={rootRef}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (a && a.getAttribute('href') === '/login' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          navigate('/login');
        }
      }}
    >
      <div style={{ width: "100%", overflowX: "clip", position: "relative" }}>
        <span className="cursor" id="cursorDot" aria-hidden="true" ref={cursorRef}></span>
        <header className="hdr">
          <div className="in">
            <a href="#top" aria-label="BrandShield home" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
                <defs>
                  <linearGradient id="lgA" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4F63F0" />
                    <stop offset="1" stopColor="#A78BFA" />
                  </linearGradient>
                </defs>
                <path d="M24 3l17 6v13c0 10-7 18-17 23C14 40 7 32 7 22V9z" fill="url(#lgA)" />
                <path d="M16 24l6 6 11-12" stroke="#0B0B12" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="wm" style={{ fontSize: "16px" }}>
                BRANDSHIELD
              </span>
            </a>
            <nav className="navpill" aria-label="Main">
              <div className="nitem">
                <a href="#expertise">
                  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: "14px", height: "14px", color: "var(--acc)" } as CSSProperties}>
                    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
                  </svg>
                  Shield AI
                </a>
                <div className="mega" role="region" aria-label="Detection pillars">
                  <div>
                    <div className="mtitle">
                      <b>
                        /
                      </b>
                      pillars
                      <b>
                        .
                      </b>
                    </div>
                    <svg viewBox="0 0 200 170" width="190" aria-hidden="true" style={{ marginTop: "18px" }}>
                      <defs>
                        <radialGradient id="g1" cx=".35" cy=".3" r=".8">
                          <stop offset="0" stopColor="#D3D9FF" />
                          <stop offset=".45" stopColor="#4F63F0" />
                          <stop offset="1" stopColor="#1E2370" />
                        </radialGradient>
                      </defs>
                      <path d="M100 14l66 22v42c0 38-28 64-66 78-38-14-66-40-66-78V36z" fill="url(#g1)" />
                      <path d="M100 30l52 17v33c0 30-22 51-52 62" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" />
                      <circle cx="100" cy="86" r="24" fill="#0B0B14" opacity=".55" />
                      <path d="M89 86l8 8 15-17" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="mlist">
                    <a href="#expertise">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M4 7h16M4 12h10M4 17h7" />
                        </svg>
                      </span>
                      <span>
                        Name look-alikes
                        <small>
                          rn for m, acm3bank, added words
                        </small>
                      </span>
                    </a>
                    <a href="#expertise">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M3 12h18M12 3c3 3 3 15 0 18" />
                        </svg>
                      </span>
                      <span>
                        Domain look-alikes
                        <small>
                          Punycode, TLD swaps, subdomains
                        </small>
                      </span>
                    </a>
                    <a href="#expertise">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <rect x="4" y="4" width="16" height="16" rx="3" />
                          <circle cx="10" cy="10" r="2" />
                        </svg>
                      </span>
                      <span>
                        Logo &amp; icon match
                        <small>
                          CLIP vision + perceptual hashes
                        </small>
                      </span>
                    </a>
                    <a href="#expertise">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M4 5h16v11H8l-4 4z" />
                        </svg>
                      </span>
                      <span>
                        Bio analysis
                        <small>
                          KYC lures, fees, “DM us”
                        </small>
                      </span>
                    </a>
                    <a href="#expertise">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
                        </svg>
                      </span>
                      <span>
                        Account &amp; app signals
                        <small>
                          Age, activity, publisher
                        </small>
                      </span>
                    </a>
                    <a href="#expertise">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
                        </svg>
                      </span>
                      <span>
                        Official-asset exclusion
                        <small>
                          Exact handle or app id only
                        </small>
                      </span>
                    </a>
                  </div>
                </div>
              </div>
              <div className="nitem">
                <a href="#how">
                  Platform
                </a>
                <div className="mega" role="region" aria-label="Platform screens">
                  <div>
                    <div className="mtitle">
                      <b>
                        /
                      </b>
                      screens
                      <b>
                        .
                      </b>
                    </div>
                    <svg viewBox="0 0 200 170" width="190" aria-hidden="true" style={{ marginTop: "18px" }}>
                      <defs>
                        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#E4DBFF" />
                          <stop offset=".5" stopColor="#A78BFA" />
                          <stop offset="1" stopColor="#3B2A7A" />
                        </linearGradient>
                      </defs>
                      <rect x="22" y="30" width="156" height="104" rx="14" fill="url(#g2)" />
                      <rect x="36" y="46" width="40" height="72" rx="6" fill="#0B0B14" opacity=".45" />
                      <rect x="86" y="46" width="78" height="20" rx="5" fill="#fff" opacity=".55" />
                      <rect x="86" y="74" width="78" height="44" rx="6" fill="#0B0B14" opacity=".35" />
                    </svg>
                  </div>
                  <div className="mlist">
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                        </svg>
                      </span>
                      Overview
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
                        </svg>
                      </span>
                      Brand Registry
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
                        </svg>
                      </span>
                      Social Threats
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <rect x="7" y="3" width="10" height="18" rx="2" />
                        </svg>
                      </span>
                      App Threats
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M3 12h18" />
                        </svg>
                      </span>
                      Web Threats
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="11" cy="11" r="6" />
                          <path d="m20 20-4-4" />
                        </svg>
                      </span>
                      Investigations
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
                        </svg>
                      </span>
                      Look-alike Lab
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M5 20V10M12 20V4M19 20v-7" />
                        </svg>
                      </span>
                      Model Evaluation
                    </a>
                  </div>
                </div>
              </div>
              <div className="nitem">
                <a href="/login">
                  Sources
                </a>
                <div className="mega" role="region" aria-label="Data sources">
                  <div>
                    <div className="mtitle">
                      <b>
                        /
                      </b>
                      sources
                      <b>
                        .
                      </b>
                    </div>
                    <svg viewBox="0 0 200 170" width="190" aria-hidden="true" style={{ marginTop: "18px" }}>
                      <defs>
                        <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#FFD27A" />
                          <stop offset=".5" stopColor="#F59E55" />
                          <stop offset="1" stopColor="#A8461A" />
                        </linearGradient>
                      </defs>
                      <g fill="none" stroke="url(#g3)" strokeWidth="20" strokeLinecap="round">
                        <path d="M50 120c0-50 100-50 100-90" />
                        <path d="M50 40c0 50 100 50 100 90" />
                      </g>
                      <rect x="20" y="96" width="44" height="44" rx="6" fill="#23232C" />
                    </svg>
                  </div>
                  <div className="mlist">
                    <a href="#marquee">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="11" cy="11" r="6" />
                          <path d="m20 20-4-4" />
                        </svg>
                      </span>
                      <span>
                        Tavily web search
                        <small>
                          Primary live source, credit-guarded
                        </small>
                      </span>
                    </a>
                    <a href="#marquee">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <rect x="7" y="3" width="10" height="18" rx="2" />
                        </svg>
                      </span>
                      <span>
                        Apple iTunes Search
                        <small>
                          App Store, no key needed
                        </small>
                      </span>
                    </a>
                    <a href="#marquee">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M5 3l14 9-14 9z" />
                        </svg>
                      </span>
                      <span>
                        Google Play
                        <small>
                          Optional package
                        </small>
                      </span>
                    </a>
                    <a href="#marquee">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M4 12h16M12 4v16" />
                        </svg>
                      </span>
                      <span>
                        SearXNG
                        <small>
                          Optional self-hosted fallback
                        </small>
                      </span>
                    </a>
                    <a href="#marquee">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
                        </svg>
                      </span>
                      <span>
                        Google Safe Browsing
                        <small>
                          Domain reputation, with a key
                        </small>
                      </span>
                    </a>
                    <a href="#marquee">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <rect x="4" y="4" width="16" height="16" rx="3" />
                        </svg>
                      </span>
                      <span>
                        Sample collector
                        <small>
                          Fictional, labelled, no network
                        </small>
                      </span>
                    </a>
                  </div>
                </div>
              </div>
              <div className="nitem">
                <a href="#about">
                  Resources
                </a>
                <div className="mega" role="region" aria-label="Resources">
                  <div>
                    <div className="mtitle">
                      kn
                      <b>
                        {'{'}
                      </b>
                      o
                      <b>
                        {'}'}
                      </b>
                      w
                      <b>
                        .
                      </b>
                    </div>
                    <svg viewBox="0 0 200 170" width="190" aria-hidden="true" style={{ marginTop: "18px" }}>
                      <defs>
                        <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#FFF3A8" />
                          <stop offset="1" stopColor="#D7A51D" />
                        </linearGradient>
                      </defs>
                      <rect x="40" y="30" width="110" height="130" rx="14" fill="url(#g4)" />
                      <path d="M62 70h66M62 92h66M62 114h40" stroke="#5C4300" strokeWidth="7" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="mlist">
                    <a href="https://github.com/NEXacxlerate/Brand-Shield" target="_blank" rel="noopener">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M7 3h7l4 4v14H7z" />
                        </svg>
                      </span>
                      <span>
                        Source code
                        <small>
                          GitHub repository
                        </small>
                      </span>
                    </a>
                    <a href="https://github.com/NEXacxlerate/Brand-Shield/blob/main/docs/USER_GUIDE.md" target="_blank" rel="noopener">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M4 5h16v14H4z" />
                        </svg>
                      </span>
                      <span>
                        User guide
                        <small>
                          Every page, scoring, troubleshooting
                        </small>
                      </span>
                    </a>
                    <a href="https://github.com/NEXacxlerate/Brand-Shield/blob/main/docs/FEATURE_STATUS.md" target="_blank" rel="noopener">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                      </span>
                      <span>
                        Feature status
                        <small>
                          What is verified on real data
                        </small>
                      </span>
                    </a>
                    <a href="https://github.com/NEXacxlerate/Brand-Shield/blob/main/docs/SECURITY.md" target="_blank" rel="noopener">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <rect x="5" y="10" width="14" height="10" rx="2" />
                          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                        </svg>
                      </span>
                      <span>
                        Security
                        <small>
                          SSRF guard, tokens, roles
                        </small>
                      </span>
                    </a>
                  </div>
                </div>
              </div>
              <div className="nitem">
                <a href="#studio">
                  Studio
                </a>
                <div className="mega" role="region" aria-label="Brand Studio">
                  <div>
                    <div className="mtitle">
                      the
                      <b>
                        /
                      </b>
                      studio
                      <b>
                        .
                      </b>
                    </div>
                    <svg viewBox="0 0 200 170" width="190" aria-hidden="true" style={{ marginTop: "18px" }}>
                      <defs>
                        <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#FF9AAA" />
                          <stop offset="1" stopColor="#B3123A" />
                        </linearGradient>
                      </defs>
                      <rect x="50" y="40" width="100" height="100" rx="26" fill="url(#g5)" transform="rotate(-12 100 90)" />
                      <circle cx="84" cy="84" r="7" fill="#fff" />
                      <circle cx="116" cy="80" r="7" fill="#fff" />
                      <path d="M82 106c10 9 26 8 34-2" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="mlist">
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M4 20h16M6 16l10-10 2 2L8 18z" />
                        </svg>
                      </span>
                      Brand naming
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="8" />
                        </svg>
                      </span>
                      Logo designer
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <circle cx="8" cy="8" r="3" />
                          <circle cx="16" cy="8" r="3" />
                          <circle cx="12" cy="16" r="3" />
                        </svg>
                      </span>
                      Colour palettes
                    </a>
                    <a href="/login">
                      <span className="mi">
                        <svg className="ic" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
                        </svg>
                      </span>
                      Protect in one click
                    </a>
                  </div>
                </div>
              </div>
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <a href="/login" className="pill">
                Get in Touch
              </a>
              <a href="/login" className="round" aria-label="Get in touch">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </a>
            </div>
          </div>
        </header>
        <div className="herowrap">
          <div className="vlayer">
            <figure className="vcard" aria-label="BrandShield product video">
              <div className="vfallback" aria-hidden="true">
                <svg width="64" height="64" viewBox="0 0 48 48">
                  <path d="M24 3l17 6v13c0 10-7 18-17 23C14 40 7 32 7 22V9z" fill="#4F63F0" />
                  <path d="M16 24l6 6 11-12" stroke="#08080B" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  BrandShield intro video
                </span>
              </div>
              <video id="introVideo" src="/brandshield-intro.mp4" autoPlay muted loop playsInline preload="metadata" ref={videoRef}></video>
              <span className="vchip">
                <i />
                Product tour
              </span>
              <button className="vsound" id="introSound" type="button" aria-pressed="false" aria-label="Turn sound on" ref={soundRef}>
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M4 9h4l5-4v14l-5-4H4z" />
                  <path className="wave" d="M17 9c1.5 1.5 1.5 4.5 0 6M19.5 6.5c3 3 3 8 0 11" />
                  <path className="mute" d="M17 9l5 6M22 9l-5 6" />
                </svg>
                <span>
                  Sound on
                </span>
              </button>
            </figure>
          </div>
          <section id="top" className="hero">
            <div className="aur a1" aria-hidden="true"></div>
            <div className="aur a2" aria-hidden="true"></div>
            <div className="aur a3" aria-hidden="true"></div>
            <div className="stars" aria-hidden="true"></div>
            <div className="floor" aria-hidden="true"></div>
            <div className="horizon" aria-hidden="true"></div>
            <svg viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", bottom: "250px", width: "100%", height: "150px", zIndex: "-1", opacity: ".75" }}>
              <defs>
                <linearGradient id="tr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1E1E2A" />
                  <stop offset="1" stopColor="#08080B" />
                </linearGradient>
              </defs>
              <path d="M0 300 V170 C140 90 230 120 330 150 C430 70 520 70 620 140 C720 90 820 70 920 140 C1020 90 1120 100 1220 150 C1310 110 1380 120 1440 140 V300Z" fill="url(#tr)" />
              <path d="M0 170 C140 90 230 120 330 150 C430 70 520 70 620 140 C720 90 820 70 920 140 C1020 90 1120 100 1220 150 C1310 110 1380 120 1440 140" fill="none" stroke="#8B9BFF" strokeOpacity=".25" />
            </svg>
            <div className="htop">
              <span className="kicker">
                <i />
                Digital Risk Protection
              </span>
              <span className="mut" style={{ fontSize: "13px", lineHeight: "1.35" }}>
                Social, app and web
                <br />
                impersonation, explained
              </span>
            </div>
            <div className="orbw" aria-hidden="true">
              <span className="ring r3"></span>
              <span className="ring r2"></span>
              <span className="ring r1"></span>
              <span className="orb float"></span>
              <span className="sweep"></span>
              <span className="blip" style={{ left: "22%", top: "30%", color: "#F0566A", background: "#F0566A", animationDelay: ".2s" }}></span>
              <span className="blip" style={{ left: "78%", top: "40%", color: "#F59E55", background: "#F59E55", animationDelay: "1.6s" }}></span>
              <span className="blip" style={{ left: "64%", top: "80%", color: "#4F9DFF", background: "#4F9DFF", animationDelay: "3s" }}></span>
              <span className="blip" style={{ left: "30%", top: "74%", color: "#34D399", background: "#34D399", animationDelay: "4.1s" }}></span>
            </div>
            <div className="hcenter" style={{ position: "relative", zIndex: "3" }}>
              <div className="search" role="search">
                <svg className="ic" viewBox="0 0 24 24" style={{ color: "#3A3A47" }} aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m20 20-4-4" />
                </svg>
                <label className="vh" htmlFor="q">
                  Check a name, handle, app or domain
                </label>
                <input id="q" placeholder="Test a name, handle, app or domain against your brand" />
                <a href="/login" className="go" aria-label="Check">
                  <svg className="ic" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                    <path d="M7 17 17 7M9 7h8v8" />
                  </svg>
                </a>
              </div>
              <div className="sugg">
                <a href="#engine" style={{ animationDelay: ".15s" }}>
                  Will my official accounts ever be flagged?
                </a>
                <a href="#work" style={{ animationDelay: ".25s" }}>
                  How is every risk score explained?
                </a>
                <a href="#expertise" style={{ animationDelay: ".35s" }}>
                  Can it catch acm3bank or A C M E Bank?
                </a>
                <a href="#marquee" style={{ animationDelay: ".45s" }}>
                  Does it watch the App Store and Google Play?
                </a>
                <a href="#about" style={{ animationDelay: ".55s" }}>
                  Is anything taken down automatically?
                </a>
                <a href="#engine" style={{ animationDelay: ".65s" }}>
                  What do Live and Sample modes mean?
                </a>
              </div>
            </div>
            <svg className="geo" viewBox="0 0 150 150" aria-hidden="true">
              <path d="M150 0 A150 150 0 0 0 0 150 L75 150 A75 75 0 0 1 150 75Z" fill="#000" stroke="rgba(255,255,255,.16)" />
              <path d="M150 75 A75 75 0 0 0 75 150 L150 150Z" fill="#4F63F0" opacity=".85" />
            </svg>
            <h1 className="hhead">
              Threat detection,
              <br />
              <em>
                built to protect.
              </em>
            </h1>
            <nav className="hlabels" aria-label="How a scan works">
              <a href="#marquee">
                <span>
                  01
                </span>
                Collect /
              </a>
              <a href="#expertise">
                <span>
                  02
                </span>
                Match /
              </a>
              <a href="#work">
                <span>
                  03
                </span>
                Score /
              </a>
              <a href="#engine">
                <span>
                  04
                </span>
                Review /
              </a>
            </nav>
          </section>
          <div id="how" className="vspacer" aria-hidden="true"></div>
        </div>
        <section className="cycle" aria-label="Detection highlights">
          <div className="cyc">
            <span className="wm" style={{ fontSize: "clamp(34px,5vw,66px)" }}>
              acm
              <span style={{ color: "var(--red)" } as CSSProperties}>
                3
              </span>
              bank
            </span>
            <span className="mono" style={{ fontSize: "clamp(20px,2.4vw,30px)", color: "var(--dim)" } as CSSProperties}>
              →
            </span>
            <span className="wm" style={{ fontSize: "clamp(34px,5vw,66px)", color: "var(--grnt)" } as CSSProperties}>
              acmebank
            </span>
            <span className="cap">
              Digit swaps, homoglyphs and spacing are normalised before matching
            </span>
          </div>
          <div className="cyc">
            <svg viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="#A78BFA" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 16l-5-5-9 9" />
            </svg>
            <span style={{ fontWeight: "800", fontSize: "clamp(34px,5vw,64px)", letterSpacing: "-.03em", lineHeight: ".95" }}>
              LOGO MATCH
              <br />
              <span style={{ fontWeight: "300", fontStyle: "italic", fontSize: ".5em", color: "var(--purt)" } as CSSProperties}>
                CLIP vision plus perceptual hashes
              </span>
            </span>
          </div>
          <div className="cyc">
            <span style={{ width: "150px", height: "150px", borderRadius: "50%", background: "linear-gradient(135deg,var(--b1),var(--b2))", display: "grid", placeItems: "center" } as CSSProperties}>
              <span className="wm" style={{ fontSize: "24px", color: "#fff" }}>
                xn--
              </span>
            </span>
            <span className="wm" style={{ fontSize: "clamp(34px,5vw,64px)" }}>
              Look-alike
              <br />
              Domains
            </span>
            <span className="cap">
              Punycode, TLD swaps and brand-in-subdomain tricks
            </span>
          </div>
        </section>
        <section id="expertise" className="expert">
          <svg style={{ position: "absolute", right: "0", top: "0", width: "330px", height: "330px", zIndex: "1" }} viewBox="0 0 330 330" aria-hidden="true">
            <path d="M330 0 V165 A165 165 0 0 1 165 0Z" fill="#F2F3F7" />
            <path d="M165 0 A165 165 0 0 0 330 165 V330 A330 330 0 0 1 0 0Z" fill="#000" stroke="rgba(255,255,255,.12)" />
            <path d="M165 165 A165 165 0 0 0 330 330 H165Z" fill="#4F63F0" />
          </svg>
          <div className="wrap reveal" style={{ position: "relative", zIndex: "2" }}>
            <span className="eyebrow">
              Detection pillars
            </span>
            <h2 style={{ fontSize: "clamp(28px,3.4vw,44px)", fontWeight: "300", letterSpacing: "-.02em", lineHeight: "1.12", marginTop: "14px", maxWidth: "24ch" }}>
              Six Detection Pillars, One Explainable Score
            </h2>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "46px" }}>
              <a href="#xc1" className="round dark" aria-label="Previous">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </a>
              <a href="#xc6" className="round dark" aria-label="Next">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </a>
            </div>
          </div>
          <div className="xrow" style={{ zIndex: "2", marginTop: "18px" }}>
            <a id="xc1" href="#work" className="xcard">
              <div className="xbody" style={{ background: "var(--lav)" } as CSSProperties}>
                <div className="xk">
                  Name &amp; handle look-alikes
                </div>
                <div className="xt">
                  Catch acm3bank and A&nbsp;C&nbsp;M&nbsp;E Bank
                </div>
                <div className="xd">
                  Homoglyphs, digit swaps, separators, missing letters and added scam words.
                </div>
                <svg className="xart" viewBox="0 0 170 150" fill="none" stroke="#121218" strokeWidth="2" aria-hidden="true">
                  <circle cx="70" cy="62" r="34" />
                  <path d="M95 87l40 40" />
                  <path d="M52 62h36M60 50h20" />
                </svg>
                <span className="xexp">
                  Explore
                </span>
              </div>
              <span className="xarrow">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </a>
            <a id="xc2" href="#work" className="xcard">
              <div className="xbody" style={{ background: "var(--sky)" } as CSSProperties}>
                <div className="xk">
                  Domain look-alikes
                </div>
                <div className="xt">
                  Spot Typo and Punycode Domains
                </div>
                <div className="xd">
                  Registrable-domain comparison, TLD swaps, brand-in-subdomain, Safe Browsing.
                </div>
                <svg className="xart" viewBox="0 0 170 150" fill="none" stroke="#121218" strokeWidth="2" aria-hidden="true">
                  <circle cx="85" cy="70" r="48" />
                  <path d="M37 70h96M85 22c20 20 20 76 0 96M85 22c-20 20-20 76 0 96" />
                </svg>
                <span className="xexp">
                  Explore
                </span>
              </div>
              <span className="xarrow">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </a>
            <a id="xc3" href="#work" className="xcard">
              <div className="xbody" style={{ background: "var(--yel)" } as CSSProperties}>
                <div className="xk">
                  Logo &amp; app-icon similarity
                </div>
                <div className="xt">
                  See a Copied Logo, Not Just a Name
                </div>
                <div className="xd">
                  CLIP ViT-B/32 image embeddings plus perceptual-hash fingerprints.
                </div>
                <svg className="xart" viewBox="0 0 170 150" fill="none" stroke="#121218" strokeWidth="2" aria-hidden="true">
                  <rect x="20" y="30" width="56" height="56" rx="10" />
                  <rect x="94" y="30" width="56" height="56" rx="10" />
                  <path d="M48 46l10 24H38zM122 46l10 24h-20z" />
                  <path d="M76 58h18" />
                </svg>
                <span className="xexp">
                  Explore
                </span>
              </div>
              <span className="xarrow">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </a>
            <a id="xc4" href="#work" className="xcard">
              <div className="xbody" style={{ background: "var(--peach)" } as CSSProperties}>
                <div className="xk">
                  Bio &amp; description analysis
                </div>
                <div className="xt">
                  Read the Lure Behind the Profile
                </div>
                <div className="xd">
                  KYC lures, fees, “DM us”, cashback and urgency. Optional Gemini check.
                </div>
                <svg className="xart" viewBox="0 0 170 150" fill="none" stroke="#121218" strokeWidth="2" aria-hidden="true">
                  <path d="M20 20h130v80H60l-30 26v-26H20z" />
                  <path d="M40 48h90M40 70h60" />
                </svg>
                <span className="xexp">
                  Explore
                </span>
              </div>
              <span className="xarrow">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </a>
            <a id="xc5" href="#work" className="xcard">
              <div className="xbody" style={{ background: "var(--mint)" } as CSSProperties}>
                <div className="xk">
                  Account &amp; app signals
                </div>
                <div className="xt">
                  Weigh Age, Activity and Publisher
                </div>
                <div className="xd">
                  A new account or an app from another publisher adds points with a reason.
                </div>
                <svg className="xart" viewBox="0 0 170 150" fill="none" stroke="#121218" strokeWidth="2" aria-hidden="true">
                  <path d="M30 120V70M65 120V40M100 120V85M135 120V25" />
                  <path d="M20 128h130" />
                </svg>
                <span className="xexp">
                  Explore
                </span>
              </div>
              <span className="xarrow">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </a>
            <a id="xc6" href="#work" className="xcard">
              <div className="xbody" style={{ background: "var(--rose)" } as CSSProperties}>
                <div className="xk">
                  Official-asset exclusion
                </div>
                <div className="xt">
                  Your Own Accounts Are Never Flagged
                </div>
                <div className="xd">
                  Excluded by exact handle, URL or app id before scoring, never by name alone.
                </div>
                <svg className="xart" viewBox="0 0 170 150" fill="none" stroke="#121218" strokeWidth="2" aria-hidden="true">
                  <path d="M85 14l52 18v34c0 30-22 52-52 64-30-12-52-34-52-64V32z" />
                  <path d="M64 72l14 14 28-30" />
                </svg>
                <span className="xexp">
                  Explore
                </span>
              </div>
              <span className="xarrow">
                <svg className="ic" viewBox="0 0 24 24">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </a>
          </div>
        </section>
        <FeatureCarousel />
        <section id="work" style={{ padding: "90px 0 110px", background: "#000" }}>
          <div className="wrap">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px", gap: "16px", flexWrap: "wrap" }}>
              <span className="eyebrow">
                Threats at a Glance.
              </span>
              <span className="dim" style={{ fontSize: "12.5px" }}>
                Illustrations from the built-in sample data · every point has a reason
              </span>
            </div>
            <div className="wgrid">
              <a href="#about" className="wcard" aria-label="Fake support profile example">
                <div className="wart" style={{ background: "radial-gradient(120% 90% at 20% 20%,#FFD36B 0%,#FF8A00 35%,#E2420F 70%,#8C1A0A 100%)" }}>
                  <svg viewBox="0 0 400 540" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M-20 200 C120 120 200 320 420 180" stroke="#FFF1B8" strokeOpacity=".5" strokeWidth="40" fill="none" />
                    <path d="M-20 360 C140 260 240 460 420 320" stroke="#FFC24A" strokeOpacity=".5" strokeWidth="60" fill="none" />
                  </svg>
                  <span className="wtag">
                    Social Threats
                  </span>
                  <span className="wm" style={{ position: "absolute", left: "0", right: "0", top: "44%", textAlign: "center", fontSize: "36px", color: "#7A0D16" }}>
                    @acmebank
                    <br />
                    <span style={{ color: "#fff" }}>
                      _support
                    </span>
                  </span>
                </div>
                <div className="wshot">
                  <div className="dim" style={{ fontSize: "12px" }}>
                    INSTAGRAM · fake profile
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                    <b style={{ fontSize: "18px" }}>
                      @acmebank_support
                    </b>
                    <span className="band b-hi">
                      High 92
                    </span>
                  </div>
                  <div style={{ marginTop: "14px" }}>
                    <div className="reason">
                      <span>
                        Name looks like your brand + “support”
                      </span>
                      <b>
                        +31
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Profile picture is a copy of your logo
                      </span>
                      <b>
                        +24
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Bio asks for KYC details via DM
                      </span>
                      <b>
                        +22
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Account is new with little activity
                      </span>
                      <b>
                        +15
                      </b>
                    </div>
                  </div>
                  <div className="dim" style={{ fontSize: "11.5px", marginTop: "12px" }}>
                    Points add up to the score. Review it, then confirm, dismiss or mark official.
                  </div>
                </div>
                <span className="see">
                  See Detail
                </span>
              </a>
              <a href="#about" className="wcard" aria-label="Cloned app example">
                <div className="wart" style={{ background: "#000" }}>
                  <svg viewBox="0 0 400 540" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#5BFF6A" />
                        <stop offset=".6" stopColor="#1B9C3A" />
                        <stop offset="1" stopColor="#4F63F0" />
                      </linearGradient>
                    </defs>
                    <g stroke="url(#gl)" strokeWidth="5">
                      <path d="M40 60 L120 480" />
                      <path d="M60 40 L150 500" />
                      <path d="M80 30 L180 510" />
                      <path d="M110 20 L210 520" />
                      <path d="M140 30 L240 520" />
                      <path d="M170 40 L270 510" />
                      <path d="M200 60 L300 500" />
                      <path d="M230 80 L330 490" />
                      <path d="M260 110 L360 470" />
                      <path d="M290 140 L390 450" />
                    </g>
                  </svg>
                  <span className="wtag">
                    App Threats
                  </span>
                  <span className="wm" style={{ position: "absolute", left: "0", right: "0", top: "46%", textAlign: "center", fontSize: "36px", color: "#fff" }}>
                    KYC
                    <span style={{ display: "inline-block", background: "#5BFF6A", color: "#000", borderRadius: "8px", padding: "0 8px", marginLeft: "6px" }}>
                      Update
                    </span>
                  </span>
                </div>
                <div className="wshot">
                  <div className="dim" style={{ fontSize: "12px" }}>
                    GOOGLE PLAY · fake app
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                    <b style={{ fontSize: "18px" }}>
                      Acme Bank KYC Update
                    </b>
                    <span className="band b-hi">
                      High 88
                    </span>
                  </div>
                  <div style={{ marginTop: "14px" }}>
                    <div className="reason">
                      <span>
                        App icon matches your logo
                      </span>
                      <b>
                        +27
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Publisher is not your registered publisher
                      </span>
                      <b>
                        +22
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        App name resembles your brand
                      </span>
                      <b>
                        +21
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Description repeats a KYC lure
                      </span>
                      <b>
                        +12
                      </b>
                    </div>
                  </div>
                  <div className="dim" style={{ fontSize: "11.5px", marginTop: "12px" }}>
                    Your own package ids are excluded before scoring.
                  </div>
                </div>
                <span className="see">
                  See Detail
                </span>
              </a>
              <a href="#about" className="wcard" aria-label="Look-alike domain example">
                <div className="wart" style={{ background: "radial-gradient(130% 100% at 70% 30%,#FF6A84 0%,#D41B47 40%,#7A0F2B 80%,#3D0716 100%)" }}>
                  <span className="wtag">
                    Web Threats
                  </span>
                  <span style={{ position: "absolute", left: "0", right: "0", top: "40%", textAlign: "center", lineHeight: "1.05" }}>
                    <span className="wm" style={{ fontSize: "30px", color: "#13050A" }}>
                      acmebank.com
                    </span>
                    <br />
                    <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: "24px", color: "#fff" }}>
                      .verify-account
                    </span>
                    <br />
                    <span className="wm" style={{ fontSize: "22px", color: "#13050A" }}>
                      .example
                    </span>
                  </span>
                </div>
                <div className="wshot">
                  <div className="dim" style={{ fontSize: "12px" }}>
                    DOMAIN LAB · look-alike link
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                    <b style={{ fontSize: "16px", wordBreak: "break-all" }}>
                      acmebank.com.verify-account.example
                    </b>
                    <span className="band b-md">
                      Medium 76
                    </span>
                  </div>
                  <div style={{ marginTop: "14px" }}>
                    <div className="reason">
                      <span>
                        Brand name hidden inside a subdomain
                      </span>
                      <b>
                        flag
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Registrable domain is not yours
                      </span>
                      <b>
                        flag
                      </b>
                    </div>
                    <div className="reason">
                      <span>
                        Safe Browsing
                      </span>
                      <b>
                        unavailable
                      </b>
                    </div>
                  </div>
                  <div className="dim" style={{ fontSize: "11.5px", marginTop: "12px" }}>
                    URLs are never opened. “Unavailable” means not checked, never “clean”.
                  </div>
                </div>
                <span className="see">
                  See Detail
                </span>
              </a>
            </div>
          </div>
        </section>
        <section id="marquee" style={{ background: "var(--shell)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "30px 0", overflow: "hidden" } as CSSProperties} aria-label="Sources and techniques">
          <div className="marq" aria-hidden="true">
            <span>
              Tavily
            </span>
            <span>
              Apple iTunes Search
            </span>
            <span>
              Google Play
            </span>
            <span>
              SearXNG
            </span>
            <span>
              Google Safe Browsing
            </span>
            <span>
              Instagram
            </span>
            <span>
              X
            </span>
            <span>
              Facebook
            </span>
            <span>
              LinkedIn
            </span>
            <span>
              YouTube
            </span>
            <span>
              CLIP ViT-B/32
            </span>
            <span>
              RapidFuzz
            </span>
            <span>
              tldextract
            </span>
            <span>
              Tavily
            </span>
            <span>
              Apple iTunes Search
            </span>
            <span>
              Google Play
            </span>
            <span>
              SearXNG
            </span>
            <span>
              Google Safe Browsing
            </span>
            <span>
              Instagram
            </span>
            <span>
              X
            </span>
            <span>
              Facebook
            </span>
            <span>
              LinkedIn
            </span>
            <span>
              YouTube
            </span>
            <span>
              CLIP ViT-B/32
            </span>
            <span>
              RapidFuzz
            </span>
            <span>
              tldextract
            </span>
          </div>
          <p className="vh">
            Sources: Tavily web search, Apple iTunes Search, optional Google Play and SearXNG, Google Safe Browsing. Official accounts on Instagram, X, Facebook, LinkedIn and YouTube. Techniques: CLIP, RapidFuzz, tldextract.
          </p>
        </section>
        <section id="about" style={{ padding: "110px 0 100px" }}>
          <div className="wrap">
            <span className="eyebrow">
              About BrandShield
            </span>
            <h2 className="giant" style={{ marginTop: "22px" }} aria-label="Protecting Digital Identity">
              <span style={{ "--i": "0" } as CSSProperties}>
                P
              </span>
              <span style={{ "--i": "1" } as CSSProperties}>
                r
              </span>
              <span style={{ "--i": "2" } as CSSProperties}>
                o
              </span>
              <span style={{ "--i": "3" } as CSSProperties}>
                t
              </span>
              <span style={{ "--i": "4" } as CSSProperties}>
                e
              </span>
              <span style={{ "--i": "5" } as CSSProperties}>
                c
              </span>
              <span style={{ "--i": "6" } as CSSProperties}>
                t
              </span>
              <span style={{ "--i": "7" } as CSSProperties}>
                i
              </span>
              <span style={{ "--i": "8" } as CSSProperties}>
                n
              </span>
              <span style={{ "--i": "9" } as CSSProperties}>
                g
              </span>
              {' '}
              <span style={{ "--i": "10" } as CSSProperties}>
                D
              </span>
              <span style={{ "--i": "11" } as CSSProperties}>
                i
              </span>
              <span style={{ "--i": "12" } as CSSProperties}>
                g
              </span>
              <span style={{ "--i": "13" } as CSSProperties}>
                i
              </span>
              <span style={{ "--i": "14" } as CSSProperties}>
                t
              </span>
              <span style={{ "--i": "15" } as CSSProperties}>
                a
              </span>
              <span style={{ "--i": "16" } as CSSProperties}>
                l
              </span>
              <br />
              <span style={{ "--i": "17" } as CSSProperties}>
                I
              </span>
              <span style={{ "--i": "18" } as CSSProperties}>
                d
              </span>
              <span style={{ "--i": "19" } as CSSProperties}>
                e
              </span>
              <span style={{ "--i": "20" } as CSSProperties}>
                n
              </span>
              <span style={{ "--i": "21" } as CSSProperties}>
                t
              </span>
              <span style={{ "--i": "22" } as CSSProperties}>
                i
              </span>
              <span style={{ "--i": "23" } as CSSProperties}>
                t
              </span>
              <span style={{ "--i": "24" } as CSSProperties}>
                y
              </span>
            </h2>
            <div className="reveal" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "22px", marginTop: "40px" }}>
              <p style={{ maxWidth: "54ch", textAlign: "right", fontSize: "17px", lineHeight: "1.5" }}>
                Describe your brand once. BrandShield searches public sources for look-alike social profiles and fake apps, checks look-alike websites you add or import, scores every suspect with a reason for every point, excludes your official assets, and prepares evidence-backed reports a person approves.
              </p>
              <a href="#engine" className="round" style={{ width: "62px", height: "62px" }} aria-label="How it works">
                <svg className="ic" viewBox="0 0 24 24" style={{ width: "22px", height: "22px" }}>
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </a>
            </div>
            <div className="acards reveal" style={{ marginTop: "46px" }}>
              <a id="ac1" href="#engine" className="acard" style={{ background: "#F6B8E8", color: "var(--onp)" } as CSSProperties}>
                <svg viewBox="0 0 300 340" style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} aria-hidden="true">
                  <path d="M0 160 C60 120 90 200 150 160 S260 100 300 150 V340 H0Z" fill="#C860B8" />
                  <path d="M0 210 C70 170 110 250 170 210 S270 160 300 200 V340 H0Z" fill="#8E2F86" />
                  <path d="M0 270 C80 230 120 300 190 265 S280 230 300 260 V340 H0Z" fill="#5E1A5C" />
                </svg>
                <h3>
                  Explainable Scoring
                </h3>
                <p style={{ borderColor: "#121218" }}>
                  Points from each signal add up to the score. Signals show present, clean or unavailable.
                </p>
              </a>
              <a id="ac2" href="#engine" className="acard" style={{ background: "#000" }}>
                <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "130px", background: "linear-gradient(180deg,#4F63F0,#141A5A 60%,transparent)" }}></div>
                <h3 style={{ marginTop: "118px" }}>
                  Human in the Loop
                </h3>
                <p>
                  Confirm, dismiss or mark official. Nothing is ever sent or taken down automatically.
                </p>
              </a>
              <a id="ac3" href="#engine" className="acard" style={{ background: "#0A0904" }}>
                <svg viewBox="0 0 300 340" style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} aria-hidden="true">
                  <defs>
                    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#FFF0B0" />
                      <stop offset=".5" stopColor="#D4A124" />
                      <stop offset="1" stopColor="#5C4300" />
                    </linearGradient>
                  </defs>
                  <g fill="none" stroke="url(#gold)" strokeWidth="2.4">
                    <path d="M-10 60 C80 20 160 140 310 70" />
                    <path d="M-10 80 C80 40 160 160 310 90" />
                    <path d="M-10 100 C80 60 160 180 310 110" />
                    <path d="M-10 120 C80 80 160 200 310 130" />
                    <path d="M-10 140 C80 100 160 220 310 150" />
                    <path d="M-10 160 C80 120 160 240 310 170" />
                  </g>
                </svg>
                <h3 style={{ marginTop: "200px" }}>
                  Evidence With SHA-256
                </h3>
                <p>
                  Each saved snapshot records its SHA-256 hash, and every report lists it with the capture time and page URL.
                </p>
              </a>
              <a id="ac4" href="#engine" className="acard" style={{ background: "#000" }}>
                <svg viewBox="0 0 300 340" style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} aria-hidden="true">
                  <g fill="none" stroke="#B8FF4A" strokeWidth="2">
                    <path d="M0 310 C60 230 120 310 180 240 S280 250 300 210" />
                    <path d="M0 320 C60 245 120 320 180 255 S280 265 300 225" />
                    <path d="M0 330 C60 260 120 330 180 270 S280 280 300 240" />
                  </g>
                </svg>
                <h3>
                  Honest About Its Data
                </h3>
                <p>
                  Sample data is labelled on every data page. A failed source does not stop a scan.
                </p>
              </a>
              <a id="ac5" href="#studio" className="acard" style={{ background: "linear-gradient(160deg,#A78BFA,#2D1D6B)" }}>
                <h3>
                  Brand Studio Built In
                </h3>
                <p>
                  AI naming, logos, palettes and copy, then protect the brand in one click.
                </p>
              </a>
              <a id="ac6" href="#engine" className="acard" style={{ background: "linear-gradient(160deg,#1F8A68,#0B3D2D)" }}>
                <h3>
                  Your Workspace Only
                </h3>
                <p>
                  Each account owns its brands. Viewer, analyst and admin roles. Sign-ins and changes are written to an audit log.
                </p>
              </a>
            </div>
            <div className="dots" aria-label="Cards">
              <a href="#ac1" className="on" aria-label="Card 1"></a>
              <a href="#ac2" aria-label="Card 2"></a>
              <a href="#ac3" aria-label="Card 3"></a>
              <a href="#ac4" aria-label="Card 4"></a>
              <a href="#ac5" aria-label="Card 5"></a>
              <a href="#ac6" aria-label="Card 6"></a>
            </div>
          </div>
        </section>
        <section id="engine" style={{ padding: "40px 0 100px" }}>
          <div className="wrap" style={{ display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
            <div className="reveal" style={{ flex: "1 1 360px", minWidth: "0" }}>
              <svg viewBox="0 0 420 380" width="100%" style={{ maxWidth: "440px" }} aria-hidden="true">
                <defs>
                  <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#C9B8FF" />
                    <stop offset=".45" stopColor="#5B4FE0" />
                    <stop offset="1" stopColor="#120A2E" />
                  </linearGradient>
                </defs>
                <g fill="none" stroke="url(#arc)">
                  <path d="M40 30 A170 170 0 0 0 210 200" strokeWidth="58" />
                  <path d="M380 30 A170 170 0 0 1 210 200" strokeWidth="58" opacity=".85" />
                  <path d="M110 200 A100 100 0 0 0 210 300" strokeWidth="40" opacity=".7" />
                  <path d="M310 200 A100 100 0 0 1 210 300" strokeWidth="40" opacity=".55" />
                </g>
              </svg>
              <div className="mut" style={{ marginTop: "14px", fontSize: "13px" }}>
                The engine behind every scan
              </div>
              <div className="wm" style={{ fontSize: "20px", marginTop: "6px" }}>
                BRAND
                <br />
                SHIELD
              </div>
              <a href="https://github.com/NEXacxlerate/Brand-Shield" target="_blank" rel="noopener" className="pill" style={{ marginTop: "14px", height: "36px", fontSize: "12.5px" }}>
                View the Source
                {' '}
                <svg className="ic" viewBox="0 0 24 24" style={{ width: "13px", height: "13px" }}>
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </a>
            </div>
            <div className="reveal" style={{ flex: "1 1 460px", minWidth: "0" }}>
              <p style={{ fontSize: "17px", lineHeight: "1.55", maxWidth: "48ch" }}>
                Every scan runs the same pipeline, and every step is visible:
              </p>
              <div className="pipe" style={{ marginTop: "16px" }}>
                <span>
                  Collect
                </span>
                <i>
                  →
                </i>
                <span>
                  De-duplicate
                </span>
                <i>
                  →
                </i>
                <span>
                  Allowlist exclusion
                </span>
                <i>
                  →
                </i>
                <span>
                  Name match
                </span>
                <i>
                  →
                </i>
                <span>
                  Logo &amp; text signals
                </span>
                <i>
                  →
                </i>
                <span>
                  Score
                </span>
                <i>
                  →
                </i>
                <span>
                  Human review
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "22px", marginTop: "30px" }}>
                <div className="gcard">
                  <a href="#work" className="round" aria-label="Risk bands">
                    <svg className="ic" viewBox="0 0 24 24" style={{ width: "12px", height: "12px" }}>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </a>
                  <b>
                    Risk bands
                  </b>
                  <br />
                  High 85–100 · Medium 70–84 · Low below 70. A severity chip from Low to Critical sits next to each band.
                </div>
                <div className="gcard">
                  <a href="#marquee" className="round" aria-label="Data modes">
                    <svg className="ic" viewBox="0 0 24 24" style={{ width: "12px", height: "12px" }}>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </a>
                  <b>
                    Live, Sample or Auto
                  </b>
                  <br />
                  Live searches real sources with a credit guard. Sample uses fictional data, clearly badged. Auto picks live only when a source is configured.
                </div>
              </div>
            </div>
          </div>
          <div className="wrap reveal" style={{ marginTop: "56px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "18px" }}>
              <div className="stat">
                <div className="v">
                  ~1,240
                </div>
                <div className="l">
                  Backend tests
                </div>
                <div className="n">
                  pytest on SQLite and PostgreSQL in CI
                </div>
              </div>
              <div className="stat">
                <div className="v">
                  7 / 7
                </div>
                <div className="l">
                  Canary checks pass
                </div>
                <div className="n">
                  Proves the pipeline logic after any change
                </div>
              </div>
              <div className="stat">
                <div className="v">
                  12 / 12
                </div>
                <div className="l">
                  Look-alike Lab cases
                </div>
                <div className="n">
                  With the standard Acme Bank profile
                </div>
              </div>
              <div className="stat">
                <div className="v">
                  94.4%
                </div>
                <div className="l">
                  Recall on synthetic names
                </div>
                <div className="n">
                  Optimistic by design; real precision comes from reviewers
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="studio" style={{ padding: "20px 0 110px" }}>
          <div className="wrap">
            <div className="reveal" style={{ borderRadius: "28px", border: "1px solid var(--line2)", background: "radial-gradient(700px 360px at 85% 20%,rgba(167,139,250,.22),transparent 65%),radial-gradient(600px 320px at 10% 90%,rgba(79,99,240,.2),transparent 65%),var(--card)", padding: "48px", display: "flex", flexWrap: "wrap", gap: "36px", alignItems: "center" } as CSSProperties}>
              <div style={{ flex: "1 1 380px", minWidth: "0" }}>
                <span className="eyebrow">
                  Brand Studio
                </span>
                <h2 style={{ fontSize: "clamp(28px,3.4vw,44px)", fontWeight: "300", letterSpacing: "-.02em", lineHeight: "1.12", marginTop: "14px" }}>
                  Create a brand,
                  <br />
                  then protect it in one click.
                </h2>
                <p className="mut" style={{ marginTop: "14px", maxWidth: "46ch" }}>
                  An AI toolkit inside BrandShield for naming, logos, colour palettes and copy. One login serves both, and your new brand registers straight into BrandShield’s brand registry.
                </p>
                <a href="/login" className="pill grad" style={{ marginTop: "22px" }}>
                  Open Brand Studio
                  {' '}
                  <svg className="ic" viewBox="0 0 24 24" style={{ width: "14px", height: "14px" }}>
                    <path d="M7 17 17 7M9 7h8v8" />
                  </svg>
                </a>
              </div>
              <div style={{ flex: "1 1 340px", minWidth: "0", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "14px" }}>
                <div className="stat">
                  <div style={{ fontWeight: "700" }}>
                    Naming
                  </div>
                  <div className="n">
                    Brand name ideas
                  </div>
                </div>
                <div className="stat">
                  <div style={{ fontWeight: "700" }}>
                    Logo designer
                  </div>
                  <div className="n">
                    Generated or uploaded
                  </div>
                </div>
                <div className="stat">
                  <div style={{ fontWeight: "700" }}>
                    Palettes &amp; copy
                  </div>
                  <div className="n">
                    Colours, taglines, content
                  </div>
                </div>
                <div className="stat" style={{ borderColor: "rgba(139,155,255,.5)" }}>
                  <div style={{ fontWeight: "700", color: "var(--acc)" } as CSSProperties}>
                    Protect in BrandShield
                  </div>
                  <div className="n">
                    Registers the brand for scanning
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <footer id="contact" style={{ borderTop: "1px solid var(--line)", padding: "80px 0 28px", background: "var(--shell)" } as CSSProperties}>
          <div className="wrap">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "48px", justifyContent: "space-between" }}>
              <div style={{ flex: "1 1 520px", minWidth: "0" }}>
                <div className="wm fwm">
                  BRAND
                  <br />
                  SHIELD
                </div>
                <div style={{ display: "flex", gap: "80px", flexWrap: "wrap", marginTop: "44px" }}>
                  <div>
                    <div style={{ fontSize: "16px" }}>
                      Reach us via email
                    </div>
                    <div className="mut" style={{ fontSize: "16px", marginTop: "4px" }}>
                      [hello@yourdomain.com]
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "16px" }}>
                      Source code
                    </div>
                    <a className="mut" style={{ fontSize: "16px", marginTop: "4px", display: "block" }} href="https://github.com/NEXacxlerate/Brand-Shield" target="_blank" rel="noopener">
                      github.com/NEXacxlerate/Brand-Shield
                    </a>
                  </div>
                </div>
              </div>
              <div style={{ flex: "0 1 430px", minWidth: "0" }}>
                <p style={{ fontSize: "15px" }}>
                  Ready to see who is borrowing your brand? Register it, run a scan, and review the evidence — starting today.
                </p>
                <div style={{ display: "flex", gap: "6px", marginTop: "16px" }}>
                  <a href="/login" className="" style={{ height: "36px", fontSize: "12.5px" }}>
                    Get in Touch
                  </a>
                  <a href="/login" className="" style={{ width: "36px", height: "36px" }} aria-label="Get in touch">
                    <svg className="ic" viewBox="0 0 24 24" style={{ width: "14px", height: "14px" }}>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </a>
                </div>
                <div style={{ fontWeight: "600", marginTop: "30px" }}>
                  Official accounts we allowlist
                </div>
                <p className="mut" style={{ fontSize: "13px", marginTop: "4px" }}>
                  Register your handles and apps; exact matches are excluded from every scan.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px" }}>
                  <span className="cov">
                    <i style={{ background: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)" }} />
                    Instagram
                  </span>
                  <span className="cov">
                    <i style={{ background: "#F2F3F7" }} />
                    X
                  </span>
                  <span className="cov">
                    <i style={{ background: "#1877F2" }} />
                    Facebook
                  </span>
                  <span className="cov">
                    <i style={{ background: "#0A66C2" }} />
                    LinkedIn
                  </span>
                  <span className="cov">
                    <i style={{ background: "#FF3B30" }} />
                    YouTube
                  </span>
                  <span className="cov">
                    <i style={{ background: "#8B9BFF" }} />
                    App Store
                  </span>
                  <span className="cov">
                    <i style={{ background: "linear-gradient(135deg,#34D399,#4F9DFF,#F3DE8C)" }} />
                    Google Play
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "64px", flexWrap: "wrap", marginTop: "60px" }}>
              <div>
                <div style={{ fontWeight: "600" }}>
                  Quick Links
                </div>
                <div className="mut" style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px", fontSize: "13.5px" }}>
                  <a href="#top">
                    Home
                  </a>
                  <a href="#expertise">
                    Detection pillars
                  </a>
                  <a href="#studio">
                    Brand Studio
                  </a>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: "600" }}>
                  Docs
                </div>
                <div className="mut" style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px", fontSize: "13.5px" }}>
                  <a href="https://github.com/NEXacxlerate/Brand-Shield/blob/main/docs/USER_GUIDE.md" target="_blank" rel="noopener">
                    User guide
                  </a>
                  <a href="https://github.com/NEXacxlerate/Brand-Shield/blob/main/docs/FEATURE_STATUS.md" target="_blank" rel="noopener">
                    Feature status
                  </a>
                  <a href="https://github.com/NEXacxlerate/Brand-Shield/blob/main/docs/SECURITY.md" target="_blank" rel="noopener">
                    Security
                  </a>
                </div>
              </div>
            </div>
            <div className="dim" style={{ fontSize: "12.5px", marginTop: "40px" }}>
              ©2026 BrandShield. Examples shown come from the built-in sample data; no real account is named.
            </div>
          </div>
        </footer>
        <a href="#top" className="totop" aria-label="Back to top">
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </a>
      </div>
    </div>
  );
}
