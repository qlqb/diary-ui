/**
 * 계획 초안 검토 화면(PlanDraftReview)을 테스트에서 다루는 도우미.
 *
 * 항목은 한 줄로 접혀 있고 목표·할 일·근거·항목 버튼은 펼친 줄 안에 있다. 가끔 쓰는 동작(버리기·실행 방법 다시 제안)은
 * 하단 확정 바의 ⋯ 안에 있다. 테스트가 그 구조를 매번 되풀이해 적지 않게 여기 모은다.
 */

import { fireEvent, screen, within } from '@testing-library/react';

/** 접혀 있는 항목 줄을 전부 펼친다. 초안이 다시 만들어지면 줄은 다시 접힌 채로 시작한다. */
export function expandPlanItems() {
  document.querySelectorAll('.plan-item-toggle[aria-expanded="false"]').forEach((toggle) => fireEvent.click(toggle));
}

/**
 * 그 항목의 버튼. 줄이 접혀 있으면 펴고, 「이번만 빼기」·「이미 알아요」가 「빼기」 안에 묶여 있으면 그것도 연다.
 * 순서가 아니라 제목으로 집는다 — 그룹 정렬이 바뀌어도 엉뚱한 항목을 누르지 않게.
 */
export function planItemButton(titleText, name) {
  const row = screen.getByText(titleText).closest('li');
  const toggle = row.querySelector('.plan-item-toggle[aria-expanded="false"]');
  if (toggle) fireEvent.click(toggle);
  const scope = within(row);
  if (!scope.queryByRole('button', { name })) {
    const remove = scope.queryByRole('button', { name: '빼기' });
    if (remove && remove.getAttribute('aria-expanded') !== 'true') fireEvent.click(remove);
  }
  return scope.getByRole('button', { name });
}

/** 하단 확정 바의 ⋯ 메뉴를 연다. */
export function openPlanMore() {
  const more = screen.getByRole('button', { name: '다른 동작' });
  if (more.getAttribute('aria-expanded') !== 'true') fireEvent.click(more);
}

/** 접혀 있는 「왜 이렇게 짰나요?」(판단·말한 범위·참고한 정보·예산과 프로젝트 내역)를 연다. */
export function openPlanWhy() {
  const why = screen.queryByRole('button', { name: '왜 이렇게 짰나요?' });
  if (why && why.getAttribute('aria-expanded') !== 'true') fireEvent.click(why);
}
