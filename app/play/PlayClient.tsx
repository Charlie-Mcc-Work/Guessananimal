"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

type Card = {
  imageUrl: string;          // image URL
  commonName: string;        // English name
  scientificName: string;    // Latin name
  license: string;
  source: string;
  attributions: string[];
};

type HistoryEntry = {
  imageUrl: string;
  commonName: string;
  scientificName: string;
  guess: string;
  correct: boolean;
  points: number;
  source: string;
  license: string;
  attributions: string[];
};

const ROUND_SIZE = 10;
const MODE_LIMITS: Record<string, number> = { fast: 10, normal: 20, slow: 30 };
const STOPWORDS = new Set(["the","a","an","of","and","&","common","eastern","western","northern","southern"]);

function tokenizeMeaningful(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/)
    .filter(Boolean).filter(w => !STOPWORDS.has(w)).filter(w => w.length >= 3);
}
function lcsLength(a: string[], b: string[]) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}
function seqEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export default function PlayClient() {
  const searchParams = useSearchParams();
  const modeParam = (searchParams.get("mode") || "normal").toLowerCase();
  const perQuestion = MODE_LIMITS[modeParam] ?? MODE_LIMITS.normal;
  const modeLabel = modeParam === "fast" ? "Fast (10s)" : modeParam === "slow" ? "Slow (30s)" : "Normal (20s)";

  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [guess, setGuess] = useState("");
  const [revealed, setRevealed] = useState(false);

  const [qIndex, setQIndex] = useState(0);
  const [points, setPoints] = useState(0);
  const [finalShown, setFinalShown] = useState(false);
  const [seenInRound, setSeenInRound] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // timers
  const [timeLeft, setTimeLeft] = useState(perQuestion); // pre-reveal
  const [postLeft, setPostLeft] = useState(30);          // post-reveal
  const questionTimerRef = useRef<number | null>(null);
  const postTimerRef = useRef<number | null>(null);

  // refs to avoid stale closures
  const revealedRef = useRef(revealed);
  const finalShownRef = useRef(finalShown);
  const qIndexRef = useRef(qIndex);
  const goNextRef = useRef<() => void>(() => {});

  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { finalShownRef.current = finalShown; }, [finalShown]);
  useEffect(() => { qIndexRef.current = qIndex; }, [qIndex]);

  const inputRef = useRef<HTMLInputElement>(null);

  function clearQuestionTimer() {
    if (questionTimerRef.current !== null) {
      window.clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }
  }
  function clearPostTimer() {
    if (postTimerRef.current !== null) {
      window.clearInterval(postTimerRef.current);
      postTimerRef.current = null;
    }
  }
  function startQuestionTimer() {
    clearQuestionTimer();
    setTimeLeft(perQuestion);
    questionTimerRef.current = window.setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  }
  function startPostTimer() {
    clearPostTimer();
    setPostLeft(30);
    postTimerRef.current = window.setInterval(() => {
      setPostLeft(prev => {
        const next = prev > 0 ? prev - 1 : 0;
        if (next === 0) {
          clearPostTimer();
          goNextRef.current();
        }
        return next;
      });
    }, 1000);
  }

  async function fetchCardUnique(maxTries = 6) {
    setLoading(true);
    setRevealed(false);
    setImageReady(false);
    setGuess("");
    clearQuestionTimer();
    clearPostTimer();

    let tries = 0;
    while (tries++ < maxTries) {
      try {
        // IMPORTANT: no silhouette param; add ts to bust caches
        const res = await fetch('/api/card?ts=${Date.now()}', { cache: "no-store" });
        const data: Card = await res.json();
        if (data?.imageUrl && !seenInRound.has(data.imageUrl)) {
          setCard(data);
          setSeenInRound(prev => new Set(prev).add(data.imageUrl));
          setTimeout(() => inputRef.current?.focus(), 50);
          setLoading(false);
          // wait for image load to start timer
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCardUnique();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perQuestion]);

  useEffect(() => () => { clearQuestionTimer(); clearPostTimer(); }, []);

  // auto-submit when pre-reveal timer hits 0
  useEffect(() => {
    if (imageReady && timeLeft === 0 && !revealedRef.current && card) {
      autoSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, imageReady, card]);

  function scoreGuess(current: Card, g: string) {
    const ansTokens = tokenizeMeaningful(current.commonName);
    if (ansTokens.length === 0) return { pts: 0, correct: false };
    const seen = new Set<string>();
    const guessTokensRaw = tokenizeMeaningful(g)
      .filter(t => ansTokens.includes(t))
      .filter(t => (seen.has(t) ? false : (seen.add(t), true)))
      .slice(0, ansTokens.length);
    if (seqEqual(ansTokens, guessTokensRaw)) return { pts: 10, correct: true };
    return { pts: lcsLength(ansTokens, guessTokensRaw), correct: false };
  }

  function finalizeCurrent(pts: number, correct: boolean) {
    if (!card) return;
    clearQuestionTimer();
    setPoints(p => p + pts);
    setRevealed(true);
    startPostTimer();
    setHistory(h => [...h, {
      imageUrl: card.imageUrl,
      commonName: card.commonName,
      scientificName: card.scientificName,
      guess,
      correct,
      points: pts,
      source: card.source,
      license: card.license,
      attributions: card.attributions || []
    }]);
  }

  function autoSubmit() {
    if (!card || revealedRef.current) return;
    const { pts, correct } = scoreGuess(card, guess);
    finalizeCurrent(pts, correct);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || revealedRef.current) return;
    const { pts, correct } = scoreGuess(card, guess);
    finalizeCurrent(pts, correct);
  };

  const handleNext = useCallback(() => {
    if (!revealedRef.current || finalShownRef.current) return;
    clearPostTimer();

    if (qIndexRef.current + 1 >= ROUND_SIZE) {
      setFinalShown(true);
      return;
    }
    setQIndex(i => i + 1);
    fetchCardUnique();
  }, []);
  useEffect(() => { goNextRef.current = handleNext; }, [handleNext]);

  const progress = `${qIndex + 1} / ${ROUND_SIZE}`;
  const questionUrgent = imageReady && !revealed && timeLeft <= 3;
  const postUrgent = revealed && !finalShown && postLeft <= 5;

  function handleImageLoaded() {
    setImageReady(true);
    startQuestionTimer();
  }
  function handleImageError() {
    fetchCardUnique();
  }

  return (
    <main className="container">
      <div className="card">
        <div className="header">
          <h1 className="h1">Guess the Animal</h1>
          <div className="row">
            <span className="badge">Q: {progress}</span>
            <span className="badge">Mode: {modeLabel}</span>
            {!revealed ? (
              <span className={`badge ${questionUrgent ? "timerUrgent" : ""}`}>
                ⏳ {imageReady ? `${timeLeft}s` : "…loading image"}
              </span>
            ) : (
              <span className={`badge ${postUrgent ? "timerUrgent" : ""}`}>
                ▶ Next in {postLeft}s
              </span>
            )}
            <span className="badge">Points: {points}</span>
          </div>
        </div>

        {finalShown ? (
          <>
            <p style={{fontSize:18, marginTop:10}}>
              🎉 <b>Round complete!</b> You scored <b>{points}</b> points.
            </p>

            <div className="summaryGrid">
              {history.map((h, idx) => {
                const status = h.correct ? "correct" : h.points > 0 ? "partial" : "wrong";
                return (
                  <div key={idx} className={`summaryCard ${status}`}>
                    <div className="thumb">
                      <Image
                        src={h.imageUrl}
                        alt={h.commonName}
                        fill
                        sizes="(max-width: 400px) 100vw, 33vw"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                    <h3 className={`summaryTitle ${status}`}>
                      {idx + 1}. {h.commonName}{" "}
                      <span style={{color:"var(--muted)"}}>({h.scientificName})</span>
                    </h3>
                    <div className="summaryMeta">
                      <div><b>Your guess:</b> {h.guess || <em>(blank)</em>}</div>
                      <div><b>Result:</b> {h.correct ? "Correct (10 pts)" : h.points > 0 ? `${h.points} pt${h.points === 1 ? "" : "s"} partial` : "No points"}</div>
                      <div><b>License:</b> {h.license}</div>
                      <div><b>Source:</b> <a href={h.source} target="_blank" rel="noreferrer">{h.source}</a></div>
                      {h.attributions.length > 0 && (<div><b>Attribution:</b> {h.attributions.join(", ")}</div>)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{marginTop:16}}>
              <Link className="btn" href="/">Back to Home (choose mode)</Link>
            </div>
          </>
        ) : (
          <>
            <div className="imageWrap">
              {card?.imageUrl && (
                <Image
                  src={card.imageUrl}
                  alt={card.commonName || "Unknown animal"}
                  fill
                  priority
                  onLoadingComplete={handleImageLoaded}
                  onError={handleImageError}
                  style={{ objectFit: "cover" }}
                />
              )}
            </div>
            <div className="caption">
              Images from open sources (iNaturalist / Wikimedia). Always attribute and follow the license.
            </div>

            <form onSubmit={handleSubmit} className="row" style={{ marginTop: 14 }}>
              <input
                ref={inputRef}
                className="input"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Type the English name…"
                disabled={loading || !card || revealed}
              />
              <button className="btn" disabled={loading || !guess || revealed}>Guess</button>
              <button className="btn" type="button" onClick={handleNext} disabled={!revealed}>
                {qIndex + 1 >= ROUND_SIZE ? "Finish" : "Next"}
              </button>
            </form>

            {revealed && card && (
              <div className="result">
                <div><b>Answer:</b> {card.commonName} <span style={{color:"var(--muted)"}}>({card.scientificName})</span></div>
                <div className="caption">
                  <b>License:</b> {card.license} &nbsp;|&nbsp; <b>Source:</b>{" "}
                  <a href={card.source} target="_blank" rel="noreferrer">{card.source}</a>
                  {card.attributions?.length > 0 && (<> &nbsp;|&nbsp; <b>Attribution:</b> {card.attributions.join(", ")}</>)}
                </div>
                <div className="caption" style={{marginTop:6}}>
                  <b>Scoring:</b> 10 for exact full-name match; otherwise points = number of correct words in the correct order (capped to answer length).
                </div>
                <div className="caption" style={{marginTop:6}}>
                  I’ll auto-advance in <b>{postLeft}s</b> if you don’t click <b>Next</b>.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

