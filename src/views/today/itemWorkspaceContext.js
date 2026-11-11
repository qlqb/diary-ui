import { createContext } from 'react';

/**
 * 실행 항목의 작업 공간을 여는 길. 셸(MainShell)이 제공하고, 오늘·계획·일정·프로젝트의 항목 줄이 같은 것을 쓴다 —
 * 화면마다 따로 여는 창을 두지 않는다(같은 실행 항목, 같은 작업 공간).
 */
export const ItemWorkspaceContext = createContext(null);
