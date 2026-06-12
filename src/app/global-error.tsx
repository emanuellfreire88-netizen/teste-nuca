"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0 }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "28rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
              Algo deu errado
            </h2>
            <p style={{ color: "#666", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #ccc",
                borderRadius: "0.375rem",
                cursor: "pointer",
                background: "white",
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
