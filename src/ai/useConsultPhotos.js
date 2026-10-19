import { useCallback, useEffect, useRef, useState } from 'react';
import { consultPhotoAPI, materialStoreAPI } from '../api/api.js';

/** 한 번에 붙일 수 있는 사진 수(서버도 같은 상한을 지킨다). */
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
/** 동시에 올리는 사진 수. 사진 읽기는 느리고 서버도 동시 호출을 제한한다. */
const PARALLEL = 2;
/** 같은 키가 아직 처리 중(409)일 때 결과를 다시 물어보는 간격·횟수. */
const RETRY_MS = 3000;
const RETRIES = 20;

function newKey() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 상담 입력창의 교재 사진 트레이. 사진을 고르면 장마다 바로 올려 글자를 읽고(동시에 2장), 보내기 전에 단원을 확인·바꾸거나 뺄 수
 * 있다. 대화를 바꾸면 트레이를 비우고 늦게 온 응답은 버린다(대화 로딩 토큰과 같은 방식).
 *
 * @param {object} args
 * @param {number|null} args.conversationId 지금 대화
 * @param {() => Promise<number|null>} args.ensureConversation 대화가 없으면 만들고 id를 돌려준다(그 사이 대화를 옮겼으면 null)
 * @param {number} [args.resetKey] 새 대화·대화 선택·과목 전환마다 바뀌는 값 — 대화 id가 그대로(null→null)여도 트레이를 비운다
 */
export function useConsultPhotos({ conversationId, ensureConversation, resetKey = 0 }) {
  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState(null);
  const generation = useRef(0);
  const queue = useRef([]);
  const running = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /** 지금 대화(렌더마다 갱신). 완료 콜백이 옛 렌더의 대화로 다음 사진을 올리지 않게 한다. */
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  const ensureRef = useRef(ensureConversation);
  ensureRef.current = ensureConversation;
  const pumpRef = useRef(() => {});
  /** 사진을 올리려고 이 훅이 만든 대화. 그 대화로 바뀐 것은 "대화 전환"이 아니다(트레이를 비우지 않는다). */
  const adopted = useRef(null);
  /** 대화를 만드는 중이면 그 약속을 같이 기다린다 — 두 장을 동시에 올려도 대화는 하나만 만든다. */
  const creating = useRef(null);

  const patch = useCallback((localId, gen, change) => {
    if (gen !== generation.current) return; // 대화가 바뀐 뒤 늦게 온 응답
    setItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...change } : it)));
  }, []);

  // 대화가 바뀌면 트레이를 비운다(올라간 사진은 그 대화의 자료로 남는다 — 기록에서 다시 보인다).
  useEffect(() => {
    if (conversationId != null && conversationId === adopted.current) return;
    adopted.current = null;
    creating.current = null;
    generation.current += 1;
    queue.current = [];
    setItems((prev) => {
      prev.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return [];
    });
    setNotice(null);
  }, [conversationId, resetKey]);

  const runOne = useCallback(async (job) => {
    const { localId, file, uploadKey, gen } = job;
    if (gen !== generation.current) return;
    try {
      let convId = conversationRef.current ?? adopted.current;
      if (convId == null) {
        if (!creating.current) {
          // 끝나면(성공·실패·취소) 놓는다 — 실패한 생성이 다음 첨부를 붙잡지 않게.
          const pending = ensureRef.current();
          creating.current = pending;
          pending.finally(() => { if (creating.current === pending) creating.current = null; }).catch(() => {});
        }
        convId = await creating.current;
        if (gen !== generation.current) return;
        if (convId == null) {
          patch(localId, gen, { status: 'ERROR', error: '대화가 바뀌어 올리지 않았어요. 다시 올려 주세요.' });
          return;
        }
        adopted.current = convId;
      }
      let photo = null;
      try {
        photo = await consultPhotoAPI.upload(convId, file, uploadKey);
      } catch (err) {
        if (err.status !== 409 || err.code !== 'E409_044') throw err;
        // 같은 키가 아직 처리 중이다 — 다시 올리지 않고 결과를 기다린다.
        for (let i = 0; i < RETRIES && gen === generation.current; i += 1) {
          await sleep(RETRY_MS);
          try {
            photo = await consultPhotoAPI.result(convId, uploadKey);
            break;
          } catch (again) {
            if (again.status !== 409) throw again;
          }
        }
        if (!photo) throw err;
      }
      patch(localId, gen, { status: photo.status, photo, error: null });
    } catch (err) {
      patch(localId, gen, {
        status: err.status === 429 ? 'LIMIT' : 'ERROR',
        error: err.message || '조금 뒤에 다시 시도해 주세요.',
      });
    }
  }, [patch]);

  const pump = useCallback(() => {
    while (running.current < PARALLEL && queue.current.length > 0) {
      const job = queue.current.shift();
      if (job.gen !== generation.current) continue;
      running.current += 1;
      runOne(job).finally(() => {
        running.current -= 1;
        pumpRef.current();
      });
    }
  }, [runOne]);
  pumpRef.current = pump;

  const add = useCallback((files) => {
    const list = [...(files ?? [])];
    if (list.length === 0) return;
    const room = MAX_PHOTOS - itemsRef.current.length;
    if (room <= 0) {
      setNotice(`사진은 한 번에 ${MAX_PHOTOS}장까지 붙일 수 있어요.`);
      return;
    }
    const gen = generation.current;
    const accepted = [];
    let rejected = 0;
    list.forEach((file) => {
      if (!ACCEPTED.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
        rejected += 1;
        return;
      }
      if (accepted.length < room) accepted.push(file);
    });
    const over = list.length - rejected - accepted.length;
    setNotice(rejected > 0 ? 'JPG·PNG·WebP 사진을 8MB까지 올릴 수 있어요.'
      : over > 0 ? `사진은 한 번에 ${MAX_PHOTOS}장까지 붙일 수 있어요.` : null);
    const next = accepted.map((file) => ({
      localId: newKey(),
      uploadKey: newKey(),
      file,
      previewUrl: URL.createObjectURL?.(file) ?? null,
      status: 'UPLOADING',
      photo: null,
      error: null,
    }));
    if (next.length === 0) return;
    setItems((prev) => [...prev, ...next]);
    next.forEach((it) => queue.current.push({ localId: it.localId, file: it.file, uploadKey: it.uploadKey, gen }));
    pump();
  }, [pump]);

  /**
   * 실패한 사진을 다시 올린다. 서버가 끝낸 실패(읽지 못함)는 새 키로, 응답을 못 받은 실패(연결 끊김 등)는 같은 키로 — 서버가 이미
   * 읽었으면 그 결과를 돌려준다(두 번 읽지 않는다).
   */
  const retry = useCallback((localId) => {
    const it = itemsRef.current.find((x) => x.localId === localId);
    if (!it) return;
    const uploadKey = it.status === 'ERROR' ? it.uploadKey : newKey();
    const gen = generation.current;
    setItems((prev) => prev.map((x) => (x.localId === localId ? { ...x, uploadKey, status: 'UPLOADING', error: null } : x)));
    queue.current.push({ localId, file: it.file, uploadKey, gen });
    pump();
  }, [pump]);

  /** 보내기 전에 뺀다. 이미 읽혀 자료가 됐으면 그 자료를 지운다(보내지 않은 사진은 남기지 않는다). */
  const remove = useCallback(async (localId) => {
    const it = itemsRef.current.find((x) => x.localId === localId);
    setItems((prev) => prev.filter((x) => x.localId !== localId));
    if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
    if (it?.photo?.photoId) {
      try {
        await materialStoreAPI.delete(it.photo.photoId);
      } catch {
        // 지우지 못해도 트레이에서는 빠진다 — 자료함에서 지울 수 있다.
      }
    }
  }, []);

  const setTopic = useCallback(async (localId, topicId) => {
    const it = itemsRef.current.find((x) => x.localId === localId);
    if (!it?.photo?.photoId) return;
    const gen = generation.current;
    try {
      const photo = await consultPhotoAPI.setTopic(it.photo.photoId, topicId);
      patch(localId, gen, { photo });
    } catch (err) {
      patch(localId, gen, { error: err.message || '단원을 바꾸지 못했어요.' });
    }
  }, [patch]);

  /** 보낼 사진 id(읽힌 것만). */
  const readyIds = items.filter((it) => it.status === 'READ' && it.photo?.photoId).map((it) => it.photo.photoId);
  const busy = items.some((it) => it.status === 'UPLOADING');

  /** 보낸 사진만 트레이에서 뺀다(보내는 사이 새로 붙인 사진은 남는다). */
  const clearSent = useCallback((photoIds) => {
    const sent = new Set(photoIds);
    setItems((prev) => {
      prev.filter((it) => sent.has(it.photo?.photoId)).forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return prev.filter((it) => !sent.has(it.photo?.photoId));
    });
    setNotice(null);
  }, []);

  /** 트레이를 비운다. */
  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return [];
    });
    setNotice(null);
  }, []);

  return { items, notice, add, retry, remove, setTopic, readyIds, busy, clear, clearSent };
}
