import { describe, expect, it } from 'vitest';
import {
  MATERIAL_ACCEPT, isAllowedMaterialFile, materialExtension, materialFileKind,
} from './materialFormats.js';

describe('materialFormats', () => {
  it('accept 값에 서버가 받는 다섯 형식이 모두 있다', () => {
    expect(MATERIAL_ACCEPT).toBe('.pdf,.pptx,.hwp,.ipynb,.zip');
  });

  it('확장자는 대소문자를 가리지 않고, 마지막 점 뒤만 본다', () => {
    expect(materialExtension('3주차.실습.IPYNB')).toBe('ipynb');
    expect(materialExtension('확장자없음')).toBe('');
    expect(isAllowedMaterialFile('강의계획서.HWP')).toBe(true);
    expect(isAllowedMaterialFile('과제모음.zip')).toBe(true);
  });

  it('서버가 받지 않는 형식은 거른다 — HWPX·DOCX·중간에만 확장자가 있는 이름', () => {
    expect(isAllowedMaterialFile('계획서.hwpx')).toBe(false);
    expect(isAllowedMaterialFile('보고서.docx')).toBe(false);
    expect(isAllowedMaterialFile('lecture.pdf.txt')).toBe(false);
    expect(isAllowedMaterialFile(undefined)).toBe(false);
  });

  it('형식 이름은 확장자, 없으면 서버가 저장한 대표 content type으로 정한다', () => {
    expect(materialFileKind('lab.ipynb', null)).toBe('IPYNB');
    expect(materialFileKind('자료', 'application/x-hwp')).toBe('HWP');
    expect(materialFileKind('자료', 'application/zip')).toBe('ZIP');
    expect(materialFileKind('자료', 'application/x-ipynb+json')).toBe('IPYNB');
    expect(materialFileKind('자료',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('PPTX');
    expect(materialFileKind('자료', null)).toBe('PDF');
  });
});
