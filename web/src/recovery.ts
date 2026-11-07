export function recoveryRequested(href:string):boolean {
  const url=new URL(href);
  return url.searchParams.get('recovery')==='1' || new URLSearchParams(url.hash.slice(1)).get('type')==='recovery';
}

export function authScreen({ready,hasSession,recovery}:{ready:boolean;hasSession:boolean;recovery:boolean}) {
  if(!ready)return 'loading';
  if(recovery)return hasSession?'reset':'expired';
  return hasSession?'dashboard':'login';
}

export function passwordValidation(password:string,confirmation:string):string|null {
  if(password.length<8)return 'パスワードは8文字以上で入力してください。';
  if(password!==confirmation)return '確認用パスワードが一致しません。';
  return null;
}

export function resetRedirect(href:string):string {
  const url=new URL('./',href);
  url.searchParams.set('recovery','1');
  return url.toString();
}
