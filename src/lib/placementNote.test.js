import { describe, it, expect } from 'vitest';
import { placementNote } from './placementNote.js';

const item = (id, start, end) => ({ executionItemId: id, startTime: start, endTime: end, status: 'PLANNED' });
const entry = (key, kind, title, s, e) => ({ key, kind, title, startMinutes: s, endMinutes: e });
const m = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };

describe('placementNote — 틀어진 자리의 설명', () => {
  it('같은 시각에 다른 일정이 겹쳐 있었으면 겹침을 말한다', () => {
    const timeline = [
      entry('EXECUTION:1', 'EXECUTION', '소켓 서버 과제', m('19:00'), m('20:30')),
      entry('EXECUTION:2', 'EXECUTION', '영어회화 발표 스크립트', m('19:30'), m('20:00')),
    ];
    const note = placementNote(item(2, '19:30', '20:00'), timeline);
    expect(note.kind).toBe('OVERLAP');
    expect(note.text).toContain('소켓 서버 과제 19:00~20:30');
  });

  it('수업이 끝나고 15분 안에 시작했으면 바로 이어 붙은 자리라고 말한다', () => {
    const timeline = [entry('ROUTINE:7:2026-11-19', 'ROUTINE', '빅데이터분석', m('13:00'), m('15:45'))];
    const note = placementNote(item(3, '16:00', '17:00'), timeline);
    expect(note.kind).toBe('RIGHT_AFTER');
    expect(note.text).toContain('빅데이터분석 끝나고 15분 만에');
  });

  it('끝나자마자 시작하면 "바로"라고 말한다', () => {
    const timeline = [entry('COMMITMENT:9', 'COMMITMENT', '치과', m('14:30'), m('15:30'))];
    expect(placementNote(item(4, '15:30', '16:00'), timeline).text).toContain('치과 끝나고 바로');
  });

  it('앞의 실행 조각은 원인으로 보지 않는다(이어서 하는 경우가 많다)', () => {
    const timeline = [entry('EXECUTION:5', 'EXECUTION', '힙 정리', m('16:00'), m('17:00'))];
    expect(placementNote(item(6, '17:05', '18:00'), timeline)).toBeNull();
  });

  it('근거가 없으면 아무것도 말하지 않는다', () => {
    const timeline = [entry('ROUTINE:1:2026-11-19', 'ROUTINE', '자료구조', m('09:00'), m('10:15'))];
    expect(placementNote(item(8, '11:00', '12:00'), timeline)).toBeNull();
    expect(placementNote({ executionItemId: 9, startTime: null, endTime: null }, timeline)).toBeNull();
  });

  it('자기 자신은 겹침으로 세지 않는다', () => {
    const timeline = [entry('EXECUTION:10', 'EXECUTION', '혼자', m('19:00'), m('20:00'))];
    expect(placementNote(item(10, '19:00', '20:00'), timeline)).toBeNull();
  });

  it('금지 표현을 쓰지 않는다', () => {
    const timeline = [
      entry('EXECUTION:1', 'EXECUTION', 'A', m('19:00'), m('20:30')),
      entry('ROUTINE:2:x', 'ROUTINE', 'B', m('15:00'), m('18:55')),
    ];
    for (const n of [placementNote(item(2, '19:30', '20:00'), timeline), placementNote(item(3, '19:00', '19:20'), [timeline[1]])]) {
      expect(n.text).not.toMatch(/실패|미완료|이행률|달성률|연속|의지|성실/);
    }
  });
});
