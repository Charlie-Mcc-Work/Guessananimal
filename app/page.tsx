import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <div className="card">
        <div className="header">
          <h1 className="h1">🦊 Animal Guessr</h1>
        </div>
        <p style={{color:"var(--muted)"}}>
          Guess the animal from a real photo (English names). Choose a time limit below.
        </p>

        <div className="grid" style={{gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))"}}>
          <div className="card" style={{padding:16}}>
            <h3 style={{marginTop:0}}>⚡ Fast</h3>
            <p className="caption">10 seconds per question</p>
            <Link className="btn" href="/play?mode=fast">Play Fast</Link>
          </div>

          <div className="card" style={{padding:16}}>
            <h3 style={{marginTop:0}}>🙂 Normal</h3>
            <p className="caption">20 seconds per question</p>
            <Link className="btn" href="/play?mode=normal">Play Normal</Link>
          </div>

          <div className="card" style={{padding:16}}>
            <h3 style={{marginTop:0}}>🧘 Slow</h3>
            <p className="caption">30 seconds per question</p>
            <Link className="btn" href="/play?mode=slow">Play Slow</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

