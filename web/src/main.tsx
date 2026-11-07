import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { client, importArchive, readArchive, localPreview } from './backend';
import { HealthDashboardApp } from './app/health-dashboard';
import { RunPage } from './app/run/run-page';
import { authScreen, recoveryRequested, passwordValidation, resetRedirect } from './recovery';
import './app/globals.css';
import './web.css';

function App() {
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false);
  const [route,setRoute]=useState(location.hash);
  const [message,setMessage]=useState('');
  const [recovery,setRecovery]=useState(()=>recoveryRequested(location.href));
  const [authBusy,setAuthBusy]=useState(false);
  useEffect(()=>{
    const change=()=>setRoute(location.hash); addEventListener('hashchange',change);
    return ()=>removeEventListener('hashchange',change);
  },[]);
  useEffect(()=>{
    if (!client) { setReady(true); return; }
    let active=true;
    void client.auth.getSession().then(({data,error})=>{
      if(active){setSession(data.session);setReady(true);if(error)setMessage('ログイン状態を確認できませんでした。');}
    });
    const {data:{subscription}}=client.auth.onAuthStateChange((event,next)=>{
      if(active){
        setSession(next);setReady(true);setMessage('');
        if(event==='PASSWORD_RECOVERY')setRecovery(true);
        if(event==='SIGNED_OUT')setRecovery(false);
      }
    });
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);
  async function login(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!client)return;
    const form=new FormData(event.currentTarget);
    setMessage('ログインしています…');
    const {error}=await client.auth.signInWithPassword({email:String(form.get('email')),password:String(form.get('password'))});
    setMessage(error?'ログインできませんでした。メールアドレスとパスワードをご確認ください。':'');
  }
  async function requestReset(form:HTMLFormElement){
    if(!client)return;
    const emailInput=form.elements.namedItem('email') as HTMLInputElement;
    if(!emailInput.reportValidity())return;
    setAuthBusy(true);setMessage('再設定メールを送信しています…');
    try{
      const {error}=await client.auth.resetPasswordForEmail(emailInput.value,{redirectTo:resetRedirect(location.href)});
      setMessage(error?'再設定メールを送信できませんでした。時間をおいてお試しください。':'登録されたメールアドレス宛てに再設定メールを送信しました。メールのリンクを開いてください。');
    }catch{setMessage('再設定メールを送信できませんでした。接続をご確認ください。');}
    finally{setAuthBusy(false);}
  }
  if(localPreview)return <><aside className="account-bar">画面確認用の架空データ（保存できません）</aside>{route==='#/run'?<RunPage/>:<HealthDashboardApp/>}</>;
  const screen=authScreen({ready,hasSession:!!session,recovery});
  if(screen==='loading')return <main className="auth-shell" role="status">ログイン状態を確認しています。</main>;
  if(screen==='reset')return <ResetPassword onComplete={async()=>{
    const {error}=await client!.auth.signOut();
    setRecovery(false);
    history.replaceState(null,'',location.pathname);
    setMessage(error?'パスワードは変更できました。ログアウトを完了できないため、画面を再読み込みしてください。':'パスワードを変更しました。新しいパスワードでログインしてください。');
  }}/>;
  if(!session)return <main className="auth-shell"><section className="auth-card">
    <p className="eyebrow">Personal health archive</p><h1>Health Tracker</h1>
    <p>あなたの記録を、いつもの場所で。</p>
    {screen==='expired'&&<p role="alert">再設定リンクを確認できませんでした。メールの最新のリンクを開くか、再設定メールを送り直してください。</p>}
    {!client?<p role="status">接続の準備中です。設定が完了するとログインできます。</p>:<form onSubmit={login}>
      <label>メールアドレス<input name="email" type="email" autoComplete="username" required/></label>
      <label>パスワード<input name="password" type="password" autoComplete="current-password" required/></label>
      <button type="submit" disabled={authBusy}>ログイン</button>
      <button type="button" className="reset-link" disabled={authBusy} onClick={event=>void requestReset(event.currentTarget.form!)}>パスワードを忘れた方</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p><small>事前に登録された本人アカウントでログインしてください。</small>
  </section></main>;
  return <div key={session.user.id}>
    <aside className="account-bar"><span>本人用の記録</span><a href="#/">からだ</a><a href="#/run">ラン</a><a href="#/data">データ管理</a><button onClick={()=>void client?.auth.signOut().then(({error})=>{if(error)setMessage('ログアウトできませんでした。通信状態を確認してください。');})}>ログアウト</button></aside>
    {message&&<p className="account-message" role="alert">{message}</p>}
    {route==='#/data'?<DataPage/>:route==='#/run'?<RunPage/>:<HealthDashboardApp/>}
  </div>;
}

function ResetPassword({onComplete}:{onComplete:()=>Promise<void>}){
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function update(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!client)return;
    const form=event.currentTarget;
    const data=new FormData(form);
    const password=String(data.get('password'));
    const validation=passwordValidation(password,String(data.get('confirmation')));
    if(validation){setMessage(validation);return;}
    setBusy(true);setMessage('パスワードを変更しています…');
    try{
      const {error}=await client.auth.updateUser({password});
      if(error){setMessage('変更できませんでした。リンクの有効期限やパスワードの条件をご確認ください。');return;}
      form.reset();
      await onComplete();
    }catch{setMessage('処理結果を確認できませんでした。接続を確認し、必要なら新しいパスワードでのログインをお試しください。');}
    finally{setBusy(false);}
  }
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Health Tracker</p><h1>パスワードを再設定</h1><p>新しいパスワードを入力してください。</p>
    <form onSubmit={update}>
      <label>新しいパスワード<input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={busy}/></label>
      <label>確認用パスワード<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={busy}/></label>
      <button type="submit" disabled={busy}>パスワードを変更する</button>
    </form><p role="status" aria-live="polite">{message}</p>
  </section></main>;
}

function DataPage(){
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  async function backup(){
    setBusy(true);setMessage('');
    try {
      const archive=await readArchive();
      const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`health-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage('バックアップを作成しました。個人用の安全な場所に保管してください。');
    }catch{setMessage('バックアップできませんでした。ログインと接続をご確認ください。');}
    finally{setBusy(false);}
  }
  async function upload(){
    if(!file)return;setBusy(true);setMessage('取り込み中です。画面を閉じずにお待ちください。');
    try {
      const result=await importArchive(JSON.parse(await file.text()));
      setMessage(`追加${result.inserted}件、登録済み${result.unchanged}件。保存内容の照合も完了しました。`);
    }catch(error){setMessage(error instanceof Error?error.message:'取り込みを停止しました。保存状態を確認してください。');}
    finally{setBusy(false);}
  }
  return <main className="app-shell"><section className="panel data-panel"><h1>データ管理</h1>
    <h2>バックアップ</h2><p>保留中の手入力を含む、すべての記録を保存します。</p><button disabled={busy} onClick={()=>void backup()}>バックアップを保存</button>
    <h2>記録を取り込む</h2><p>このサイトのバックアップ、または変換済みの記録JSONを選んでください。Apple Healthの原本やZIPは直接取り込めません。同じ記録は追加せず、異なる値がある場合はその取り込み単位を停止します。</p>
    <label>記録ファイル<input type="file" accept=".json,application/json" disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)}/></label>
    <button disabled={busy||!file} onClick={()=>void upload()}>選んだファイルを取り込む</button>
    <p role="status" aria-live="polite">{message}</p>
  </section></main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
