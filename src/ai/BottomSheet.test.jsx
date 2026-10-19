/**
 * 시트의 계약: 이름 붙은 대화 상자로 열리고, Escape·바깥 누르기·닫기 버튼으로 닫히고, 닫히면 열기 전에 있던
 * 자리로 초점이 돌아간다. keepMounted면 닫혀 있어도 안의 상태를 잃지 않는다.
 */

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import BottomSheet from './BottomSheet.jsx';

function Harness({ keepMounted = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>계획 미리보기 열기</button>
      <BottomSheet open={open} title="계획 미리보기" onClose={() => setOpen(false)} keepMounted={keepMounted}>
        <label>메모 <input type="text" /></label>
      </BottomSheet>
    </>
  );
}

describe('BottomSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않고, 열면 제목으로 이름 붙은 모달 대화 상자가 된다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '계획 미리보기 열기' }));

    const dialog = screen.getByRole('dialog', { name: '계획 미리보기' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
  });

  it('Escape로 닫히고, 연 버튼으로 초점이 돌아간다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '계획 미리보기 열기' });
    await user.click(opener);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('닫기 버튼과 바깥 영역으로도 닫힌다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '계획 미리보기 열기' }));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '계획 미리보기 열기' }));
    await user.click(screen.getByRole('button', { name: '계획 미리보기 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keepMounted면 닫았다 열어도 안에서 쓰던 내용이 남아 있다', async () => {
    const user = userEvent.setup();
    render(<Harness keepMounted />);
    await user.click(screen.getByRole('button', { name: '계획 미리보기 열기' }));
    await user.type(screen.getByRole('textbox', { name: '메모' }), '과제 먼저');

    await user.keyboard('{Escape}');
    // 숨겨져 있을 뿐 지워지지 않았다. 접근성 트리에서는 빠진다.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '계획 미리보기 열기' }));
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue('과제 먼저');
  });
});
