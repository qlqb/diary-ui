import { describe, it, expect } from 'vitest';
import {
  LEAVE, buildApplyGroups, cleanName, existingKey, newKey, recommendedKey, reviewReason, suggestProjectName, titleKey,
} from './linkProposal.js';

const file = (id, originalFilename, group = { action: 'LINK_EXISTING' }) => ({ id, member: { originalFilename }, group });

describe('linkProposal', () => {
  it('파일명에서 번호·주차·버전·확장자를 떼고 이름으로 쓸 말만 남긴다', () => {
    expect(cleanName('11.코드리뷰와_TCP_데이터_전송·멀티스레드.pdf')).toBe('코드리뷰와 TCP 데이터 전송·멀티스레드');
    expect(cleanName('06.네트워크와_소켓_프로그래밍_v5 (1).pdf')).toBe('네트워크와 소켓 프로그래밍');
    expect(cleanName('2.리눅스_개요와_실습환경_구축_WSL2추가_v2.pdf')).toBe('리눅스 개요와 실습환경 구축 WSL2추가');
  });

  it('번호·주차만 있던 파일명은 억지로 채우지 않는다', () => {
    expect(cleanName('3주_1.pdf')).toBe('');
    expect(cleanName('2주차 (1).pdf')).toBe('');
  });

  it('기본 이름: AI가 제안한 새 이름 > 파일 하나의 정리한 이름 > 여럿의 공통 앞부분', () => {
    const proposed = { action: 'CREATE_AND_LINK', proposedTitle: '임베디드 리눅스' };
    expect(suggestProjectName([file(1, 'embedded.pdf', proposed)])).toBe('임베디드 리눅스');
    expect(suggestProjectName([file(1, '05.소켓_프로그래밍_기초.pdf')])).toBe('소켓 프로그래밍 기초');
    expect(suggestProjectName([file(1, '05.소켓_프로그래밍_기초.pdf'), file(2, '06.소켓_프로그래밍_심화.pdf')])).toBe('소켓 프로그래밍');
    expect(suggestProjectName([file(1, '3주_1.pdf'), file(2, '3주_2.pdf')])).toBe('');
  });

  it('같은 이름의 기존 프로젝트가 있으면 새로 만들기보다 그쪽이 추천이다', () => {
    expect(recommendedKey({ action: 'CREATE_AND_LINK', groupId: 'g', matchingProjects: [{ courseId: 5 }] })).toBe(existingKey(5));
    expect(recommendedKey({ action: 'CREATE_AND_LINK', groupId: 'g', matchingProjects: [] })).toBe(newKey('g'));
    expect(recommendedKey({ action: 'LEAVE' })).toBe(LEAVE);
  });

  it('자신 없는 묶음만 확인 이유를 갖는다', () => {
    expect(reviewReason({ action: 'LINK_EXISTING', defaultSelected: true, notices: [], members: [{ evidenceSource: 'CONTENT' }] })).toBeNull();
    expect(reviewReason({ action: 'CREATE_AND_LINK', defaultSelected: false, notices: [], members: [{ evidenceSource: 'FILENAME_ONLY' }] }))
      .toBe('파일명만 보고 고른 곳이에요');
  });

  it('요청은 넣을 곳별로 묶고, 새 프로젝트 이름은 앞뒤 공백을 뗀다', () => {
    const groups = buildApplyGroups(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      { 1: existingKey(3), 2: newKey('a'), 3: existingKey(3) },
      { 1: 'OTHER', 2: 'SYLLABUS', 3: 'OTHER' },
      { [newKey('a')]: '  새 이름 ' },
    );
    expect(groups).toEqual([
      { action: 'LINK_EXISTING', existingCourseId: 3, members: [{ materialId: 1, materialType: 'OTHER' }, { materialId: 3, materialType: 'OTHER' }] },
      { action: 'CREATE_AND_LINK', title: '새 이름', members: [{ materialId: 2, materialType: 'SYLLABUS' }] },
    ]);
  });

  it('이름 비교는 공백·대소문자를 무시한다', () => {
    expect(titleKey('네트워크 프로그래밍')).toBe(titleKey('네트워크프로그래밍'));
  });
});
