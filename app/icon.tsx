import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#E8001C",
          borderRadius: 6,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Trophy bowl */}
          <path
            d="M7 3h10v2c0 3.5-2 6.5-5 7.5C9 11.5 7 8.5 7 5V3z"
            fill="#fff"
          />
          {/* Left handle */}
          <path
            d="M7 4H5c-.5 0-1 .5-1 1v1c0 2 1.5 3.5 3 4V4z"
            fill="rgba(255,255,255,0.75)"
          />
          {/* Right handle */}
          <path
            d="M17 4h2c.5 0 1 .5 1 1v1c0 2-1.5 3.5-3 4V4z"
            fill="rgba(255,255,255,0.75)"
          />
          {/* Stem */}
          <rect x="11" y="13" width="2" height="4" rx="0.5" fill="#fff" />
          {/* Base */}
          <rect x="8" y="17" width="8" height="2" rx="1" fill="#fff" />
          {/* Star on bowl */}
          <path
            d="M12 5l.7 1.5 1.6.2-1.2 1.1.3 1.6L12 8.7l-1.4.7.3-1.6-1.2-1.1 1.6-.2z"
            fill="#E8001C"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
