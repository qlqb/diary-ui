/**
 * 약속은 시간을 차지하지만 수행 대상이 아니다. 이 화면이 그 선을 지키는지 고정한다.
 *
 * 여기서 절대 나오면 안 되는 것: 완료·일부·줄이기·보류 버튼. 하나라도 생기면 사용자는
 * 약속을 "해치우는 일"로 읽게 되고, 그 순간 ExecutionRecord가 없는 이유도 설명되지 않는다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommitmentSection from './CommitmentSection.jsx';
import { commitmentAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  commitmentAPI: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  },
}));

const friendMeetup = {
  commitmentId: 5,
  title: '친구 약속',
  startAt: '2026-09-04T19:00:00',
  endAt: '2026-09-04T21:00:00',
  locationText: '홍대',
  sourceType: 'MANUAL',
  version: 0,
};

function renderSection(props = {}) {
  return render(
    <CommitmentSection
      commitments={[friendMeetup]}
      loading={false}
      editingId={null}
      onEdit={vi.fn()}
      onChanged={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  commitmentAPI.create.mockResolvedValue({});
  commitmentAPI.update.mockResolvedValue({});
  commitmentAPI.remove.mockResolvedValue(null);
});

describe('약속 목록', () => {
  it('시간·제목·장소와 "약속" 라벨을 보여준다', () => {
    renderSection();

    expect(screen.getByText('친구 약속')).toBeInTheDocument();
    expect(screen.getByText('9/4 19:00 ~ 21:00')).toBeInTheDocument();
    expect(screen.getByText('홍대')).toBeInTheDocument();
    // 색만으로 종류를 말하지 않는다.
    expect(screen.getByText('약속')).toBeInTheDocument();
  });

  it('자정을 넘기면 종료 쪽 날짜도 보여준다', () => {
    renderSection({
      commitments: [{
        ...friendMeetup, startAt: '2026-09-04T22:00:00', endAt: '2026-09-05T02:00:00',
      }],
    });

    expect(screen.getByText('9/4 22:00 ~ 9/5 02:00')).toBeInTheDocument();
  });

  it('완료·일부·줄이기·보류가 없다', () => {
    renderSection();

    for (const name of ['완료', '일부 했어요', '줄이기', '보류']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /삭제/ })).toBeInTheDocument();
  });

  it('삭제는 version과 함께 보낸다', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    renderSection({ onChanged });

    await user.click(screen.getByRole('button', { name: /삭제/ }));

    await waitFor(() => expect(commitmentAPI.remove).toHaveBeenCalledWith(5, 0));
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('약속 추가', () => {
  it('추가 폼에 반복 옵션이 없다', async () => {
    const user = userEvent.setup();
    renderSection({ commitments: [] });

    await user.click(screen.getByRole('button', { name: /일회성 일정 추가/ }));

    expect(screen.getByLabelText('약속 제목')).toBeInTheDocument();
    // 반복을 등록하려는 사용자는 아래 반복 일정 UI를 쓴다.
    expect(screen.queryByText(/매주/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/요일/)).not.toBeInTheDocument();
  });

  it('제목과 시각을 채우면 그대로 만든다', async () => {
    const user = userEvent.setup();
    renderSection({ commitments: [] });

    await user.click(screen.getByRole('button', { name: /일회성 일정 추가/ }));
    await user.type(screen.getByLabelText('약속 제목'), '병원');
    await user.type(screen.getByLabelText('시작 날짜'), '2026-09-10');
    await user.type(screen.getByLabelText('시작 시각'), '14:00');
    await user.type(screen.getByLabelText('종료 시각'), '15:00');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(commitmentAPI.create).toHaveBeenCalledWith({
      title: '병원',
      startAt: '2026-09-10T14:00',
      endAt: '2026-09-10T15:00',
      locationText: null,
    }));
  });

  it('종료가 시작보다 이르면 만들 수 없다', async () => {
    const user = userEvent.setup();
    renderSection({ commitments: [] });

    await user.click(screen.getByRole('button', { name: /일회성 일정 추가/ }));
    await user.type(screen.getByLabelText('약속 제목'), '병원');
    await user.type(screen.getByLabelText('시작 날짜'), '2026-09-10');
    await user.type(screen.getByLabelText('시작 시각'), '15:00');
    await user.type(screen.getByLabelText('종료 시각'), '14:00');

    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(commitmentAPI.create).not.toHaveBeenCalled();
  });

  it('실패하면 폼을 닫지 않고 그 자리에 이유를 남긴다', async () => {
    const user = userEvent.setup();
    commitmentAPI.create.mockRejectedValue(new Error('서버가 응답하지 않습니다'));
    renderSection({ commitments: [] });

    await user.click(screen.getByRole('button', { name: /일회성 일정 추가/ }));
    await user.type(screen.getByLabelText('약속 제목'), '병원');
    await user.type(screen.getByLabelText('시작 날짜'), '2026-09-10');
    await user.type(screen.getByLabelText('시작 시각'), '14:00');
    await user.type(screen.getByLabelText('종료 시각'), '15:00');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(screen.getByText('서버가 응답하지 않습니다')).toBeInTheDocument());
    // 다시 칠 필요가 없어야 한다.
    expect(screen.getByLabelText('약속 제목')).toHaveValue('병원');
  });
});

describe('약속 수정', () => {
  it('편집으로 열면 기존 값이 채워져 있다', () => {
    renderSection({ editingId: 5 });

    expect(screen.getByLabelText('약속 제목')).toHaveValue('친구 약속');
    expect(screen.getByLabelText('시작 시각')).toHaveValue('19:00');
    expect(screen.getByLabelText('장소')).toHaveValue('홍대');
  });

  it('저장하면 version을 함께 보낸다', async () => {
    const user = userEvent.setup();
    renderSection({ editingId: 5, commitments: [{ ...friendMeetup, version: 3 }] });

    await user.click(screen.getByRole('button', { name: /저장/ }));

    await waitFor(() => expect(commitmentAPI.update).toHaveBeenCalledWith(5, expect.objectContaining({
      title: '친구 약속',
      startAt: '2026-09-04T19:00',
      endAt: '2026-09-04T21:00',
      version: 3,
    })));
  });
});
