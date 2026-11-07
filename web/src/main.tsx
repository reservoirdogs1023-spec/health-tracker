import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { client, importArchive, readArchive, localPreview } from './backend';
import { HealthDashboardApp } from './app/health-dashboard';
import { RunPage } from './app/run/run-page';
import './app/globals.css';
import './web.css';

function App() {
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false);
  const [route,setRoute]=useState(location.hash);
  const [message,setMessage]=useState('');
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
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{
      if(active){setSession(next);setReady(true);setMessage('');}
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
  if(localPreview)return <><aside className="account-bar">画面確認用の架空データ（保存できません）</aside>{route==='#/run'?<RunPage/>:<HealthDashboardApp/>}</>;
  if(!ready)return <main className="auth-shell" role="status">ログイン状態を確認しています。</main>;
  if(!session)return <main className="auth-shell"><section className="auth-card">
    <p className="eyebrow">Personal health archive</p><h1>Health Tracker</h1>
    <p>あなたの記録を、いつもの場所で。</p>
    {!client?<p role="status">接続の準備中です。設定が完了するとログインできます。</p>:<form onSubmit={login}>
      <label>メールアドレス<input name="email" type="email" autoComplete="username" required/></label>
      <label>パスワード<input name="password" type="password" autoComplete="current-password" required/></label>
      <button type="submit">ログイン</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p><small>事前に登録された本人アカウントでログインしてください。</small>
  </section></main>;
  return <div key={session.user.id}>
    <aside className="account-bar"><span>本人用の記録</span><a href="#/">からだ</a><a href="#/run">ラン</a><a href="#/data">データ管理</a><button onClick={()=>void client?.auth.signOut().then(({error})=>{if(error)setMessage('ログアウトできませんでした。通信状態を確認してください。');})}>ログアウト</button></aside>
    {message&&<p className="account-message" role="alert">{message}</p>}
    {route==='#/data'?<DataPage/>:route==='#/run'?<RunPage/>:<HealthDashboardApp/>}
  </div>;
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
