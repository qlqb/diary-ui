import { describe, expect, it } from 'vitest';
import {
  MATERIAL_ACCEPT, isAcceptedFile, isAllowedMaterialFile, isArchiveFile,
  materialExtension, materialFileKind,
} from './materialFormats.js';

describe('materialFormats', () => {
  it('accept 값에 자료 다섯 형식과 압축이 있다', () => {
    expect(MATERIAL_ACCEPT).toBe('.pdf,.pptx,.hwp,.hwpx,.ipynb,.zip');
  });

  it('확장자는 대소문자를 가리지 않고, 마지막 점 뒤만 본다', () => {
    expect(materialExtension('3주차.실습.IPYNB')).toBe('ipynb');
    expect(materialExtension('확장자없음')).toBe('');
    expect(isAllowedMaterialFile('강의계획서.HWP')).toBe(true);
    expect(isAllowedMaterialFile('강의계획서.hwpx')).toBe(true);
  });

  it('압축은 자료가 아니라 가져오기 대상이다', () => {
    // 그대로 자료가 되지는 않지만 올릴 수는 있다 — 안의 파일을 고르는 화면으로 간다.
    expect(isAllowedMaterialFile('3주차.zip')).toBe(false);
    expect(isArchiveFile('3주차.zip')).toBe(true);
    expect(isAcceptedFile('3주차.zip')).toBe(true);
  });

  it('서버가 받지 않는 형식은 거른다', () => {
    expect(isAcceptedFile('보고서.docx')).toBe(false);
    expect(isAcceptedFile('코드.py')).toBe(false);
    expect(isAcceptedFile('압축.7z')).toBe(false);
    expect(isAcceptedFile('lecture.pdf.txt')).toBe(false);
    expect(isAcceptedFile(undefined)).toBe(false);
  });

  it('형식 이름은 확장자, 없으면 서버가 저장한 대표 content type으로 정한다', () => {
    expect(materialFileKind('lab.ipynb', null)).toBe('IPYNB');
    expect(materialFileKind('계획서.hwpx', null)).toBe('HWPX');
    expect(materialFileKind('자료', 'application/x-hwp')).toBe('HWP');
    expect(materialFileKind('자료', 'application/hwp+zip')).toBe('HWPX');
    expect(materialFileKind('자료', 'application/x-ipynb+json')).toBe('IPYNB');
    expect(materialFileKind('자료',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('PPTX');
    expect(materialFileKind('자료', null)).toBe('PDF');
  });
});
