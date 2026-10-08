import type { CSSProperties, ReactNode } from "react";

type IconName =
  | "upload"
  | "file"
  | "shield"
  | "arrow"
  | "chart"
  | "download"
  | "check"
  | "menu"
  | "close"
  | "coins"
  | "calendar";

const paths: Record<IconName, ReactNode> = {
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6l8-3Z" />
      <path d="m8.5 11 2.5 2.5 4.5-4.5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chart: (
    <>
      <path d="M4 3v18h17M8 16v-4m5 4V8m5 8V5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13m-5-5 5 5 5-5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  coins: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M15 8a6 6 0 1 1-7 7M9 6v6m-2-4h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h4" />
    </>
  ),
};

export function Icon({
  name,
  className,
  style,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
