"use client";

export default function Footer({ simulatedAt }: { simulatedAt: string }) {
  const date = new Date(simulatedAt).toLocaleString("nl-NL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <footer
      style={{
        padding: "3rem 2rem",
        background: "var(--dark)",
        borderTop: "1px solid var(--dark-4)",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.7rem",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "#333",
        }}
      >
        PSV Kampioen Countdown · Monte Carlo simulatie · 50.000 iteraties
      </p>
      <p
        style={{
          marginTop: "0.5rem",
          fontSize: "0.7rem",
          color: "#2a2a2a",
        }}
      >
        Kansen zijn indicatief · Gegenereerd op {date}
      </p>
    </footer>
  );
}
