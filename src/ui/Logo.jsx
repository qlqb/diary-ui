/**
 * 앱 로고 — '떼어낸 모서리'. 네모(하루)에서 오른쪽 위 조각(오늘 몫)을 떼어낸 모양이다.
 * 밝은 화면용 색(남색 바탕)만 있다. 다크모드용 색과 모양 규칙은 docs/design/app-icon.md 에 있다.
 * public/favicon.svg 와 같은 그림이므로 한쪽을 고치면 다른 쪽도 고친다.
 */
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <rect width="64" height="64" rx="15" fill="#4f46e5" />
      <path d="M18 18 H31 L46 33 V46 A4 4 0 0 1 42 50 H18 A4 4 0 0 1 14 46 V22 A4 4 0 0 1 18 18 Z" fill="#ffffff" />
      <path d="M36.5 14 H48 A2 2 0 0 1 50 16 V27.5 Z" fill="#c7d2fe" stroke="#c7d2fe" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
