import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refreshDashboardWhenVisible } from './resume-refresh.ts';

class FakeVisibilitySource extends EventTarget {
  visibilityState: DocumentVisibilityState = 'hidden';
}

test('ホーム画面アプリへ戻ったときだけ最新データを取得する', () => {
  const source = new FakeVisibilitySource();
  let refreshCount = 0;
  const stop = refreshDashboardWhenVisible(source, () => {
    refreshCount += 1;
  });

  source.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshCount, 0);

  source.visibilityState = 'visible';
  source.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshCount, 1);

  stop();
  source.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshCount, 1);
});
