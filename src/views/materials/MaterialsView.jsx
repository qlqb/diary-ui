/**
 * 자료함. 자료는 프로젝트가 아니라 사용자가 소유한다 — 하나의 자료를 여러 프로젝트에서
 * 참조할 수 있고, 어느 프로젝트에도 연결하지 않은 채 그냥 보관해도 된다.
 *
 * 여기서 하는 일은 셋뿐이다: 올리기 / 무엇이 있는지 보기 / 프로젝트에 연결하거나 끊기.
 * 폴더·태그·즐겨찾기·정렬 커스터마이즈·AI 자동 분류·중복 감지·관련도 점수는 만들지 않는다.
 * 자료가 실제로 많아져서 "못 찾겠다"가 생기기 전에는 분류 도구가 문제를 만들기만 한다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Upload, Loader2, ArrowLeft, Link2, Trash2, X } from 'lucide-react';

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

export default function MaterialsView({ projects, onProjectsChanged }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

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

  const visible = useMemo(() => {
    if (filter === 'unlinked') return materials.filter((m) => (m.links ?? []).length === 0);
    // 목록은 서버가 이미 created_at DESC로 준다. `최근 추가`는 그중 앞쪽만 보여주는 것이다.
    if (filter === 'recent') return materials.slice(0, 10);
    return materials;
  }, [materials, filter]);

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
    <div className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">자료</h1>
          <p className="view-sub">
            올린 자료는 여러 프로젝트에서 함께 쓸 수 있어요.
          </p>
        </div>
      </header>

      <UploadForm onUploaded={load} />
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
        <EmptyState filter={filter} total={materials.length} />
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
    </div>
  );
}

function EmptyState({ filter, total }) {
  if (filter === 'unlinked' && total > 0) {
    return <p className="view-dim">지금은 모든 자료가 프로젝트에 연결되어 있어요.</p>;
  }
  return (
    <div className="empty-block">
      <p className="empty-title">아직 올린 자료가 없어요</p>
      <p className="empty-desc">
        PDF나 PPTX를 올려두면 프로젝트에 연결해 AI가 참고하게 할 수 있어요.
        프로젝트를 먼저 정하지 않아도 괜찮아요.
      </p>
    </div>
  );
}

/**
 * 업로드. materialType을 묻지 않는다 — 자료의 성격은 "이 프로젝트가 이걸 무엇으로 쓰는가"라서
 * 연결할 때 정해진다. 여기서 미리 고르게 하면 연결도 안 한 자료에 성격을 붙이게 된다.
 */
function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await materialStoreAPI.upload(file);
      setFile(null);
      e.target.reset?.();
      await onUploaded();
    } catch (err) {
      setError(err.message || '업로드하지 못했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <form className="material-upload" onSubmit={handleSubmit}>
        <input type="file" accept=".pdf,.pptx" aria-label="자료 파일"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="submit" className="btn-ghost btn-sm" disabled={!file || uploading}>
          {uploading ? <><Loader2 size={13} className="spin" /> 올리는 중</> : <><Upload size={13} /> 올리기</>}
        </button>
      </form>
      {error && <p className="view-error">{error}</p>}
    </>
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
