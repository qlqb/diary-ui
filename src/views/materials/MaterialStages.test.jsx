import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MaterialStages from './MaterialStages.jsx';

const material = { originalFilename: '2주차.pdf', extractionStatus: 'SUCCESS' };
const running = { state: 'RUNNING', totalChunks: 6, completedChunks: 2 };

describe('MaterialStages', () => {
  it('기본은 세 단계를 모두 보인다', () => {
    render(<MaterialStages material={material} status={running} />);
    expect(screen.getByText('등록')).toBeInTheDocument();
    expect(screen.getByText('텍스트 추출')).toBeInTheDocument();
    expect(screen.getByText('내용 분석')).toBeInTheDocument();
  });

  it('pendingOnly면 끝난 단계는 빼고 남은 단계만 보인다', () => {
    render(<MaterialStages material={material} status={running} pendingOnly />);
    expect(screen.queryByText('등록')).not.toBeInTheDocument();
    expect(screen.queryByText('텍스트 추출')).not.toBeInTheDocument();
    expect(screen.getByText('내용 분석')).toBeInTheDocument();
    expect(screen.getByText('진행 중 · 2/6')).toBeInTheDocument();
  });

  it('본문을 못 읽은 자료는 막힌 단계와 그 뒤 단계가 남는다', () => {
    render(<MaterialStages material={{ ...material, extractionStatus: 'FAILED' }} status={null} pendingOnly />);
    expect(screen.queryByText('등록')).not.toBeInTheDocument();
    expect(screen.getByText('텍스트 추출')).toBeInTheDocument();
    expect(screen.getByText('내용 분석')).toBeInTheDocument();
  });
});
