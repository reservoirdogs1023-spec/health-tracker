import test from 'node:test';
import assert from 'node:assert/strict';
import { authScreen, recoveryRequested, passwordValidation, resetRedirect } from '../src/recovery.ts';

test('a recovery session opens password reset instead of the health dashboard',()=>{
  assert.equal(authScreen({ready:true,hasSession:true,recovery:true}),'reset');
  assert.equal(authScreen({ready:true,hasSession:false,recovery:true}),'expired');
  assert.equal(authScreen({ready:false,hasSession:false,recovery:true}),'loading');
  assert.equal(authScreen({ready:true,hasSession:true,recovery:false}),'dashboard');
  assert.equal(recoveryRequested('https://example.com/health-tracker/?recovery=1#access_token=example&type=recovery'),true);
  assert.equal(recoveryRequested('https://example.com/health-tracker/#/run'),false);
});

test('a new password must be long enough and match its confirmation',()=>{
  assert.ok(passwordValidation('short','short'));
  assert.ok(passwordValidation('example-password','different-password'));
  assert.equal(passwordValidation('example-password','example-password'),null);
});

test('recovery returns to this app and drops unrelated query values and hash routes',()=>{
  assert.equal(resetRedirect('https://example.com/health-tracker/?next=https://other.example/#/run'),'https://example.com/health-tracker/?recovery=1');
});
