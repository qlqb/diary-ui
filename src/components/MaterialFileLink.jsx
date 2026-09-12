/**
 * 자료 원본을 여는 버튼.
 *
 * 자료 이름이 보이는 자리에는 늘 이것이 따라붙는다 — 이름만으로는 "그래서 그 파일이
 * 뭐였더라"에 답이 되지 않고, 지금까지는 확인하려면 앱을 떠나 원래 파일을 찾아야 했다.
 *
 * <a href>가 아니라 버튼인 이유: 인증이 Authorization 헤더라서 브라우저가 스스로 여는
 * 요청에는 토큰이 실리지 않는다. 본문을 받아 blob 주소로 바꿔 연다.
 *
 * PDF는 새 탭에서 그대로 열리고, pptx는 브라우저가 그리지 못하므로 내려받는다. 라벨도
 * 그에 맞춰 갈라 쓴다 — "열기"라고 써 놓고 파일이 내려받아지면 라벨이 거짓말을 한다.
 *
 * 팝업 차단 때문에 새 탭은 클릭 즉시(await 전에) 연다. 나중에 열면 사용자 조작과 끊긴
 * 것으로 보여 차단된다. 차단됐거나 창을 얻지 못하면 조용히 내려받기로 넘어간다.
 *
 * 새 탭으로 열므로 이 화면의 상태(초안 선택·수정값·스크롤)는 그대로다 — 원문을 보러 갔다
 * 돌아와도 검토를 이어 간다.
 */

import { useState } from 'react';
import { ExternalLink, Download, Loader2 } from 'lucide-react';
import { materialStoreAPI } from '../api/api.js';

/**
 * blob 주소를 즉시 거두지 않는다. 새 탭이 아직 읽는 중일 수 있어서, 넉넉히 두고 나중에
 * 거둔다. 페이지를 떠나면 어차피 브라우저가 정리한다.
 */
const REVOKE_DELAY_MS = 60_000;

function isPdfMaterial(filename, contentType) {
  if (contentType) return contentType.includes('pdf');
  return String(filename ?? '').toLowerCase().endsWith('.pdf');
}

/**
 * @param label   버튼 문구를 바꿀 때. 기본은 "PDF 열기" / "파일 내려받기"다. 바꿔 쓰는 쪽도
 *                실제로 일어나는 일(열기 / 내려받기)과 어긋나지 않게 고른다
 * @param onError 파일을 열지 못했을 때. 근거 화면이 캐시를 비우고 상태를 다시 읽는 데 쓴다
 */
export default function MaterialFileLink({
  materialId, filename, contentType, disabled = false, label = null, onError = null,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pdf = isPdfMaterial(filename, contentType);
  const text = label ?? (pdf ? 'PDF 열기' : '파일 내려받기');

  const open = async () => {
    setBusy(true);
    setError(null);
    // 새 탭은 await 전에 열어 둔다(팝업 차단 회피). PDF가 아니면 탭이 필요 없다.
    const tab = pdf ? window.open('', '_blank') : null;
    try {
      const blob = await materialStoreAPI.file(materialId);
      const url = URL.createObjectURL(blob);
      if (tab) {
        tab.opener = null;
        tab.location = url;
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename || '자료';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    } catch (err) {
      tab?.close();
      setError(err.message || '파일을 열지 못했어요.');
      onError?.(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/*
        같은 목록에 이 버튼이 여러 개라서 이름에 파일명이 들어가야 어느 자료인지 갈린다.
        파일명을 앞에 두지 않는 것은 의도다 — 앞에 두면 행 제목 버튼과 이름이 같은
        접두사로 시작해 "그 자료의 행"을 이름으로 특정할 수 없게 된다.
      */}
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={disabled || busy}
        aria-label={`${text} — ${filename ?? '자료'}`}
        onClick={open}
      >
        {busy
          ? <Loader2 size={13} className="spin" />
          : (pdf ? <ExternalLink size={13} /> : <Download size={13} />)}
        {text}
      </button>
      {error && <span className="material-file-error">{error}</span>}
    </>
  );
}
