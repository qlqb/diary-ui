/**
 * 연결 제안 창의 넣을 곳 메뉴와 새 프로젝트 부품.
 *
 * - DestMenu: 파일 하나 또는 여러 개의 넣을 곳을 고른다. 순서는 AI 추천 → 내 프로젝트 → 이번에 새로 만들 프로젝트 →
 *   새 프로젝트 만들기 → 그냥 두기. 여러 개(bulk)일 때는 "새 프로젝트로 묶기…"를 맨 위에 둔다.
 * - 새 프로젝트는 누르자마자 만들지 않고 메뉴 안에서 이름부터 정한다. 같은 이름의 기존 프로젝트가 있으면 거기에 넣기를 먼저 권한다.
 * - NewProjectChip: 맨 위 요약의 새 프로젝트 칩. 눌러서 이름 바꾸기·취소.
 *
 * 메뉴는 제안 창(z-index 950) 위에 떠야 하므로 zIndex를 올린다.
 */
import { useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronDown, FolderPlus, PauseCircle, Pencil, Trash2 } from 'lucide-react';
import { Button, Menu, Popover, TextInput } from '@mantine/core';
import { MATERIAL_TYPE_LABEL, MaterialType } from '../../types/learning.js';
import { LEAVE, existingKey, suggestProjectName, titleKey } from '../../lib/linkProposal.js';

const LAYER = 2000;

function NewProjectForm({ review, files, onDone, onBack, bulk }) {
  const [name, setName] = useState(() => suggestProjectName(files));
  const key = titleKey(name);
  const existing = key ? review.projectOptions.find((p) => titleKey(p.title) === key) : null;
  const sameNew = key ? review.newDestinations.find((k) => titleKey(review.titles[k]) === key) : null;
  const create = () => {
    if (!name.trim()) return;
    review.createProject(files, name);
    onDone();
  };
  return (
    // 이름을 적는 동안 메뉴의 키보드 이동(화살표·글자 찾기)이 입력을 가로채지 않게 막는다. Esc는 메뉴가 닫도록 둔다.
    <div className="lp-form" onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}>
      <button type="button" className="lp-back" onClick={onBack}><ArrowLeft size={13} /> 목록으로</button>
      <label className="lp-form-label" htmlFor="lp-new-name">
        {bulk ? `고른 ${files.length}개를 넣을 새 프로젝트` : '새 프로젝트 이름'}
      </label>
      <TextInput id="lp-new-name" size="sm" data-autofocus value={name} placeholder="예: 네트워크 실습"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !existing && !sameNew) create(); }} />
      {existing && (
        <div className="lp-same" role="status">
          <AlertCircle size={13} aria-hidden="true" />
          <span>같은 이름의 <b>{existing.title}</b> 프로젝트가 이미 있어요.</span>
          <Button size="compact-sm" onClick={() => { review.chooseMany(files, existingKey(existing.courseId)); onDone(); }}>거기에 넣기</Button>
          <Button size="compact-sm" variant="subtle" color="gray" onClick={create}>그래도 새로 만들기</Button>
        </div>
      )}
      {!existing && sameNew && (
        <div className="lp-same" role="status">
          <AlertCircle size={13} aria-hidden="true" />
          <span>이번에 만들 <b>{review.titles[sameNew]}</b>와(과) 이름이 같아요.</span>
          <Button size="compact-sm" onClick={() => { review.chooseMany(files, sameNew); onDone(); }}>같이 넣기</Button>
        </div>
      )}
      {!existing && !sameNew && (
        <div className="lp-form-actions">
          <span className="lp-form-hint">Enter로 만들어요</span>
          <Button size="compact-sm" disabled={!name.trim()} onClick={create}>
            {bulk ? `${files.length}개 묶어 만들기` : '만들기'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function DestMenu({ review, files, children, bulk = false, position = 'bottom-end', disabled = false }) {
  const [opened, setOpened] = useState(false);
  const [creating, setCreating] = useState(false);
  const first = files[0];
  const current = first && files.every((f) => review.dest[f.id] === review.dest[first.id]) ? review.dest[first.id] : null;
  const recommended = first && !bulk
    ? [...new Set([first.recommended, ...(first.group.matchingProjects ?? []).map((p) => existingKey(p.courseId))])]
      .filter((k) => k !== LEAVE)
    : [];
  const close = () => { setOpened(false); setCreating(false); };
  const item = (key, label) => (
    <Menu.Item key={key} onClick={() => review.chooseMany(files, key)} rightSection={current === key ? <Check size={14} /> : null}>
      {label}
    </Menu.Item>
  );
  const createItem = (
    <Menu.Item key="create" className="lp-create-item" leftSection={<FolderPlus size={14} />} closeMenuOnClick={false}
      onClick={() => setCreating(true)}>
      {bulk ? '새 프로젝트로 묶기…' : '새 프로젝트 만들기…'}
    </Menu.Item>
  );
  const others = review.projectOptions.filter((p) => !recommended.includes(existingKey(p.courseId)));
  const extraNew = review.newDestinations.filter((k) => !recommended.includes(k));
  return (
    // hideDetached를 끈다: 기본값은 메뉴를 연 버튼이 스크롤로 가려지면 메뉴를 숨기는데, 새 프로젝트 이름을 적는 중에
    // 목록이 조금만 움직여도 입력 칸이 사라진다. 메뉴는 버튼을 따라 자리를 다시 잡으므로 숨길 이유가 없다.
    <Menu position={position} withinPortal shadow="md" width={310} zIndex={LAYER} opened={opened && !disabled}
      hideDetached={false}
      onChange={(o) => { setOpened(o); if (!o) setCreating(false); }} trapFocus={!creating}>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown className="lp-menu">
        {creating ? (
          <NewProjectForm review={review} files={files} bulk={bulk} onDone={close} onBack={() => setCreating(false)} />
        ) : (
          <>
            {bulk && createItem}
            {bulk && <Menu.Divider />}
            {recommended.length > 0 && <Menu.Label>AI 추천</Menu.Label>}
            {recommended.map((key) => item(key, `${review.describe(key).label}${review.describe(key).kind === 'new' ? ' (새 프로젝트)' : ''}`))}
            {others.length > 0 && <Menu.Label>내 프로젝트</Menu.Label>}
            {others.map((p) => item(existingKey(p.courseId), p.title))}
            {extraNew.length > 0 && <Menu.Label>이번에 새로 만들 프로젝트</Menu.Label>}
            {extraNew.map((k) => item(k, `새 · ${review.describe(k).label}`))}
            <Menu.Divider />
            {!bulk && createItem}
            <Menu.Item leftSection={<PauseCircle size={14} />} onClick={() => review.chooseMany(files, LEAVE)}>
              지금은 그냥 두기
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/** 파일 줄의 넣을 곳 칩. 추천 그대로인 칩은 흐리게 둬서, 바꾼 줄만 눈에 띄게 한다. */
export function DestChip({ review, file, disabled }) {
  const d = review.describe(review.dest[file.id]);
  const changed = review.changed(file);
  return (
    <DestMenu review={review} files={[file]} disabled={disabled}>
      <button type="button" disabled={disabled}
        className={`lp-dest is-${d.kind}${changed ? ' is-changed' : ''}${!changed && !file.review ? ' is-quiet' : ''}`}
        aria-label={`${file.member.originalFilename} 넣을 곳: ${d.label}`}>
        {d.kind === 'new' && <span className="lp-new-tag">새</span>}
        {d.kind === 'leave' && <PauseCircle size={13} aria-hidden="true" />}
        <span className="lp-dest-label">{d.label}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
    </DestMenu>
  );
}

/** 역할. 거의 안 고치므로 글자 크기 드롭다운으로 작게 둔다. */
export function RoleSelect({ review, file, disabled }) {
  return (
    <label className="lp-role">
      <span className="lp-sr">{file.member.originalFilename}의 자료 역할</span>
      <select value={review.roles[file.id]} disabled={disabled}
        onChange={(e) => review.setRoles((prev) => ({ ...prev, [file.id]: e.target.value }))}>
        {Object.values(MaterialType).map((t) => <option key={t} value={t}>{MATERIAL_TYPE_LABEL[t]}</option>)}
      </select>
      <ChevronDown size={11} aria-hidden="true" />
    </label>
  );
}

/** 요약의 새 프로젝트 칩. 눌러서 이름 바꾸기·취소. 취소하면 그 자료들은 AI 추천으로 돌아간다. */
export function NewProjectChip({ review, item }) {
  const [opened, setOpened] = useState(false);
  const empty = !(review.titles[item.key] ?? '').trim();
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withinPortal zIndex={LAYER} shadow="md" width={290} trapFocus
      hideDetached={false}>
      <Popover.Target>
        <button type="button" className={`lp-chip is-new lp-chip-btn${empty ? ' is-empty' : ''}`}
          onClick={() => setOpened((o) => !o)} aria-label={`새 프로젝트 ${item.label} 고치기`}>
          <span className="lp-new-tag">새</span>{item.label} <b>{item.count}</b><Pencil size={11} aria-hidden="true" />
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <div className="lp-form">
          <label className="lp-form-label" htmlFor={`lp-rename-${item.key}`}>새 프로젝트 이름 · 자료 {item.count}개</label>
          <TextInput id={`lp-rename-${item.key}`} size="sm" value={review.titles[item.key] ?? ''}
            onChange={(e) => review.renameProject(item.key, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpened(false); }} />
          <div className="lp-form-actions">
            <Button size="compact-sm" variant="subtle" color="red" leftSection={<Trash2 size={13} />}
              onClick={() => { review.cancelProject(item.key); setOpened(false); }}>이 새 프로젝트 취소</Button>
            <Button size="compact-sm" onClick={() => setOpened(false)}>확인</Button>
          </div>
          <p className="lp-form-hint">취소하면 이 자료들은 AI 추천으로 돌아가요.</p>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
