/**
 * 자료함. 자료는 프로젝트가 아니라 사용자가 소유한다 — 하나의 자료를 여러 프로젝트에서
 * 참조할 수 있고, 어느 프로젝트에도 연결하지 않은 채 그냥 보관해도 된다.
 *
 * 여기서 하는 일은 셋뿐이다: 올리기 / 무엇이 있는지 보기 / 프로젝트에 연결하거나 끊기.
 * 폴더·태그·즐겨찾기·정렬 커스터마이즈·AI 자동 분류·중복 감지·관련도 점수는 만들지 않는다.
 * 자료가 실제로 많아져서 "못 찾겠다"가 생기기 전에는 분류 도구가 문제를 만들기만 한다.
 *
 * 업로드는 "고르기 → 목록 확인 → N개 올리기"의 2단계다. 고르자마자 전송하지 않는 이유는
 * 잘못 끌어다 놓은 20MB 파일을 되돌릴 방법이 없어지기 때문이고, 여러 폴더를 돌며 파일을
 * 모으는 흐름이 성립하지 않기 때문이다. 서버는 여전히 파일 하나짜리 API 하나뿐이고,
 * 여러 개는 여기서 순차 호출로 처리한다 — 일괄 업로드 엔드포인트를 만들지 않았다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, Upload, Loader2, ArrowLeft, Link2, Trash2, X,
  Plus, Check, AlertCircle, UploadCloud,
} from 'lucide-react';
import { materialStoreAPI } from '../../api/api.js';
import MaterialTypeSelect from '../../components/MaterialTypeSelect.jsx';
import {
  MaterialType, MATERIAL_TYPE_HINT, ExtractionStatus, EXTRACTION_STATUS_LABEL, MaterialAnalysisStatus,
} from '../../types/learning.js';

/**
 * 필터는 이 셋만.
 *
 * `최근 추가`는 created_at 기준이다. "최근 사용"이라고 부르지 않는다 — last_used_at 컬럼이
 * 없고, 무엇을 "사용"으로 볼지(상세 열람 / AI가 읽음 / 프로젝트 연결)도 정하지 않았다.
 * created_at에 "최근 사용" 라벨을 붙이면 라벨이 거짓말을 하게 된다.
 */
const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'recent', label: '최근 추가' },
  { key: 'unlinked', label: '연결 안 된 자료' },
];

/**
 * 업로드 제약. 서버(FileStorageService)와 같은 값을 들고 있어야 한다.
 *
 * - 확장자: ALLOWED_EXTENSIONS = {pdf, pptx}
 * - 크기:   storage.materials.max-file-size-bytes 기본값 20971520 (= 20MB)
 *
 * spring.servlet.multipart.max-file-size는 25MB지만 그건 요청 자체를 거르는 상한이고,
 * 실제로 400을 돌려주는 기준은 20MB다. 안내 문구는 사용자가 마주칠 값을 적어야 하므로 20MB다.
 *
 * 드래그앤드롭에는 input의 accept가 적용되지 않는다 — 파일 선택창만 걸러준다.
 * 그래서 검증을 여기서 한 번 더 한다. 서버 검증을 대신하는 게 아니라, 뻔히 400 날 파일을
 * 올려놓고 기다리게 하지 않기 위한 것이다.
 */
const ACCEPT = '.pdf,.pptx';
const ALLOWED_EXTENSIONS = ['pdf', 'pptx'];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '20MB';
const UPLOAD_HINT = `PDF·PPTX · 여러 파일 선택 가능 · 파일당 ${MAX_FILE_SIZE_LABEL}까지`;

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fileKind(filename, contentType) {
  const ext = (filename ?? '').split('.').pop()?.toUpperCase();
  if (ext === 'PDF' || ext === 'PPTX') return ext;
  return contentType?.includes('presentation') ? 'PPTX' : 'PDF';
}

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 올릴 수 없는 파일이면 그 이유를, 올릴 수 있으면 null을 돌려준다. */
function rejectReason(file) {
  const ext = (file?.name ?? '').split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return 'PDF나 PPTX만 올릴 수 있어요';
  if (!file.size) return '내용이 비어 있는 파일이에요';
  if (file.size > MAX_FILE_SIZE_BYTES) return `${MAX_FILE_SIZE_LABEL}까지 올릴 수 있어요`;
  return null;
}

let uploadSeq = 0;
const nextUploadId = () => `u${(uploadSeq += 1)}`;

/** 같은 파일을 두 번 담지 않기 위한 식별자. materialId가 아직 없는 단계라 파일 속성으로 만든다. */
const fileKey = (file) => `${file.name}::${file.size}::${file.lastModified}`;

/**
 * 업로드 대기열.
 *
 * 항목 상태는 다섯 가지다:
 *   staged    고르기만 한 상태. `N개 올리기`가 세는 대상이다.
 *   rejected  확장자/크기에서 걸린 것. 서버에 보내지 않는다. 목록에서 조용히 빼지 않고
 *             이유와 함께 보여준다 — 5개 넣었는데 3개만 남아 있으면 그게 더 혼란스럽다.
 *   uploading 전송 중.
 *   done      서버가 201을 준 상태. 텍스트 추출 실패는 여기 포함된다(아래 참고).
 *   failed    전송이 실패한 상태. 이 항목만 다시 올릴 수 있다.
 *
 * done과 failed를 가르는 기준이 중요하다. 스캔본 PDF처럼 "파일은 정상 저장됐지만 본문을
 * 못 읽은" 경우는 실패가 아니다. 그걸 실패로 보여주면 사용자가 같은 파일을 반복해서
 * 다시 올리게 되고, 자료함에 같은 파일이 쌓인다. 업로드 응답(MaterialResponse)에
 * extractionStatus가 실려 오므로 목록을 다시 부르지 않고도 그 자리에서 구분할 수 있다.
 *
 * 진행 상태를 itemsRef에 동기적으로 반영하는 게 이 훅의 핵심이다. setState의 함수형
 * 업데이터는 렌더 시점에 실행되므로, 순차 루프 안에서 그걸로 다음 대상을 찾으면 값이
 * 갱신되지 않아 같은 항목을 계속 집는다. 그래서 모든 변경이 applyItems 하나를 지나가고,
 * 루프는 state가 아니라 ref만 읽는다.
 */
function useUploadQueue({ onBatchDone }) {
  const [items, setItemsState] = useState([]);
  const [running, setRunning] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const itemsRef = useRef(items);
  const runningRef = useRef(false);
  const inputRef = useRef(null);

  const applyItems = useCallback((next) => {
    itemsRef.current = next;
    setItemsState(next);
  }, []);

  const patch = useCallback((id, changes) => {
    applyItems(itemsRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, [applyItems]);

  /** 이어붙인다. 폴더를 옮겨 다니며 추가로 고를 수 있어야 하므로 앞서 담은 목록을 지우지 않는다. */
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList ?? []);
    if (incoming.length === 0) return;

    // 이미 올라간 것(done)은 다시 담을 수 있게 둔다 — 사용자가 의도적으로 재업로드할 수 있다.
    const pendingKeys = new Set(
        itemsRef.current.filter((it) => it.state !== 'done').map((it) => it.key),
    );

    let dropped = 0;
    const added = [];
    for (const file of incoming) {
      const key = fileKey(file);
      if (pendingKeys.has(key)) { dropped += 1; continue; }
      pendingKeys.add(key);
      const reason = rejectReason(file);
      added.push({
        id: nextUploadId(),
        key,
        file,
        state: reason ? 'rejected' : 'staged',
        error: reason,
        extractionStatus: null,
      });
    }

    setSkipped(dropped);
    if (added.length > 0) applyItems([...itemsRef.current, ...added]);
  }, [applyItems]);

  const remove = useCallback((id) => {
    applyItems(itemsRef.current.filter((it) => it.id !== id));
  }, [applyItems]);

  /** 남길 이유가 없는 것만 치운다. 아직 안 올린 것과 손볼 게 남은 것은 그대로 둔다. */
  const clearSettled = useCallback(() => {
    applyItems(itemsRef.current.filter((it) => it.state === 'staged' || it.state === 'uploading'));
    setSkipped(0);
  }, [applyItems]);

  /**
   * 순차 전송. Promise.all로 한꺼번에 던지지 않는 이유는 텍스트 추출이 동기이고 CPU를 쓰기
   * 때문이다 — 10개를 동시에 보내면 서버 스레드가 전부 추출에 물린다.
   *
   * 하나가 실패해도 루프를 멈추지 않는다. 각 파일은 독립된 자료라서 3번이 실패했다고
   * 1·2번을 되돌릴 이유가 없다.
   */
  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (!itemsRef.current.some((it) => it.state === 'staged')) return;

    runningRef.current = true;
    setRunning(true);
    setSkipped(0);

    let uploadedAny = false;
    try {
      for (;;) {
        const next = itemsRef.current.find((it) => it.state === 'staged');
        if (!next) break;

        patch(next.id, { state: 'uploading', error: null });
        try {
          const res = await materialStoreAPI.upload(next.file);
          uploadedAny = true;
          patch(next.id, { state: 'done', error: null, extractionStatus: res?.extractionStatus ?? null });
        } catch (err) {
          patch(next.id, { state: 'failed', error: err.message || '올리지 못했어요' });
        }
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }

    if (uploadedAny) {
      await onBatchDone();
      // 본문까지 읽힌 파일은 아래 목록에 그대로 나타나므로 대기열에서 비운다.
      // 추출이 안 된 것은 남긴다 — "저장은 됐다"는 말을 바로 그 자리에서 해줘야 한다.
      applyItems(itemsRef.current.filter(
          (it) => !(it.state === 'done' && it.extractionStatus === ExtractionStatus.SUCCESS),
      ));
    }
  }, [patch, applyItems, onBatchDone]);

  /** 실패한 것만 다시 올린다. 이미 성공한 파일은 건드리지 않는다. */
  const retry = useCallback((id) => {
    patch(id, { state: 'staged', error: null });
    start();
  }, [patch, start]);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const stagedCount = useMemo(
      () => items.filter((it) => it.state === 'staged').length,
      [items],
  );

  return { items, running, skipped, stagedCount, inputRef, addFiles, remove, clearSettled, start, retry, openPicker };
}

export default function MaterialsView({ projects, onProjectsChanged }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMaterials(await materialStoreAPI.list());
    } catch (err) {
      setError(err.message || '자료를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploader = useUploadQueue({ onBatchDone: load });
  const { addFiles } = uploader;

  const visible = useMemo(() => {
    if (filter === 'unlinked') return materials.filter((m) => (m.links ?? []).length === 0);
    // 목록은 서버가 이미 created_at DESC로 준다. `최근 추가`는 그중 앞쪽만 보여주는 것이다.
    if (filter === 'recent') return materials.slice(0, 10);
    return materials;
  }, [materials, filter]);

  /**
   * 화면 어디에 놓아도 받는다. dragleave는 자식 요소를 지날 때마다 발생하므로 깊이를 세지
   * 않으면 오버레이가 깜빡인다. 파일이 아닌 드래그(텍스트 선택 등)에는 반응하지 않는다.
   */
  const isFileDrag = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const handleDragEnter = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragOver = (e) => {
    // preventDefault를 하지 않으면 브라우저가 파일을 새 탭으로 열어버리고 drop이 오지 않는다.
    if (isFileDrag(e)) e.preventDefault();
  };

  const handleDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  if (openId != null) {
    return (
        <MaterialDetail
            materialId={openId}
            projects={projects}
            onBack={() => setOpenId(null)}
            onChanged={async () => { await load(); await onProjectsChanged?.(); }}
            onDeleted={async () => {
              setOpenId(null);
              await load();
              await onProjectsChanged?.();
            }}
        />
    );
  }

  return (
      <div
          className="view materials-view"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
      >
        {/*
        고르기 창을 여는 통로. 같은 파일을 연달아 고를 수 있어야 하므로 change 직후 value를
        비운다 — 비우지 않으면 두 번째 선택에서 change 이벤트가 아예 오지 않는다.
      */}
        <input
            ref={uploader.inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />

        <header className="view-head view-head-split">
          <div>
            <h1 className="view-title">자료</h1>
            <p className="view-sub">
              올린 자료는 여러 프로젝트에서 함께 쓸 수 있어요.
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={uploader.openPicker}>
            <Plus size={13} /> 파일 추가
          </button>
        </header>

        <UploadTray
            items={uploader.items}
            running={uploader.running}
            skipped={uploader.skipped}
            stagedCount={uploader.stagedCount}
            onStart={uploader.start}
            onRemove={uploader.remove}
            onRetry={uploader.retry}
            onClear={uploader.clearSettled}
        />

        {error && <p className="view-error">{error}</p>}

        <div className="material-filters" role="tablist" aria-label="자료 필터">
          {FILTERS.map((f) => (
              <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`material-filter${filter === f.key ? ' is-active' : ''}`}
                  onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
          ))}
        </div>

        {loading && materials.length === 0 ? (
            <p className="view-dim">불러오는 중...</p>
        ) : visible.length === 0 ? (
            <EmptyState filter={filter} total={materials.length} onPick={uploader.openPicker} />
        ) : (
            <ul className="material-list">
              {visible.map((m) => (
                  <li key={m.materialId}>
                    <button type="button" className="material-row" onClick={() => setOpenId(m.materialId)}>
                <span className="material-row-main">
                  <span className="material-row-name">
                    <FileText size={14} /> {m.originalFilename}
                  </span>
                  <span className="material-row-meta">
                    {fileKind(m.originalFilename, m.contentType)} · {formatDate(m.createdAt)}
                  </span>
                </span>
                      <span className="material-row-links">
                  {(m.links ?? []).length > 0 ? (
                      <>
                        <span className="material-row-links-label">연결</span>
                        {m.links.map((l) => l.courseTitle).join(' · ')}
                      </>
                  ) : (
                      <span className="view-sub-dim">연결 안 된 자료</span>
                  )}
                </span>
                      {m.extractionStatus !== ExtractionStatus.SUCCESS && (
                          <span className="chip chip-warn">{EXTRACTION_STATUS_LABEL[m.extractionStatus]}</span>
                      )}
                    </button>
                  </li>
              ))}
            </ul>
        )}

        {dragging && (
            <div className="drop-overlay" aria-hidden="true">
          <span className="drop-overlay-inner">
            <UploadCloud size={20} /> 여기에 놓으면 목록에 담겨요
          </span>
            </div>
        )}
      </div>
  );
}

/**
 * 고른 파일 목록. 여기서 확인하고 빼고 나서 올린다.
 *
 * 아무것도 고르지 않았으면 아예 나타나지 않는다 — 늘 자리를 차지하는 빈 폼은 화면만 먹는다.
 */
function UploadTray({ items, running, skipped, stagedCount, onStart, onRemove, onRetry, onClear }) {
  if (items.length === 0) return null;

  const settledCount = items.filter((it) => it.state !== 'staged' && it.state !== 'uploading').length;

  return (
      <div className="upload-tray">
        <ul className="upload-tray-list">
          {items.map((it) => (
              <li key={it.id} className={`upload-item is-${it.state}`}>
                <FileText size={14} className="upload-item-icon" />
                <span className="upload-item-name" title={it.file.name}>{it.file.name}</span>
                <span className="upload-item-size">{formatSize(it.file.size)}</span>
                <UploadItemState item={it} />
                <span className="upload-item-actions">
              {it.state === 'failed' && (
                  <button type="button" className="btn-ghost btn-sm" disabled={running}
                          onClick={() => onRetry(it.id)}>
                    다시 올리기
                  </button>
              )}
                  {it.state !== 'uploading' && (
                      <button type="button" className="icon-btn" aria-label={`${it.file.name} 목록에서 빼기`}
                              onClick={() => onRemove(it.id)}>
                        <X size={14} />
                      </button>
                  )}
            </span>
                {it.state === 'done' && it.extractionStatus !== ExtractionStatus.SUCCESS && (
                    <p className="upload-item-note">
                      파일은 저장됐어요. 같은 파일을 다시 올리지 않아도 괜찮아요.
                      프로젝트에 연결해서 AI가 참고하게 하는 건 본문을 읽은 자료만 가능해요.
                    </p>
                )}
              </li>
          ))}
        </ul>

        {skipped > 0 && (
            <p className="upload-tray-note">이미 목록에 있는 파일 {skipped}개는 넘어갔어요.</p>
        )}

        <div className="upload-tray-foot">
          <span className="upload-tray-hint">{UPLOAD_HINT}</span>
          {settledCount > 0 && (
              <button type="button" className="btn-ghost btn-sm" disabled={running} onClick={onClear}>
                정리
              </button>
          )}
          <button type="button" className="btn-primary" disabled={running || stagedCount === 0} onClick={onStart}>
            {running
                ? <><Loader2 size={13} className="spin" /> 올리는 중</>
                : <><Upload size={13} /> {stagedCount}개 올리기</>}
          </button>
        </div>
      </div>
  );
}

function UploadItemState({ item }) {
  if (item.state === 'staged') {
    return <span className="upload-item-status view-sub-dim">대기</span>;
  }
  if (item.state === 'uploading') {
    return <span className="upload-item-status"><Loader2 size={12} className="spin" /> 올리는 중</span>;
  }
  if (item.state === 'done') {
    // 저장은 끝났다. 추출이 안 됐어도 여기서 "실패"라고 말하지 않는다.
    if (item.extractionStatus && item.extractionStatus !== ExtractionStatus.SUCCESS) {
      return (
          <span className="upload-item-status is-done">
          <Check size={12} /> 올렸어요
          <span className="chip chip-warn">{EXTRACTION_STATUS_LABEL[item.extractionStatus]}</span>
        </span>
      );
    }
    return <span className="upload-item-status is-done"><Check size={12} /> 완료</span>;
  }
  // rejected / failed
  return (
      <span className="upload-item-status is-problem">
      <AlertCircle size={12} /> {item.error}
    </span>
  );
}

/**
 * 자료가 하나도 없을 때는 이 박스가 곧 업로드 영역이다.
 *
 * 예전에는 안내 문구가 적힌 큰 박스와 클릭해야 하는 작은 input이 따로 있었다. 시선이 가는
 * 면적과 실제로 눌러야 하는 곳이 어긋나 있었고, 같은 말을 두 번 하고 있었다.
 */
function EmptyState({ filter, total, onPick }) {
  if (filter === 'unlinked' && total > 0) {
    return <p className="view-dim">지금은 모든 자료가 프로젝트에 연결되어 있어요.</p>;
  }
  if (total > 0) {
    return <p className="view-dim">이 조건에 맞는 자료가 없어요.</p>;
  }
  return (
      <button type="button" className="dropzone" onClick={onPick}>
        <span className="dropzone-icon"><UploadCloud size={22} /></span>
        <span className="dropzone-title">파일을 끌어다 놓거나 클릭해서 추가하세요</span>
        <span className="dropzone-hint">{UPLOAD_HINT}</span>
        <span className="dropzone-desc">
        올려둔 자료는 프로젝트에 연결해 AI가 참고하게 할 수 있어요.
        프로젝트를 먼저 정하지 않아도 괜찮아요.
      </span>
      </button>
  );
}

function MaterialDetail({ materialId, projects, onBack, onChanged, onDeleted }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linking, setLinking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await materialStoreAPI.get(materialId));
    } catch (err) {
      setError(err.message || '자료를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => { load(); }, [load]);

  const material = detail?.material;
  const links = material?.links ?? [];
  const linkedCourseIds = new Set(links.map((l) => l.courseId));
  const linkable = (projects ?? []).filter((p) => !linkedCourseIds.has(p.courseId));

  /**
   * 이 프로젝트에서의 역할만 바꾼다. 예전에는 연결 해제 후 재연결이 유일한 우회로였다.
   * 보관된 프로젝트로의 연결은 애초에 이 목록에 나오지 않으므로 여기서 마주칠 일이 없다.
   */
  const handleRoleChange = async (courseId, materialType) => {
    setBusy(true);
    setError(null);
    try {
      await materialStoreAPI.updateLinkType(materialId, courseId, materialType);
      await load();
      await onChanged();
    } catch (err) {
      setError(err.message || '자료 역할을 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveLink = async (courseId) => {
    setBusy(true);
    setError(null);
    try {
      await materialStoreAPI.removeLink(materialId, courseId);
      await load();
      await onChanged();
    } catch (err) {
      setError(err.message || '연결을 끊지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await materialStoreAPI.delete(materialId);
      await onDeleted();
    } catch (err) {
      setError(err.message || '삭제하지 못했습니다.');
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return <div className="view"><p className="view-dim">불러오는 중...</p></div>;
  }

  return (
      <div className="view">
        <header className="view-head">
          <div className="project-head">
            <button type="button" className="icon-btn" onClick={onBack} aria-label="자료 목록으로">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="view-title">{material?.originalFilename}</h1>
              <p className="view-sub">
              <span className="view-sub-dim">
                {fileKind(material?.originalFilename, material?.contentType)} · {formatDate(material?.createdAt)}
              </span>
                {material?.extractionStatus !== ExtractionStatus.SUCCESS && (
                    <span className="chip chip-warn">{EXTRACTION_STATUS_LABEL[material?.extractionStatus]}</span>
                )}
              </p>
            </div>
          </div>
        </header>

        {error && <p className="view-error">{error}</p>}

        <section className="view-section">
          <h2 className="section-title">연결된 프로젝트</h2>
          {links.length === 0 ? (
              <p className="view-dim">아직 어느 프로젝트에도 연결하지 않았어요.</p>
          ) : (
              <ul className="material-list">
                {links.map((l) => (
                    <li key={l.courseId} className="material-item">
                      <span className="material-name">{l.courseTitle}</span>
                      <MaterialTypeSelect
                          value={l.materialType ?? MaterialType.OTHER}
                          disabled={busy}
                          label={`${l.courseTitle}에서의 자료 역할`}
                          onChange={(t) => handleRoleChange(l.courseId, t)}
                      />
                      <span className="material-actions">
                  <button type="button" className="btn-ghost btn-sm" disabled={busy}
                          onClick={() => handleRemoveLink(l.courseId)}>
                    <X size={13} /> 연결 해제
                  </button>
                </span>
                    </li>
                ))}
              </ul>
          )}
          {links.length > 0 && <p className="section-desc">{MATERIAL_TYPE_HINT}</p>}
        </section>

        <AnalysisHistory analyses={detail?.analyses ?? []} />

        <div className="material-detail-actions">
          <button type="button" className="btn-ghost btn-sm" disabled={busy || linkable.length === 0}
                  onClick={() => setLinking(true)}>
            <Link2 size={13} /> 프로젝트 연결
          </button>
          <button type="button" className="btn-ghost btn-sm btn-danger" disabled={busy}
                  onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> 자료 삭제
          </button>
        </div>

        {linking && (
            <LinkForm
                projects={linkable}
                onCancel={() => setLinking(false)}
                onSubmit={async (courseId, materialType) => {
                  setBusy(true);
                  setError(null);
                  try {
                    await materialStoreAPI.addLink(materialId, courseId, materialType);
                    setLinking(false);
                    await load();
                    await onChanged();
                  } catch (err) {
                    setError(err.message || '연결하지 못했습니다.');
                  } finally {
                    setBusy(false);
                  }
                }}
            />
        )}

        {confirmDelete && (
            <DeleteConfirm
                linkCount={links.length}
                busy={busy}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={handleDelete}
            />
        )}
      </div>
  );
}

const ANALYSIS_STATUS_LABEL = Object.freeze({
  [MaterialAnalysisStatus.DRAFT]: '검토 대기',
  [MaterialAnalysisStatus.APPLIED]: '적용됨',
  [MaterialAnalysisStatus.DISMISSED]: '폐기함',
  [MaterialAnalysisStatus.FAILED]: '분석 실패',
});

/**
 * 이 자료가 지금까지 어디서 어떻게 해석됐는지 — 프로젝트를 가리지 않은 전체 이력이다.
 *
 * 프로젝트 화면의 이력과 정반대 책임을 진다. 거기는 지금 그 프로젝트 맥락만 보여주고,
 * 여기는 전부 보여주되 각 줄이 어느 프로젝트의 해석인지 먼저 말한다. 프로젝트명이 없으면
 * "분석 3건"만 남아 어느 맥락의 것인지 알 수 없고, 맥락을 좁혀서 없앤 혼란이 그대로 재발한다.
 *
 * 연결을 끊어도, 프로젝트를 보관해도 이 이력은 사라지지 않는다 — 분석 레코드는 지우지 않기
 * 때문이다. 다만 그 상태에서 적용(apply)은 막힌다.
 */
function AnalysisHistory({ analyses }) {
  if (analyses.length === 0) {
    return (
        <section className="view-section">
          <h2 className="section-title">분석 이력</h2>
          <p className="view-dim">아직 이 자료를 구조 분석한 적이 없어요.</p>
        </section>
    );
  }

  return (
      <section className="view-section">
        <h2 className="section-title">분석 이력 {analyses.length}</h2>
        <p className="section-desc">
          같은 자료라도 프로젝트마다 따로 해석돼요. 어느 프로젝트에서 만든 결과인지 함께 표시합니다.
        </p>
        <ul className="material-list">
          {analyses.map((a) => (
              <li key={a.analysisId} className="material-item analysis-history-item">
                <span className="analysis-history-course">{a.courseTitle ?? '알 수 없는 프로젝트'}</span>
                <span className="chip">{ANALYSIS_STATUS_LABEL[a.status] ?? a.status}</span>
                <span className="material-row-meta">{formatDate(a.createdAt)}</span>
                {a.payload?.summary && (
                    <p className="analysis-history-summary">{a.payload.summary}</p>
                )}
                {a.failureReason && (
                    <p className="analysis-history-summary">{a.failureReason}</p>
                )}
              </li>
          ))}
        </ul>
      </section>
  );
}

/** 연결할 때 비로소 materialType을 고른다. */
function LinkForm({ projects, onCancel, onSubmit }) {
  const [courseId, setCourseId] = useState(projects[0]?.courseId ?? '');
  const [materialType, setMaterialType] = useState(MaterialType.OTHER);

  return (
      <form
          className="material-link-form"
          onSubmit={(e) => { e.preventDefault(); onSubmit(Number(courseId), materialType); }}
      >
        <select className="material-type" value={courseId} aria-label="연결할 프로젝트"
                onChange={(e) => setCourseId(e.target.value)}>
          {projects.map((p) => <option key={p.courseId} value={p.courseId}>{p.title}</option>)}
        </select>
        <MaterialTypeSelect value={materialType} onChange={setMaterialType} />
        <button type="submit" className="btn-ghost btn-sm" disabled={!courseId}>연결</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>취소</button>
        <p className="material-form-hint">{MATERIAL_TYPE_HINT}</p>
      </form>
  );
}

/**
 * 여러 프로젝트에 걸린 자료를 지울 때는 무엇이 사라지고 무엇이 남는지 먼저 말한다.
 *
 * "영구 삭제 완료" 같은 표현은 쓰지 않는다 — 파일 삭제가 실패해도 사용자에게는 성공을
 * 반환하므로, 보장할 수 있는 것은 "정상적인 앱 경로에서 더 이상 접근할 수 없다"까지다.
 */
function DeleteConfirm({ linkCount, busy, onCancel, onConfirm }) {
  return (
      <div className="material-confirm">
        {linkCount >= 2 && (
            <p className="material-confirm-line">
              이 자료는 {linkCount}개 프로젝트에 연결되어 있어요.
            </p>
        )}
        <p className="material-confirm-line">
          삭제하면 해당 프로젝트에서 더 이상 이 자료를 AI 참고 자료로 사용할 수 없습니다.
        </p>
        <p className="material-confirm-line view-sub-dim">
          이미 적용한 학습 내용과 프로젝트 상태는 그대로 유지됩니다.
        </p>
        <div className="material-detail-actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="btn-ghost btn-sm btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? '삭제 중...' : '자료 삭제'}
          </button>
        </div>
      </div>
  );
}