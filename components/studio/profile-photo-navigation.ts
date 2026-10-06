"use client";
import { useEffect, useRef } from 'react';
import { CREATOR_NAVIGATION_EVENT } from './creator-navigation';
/** Keep an unfinished local crop across cancel/back attempts; never save implicitly. */
export function useProfilePhotoNavigation({dirty,busy,onBlocked}: {dirty:boolean;busy:boolean;onBlocked:(message:string)=>void}) {
  const current = useRef({dirty,busy,onBlocked}); current.current={dirty,busy,onBlocked};
  function allowed() {
    if (current.current.busy) { current.current.onBlocked('Your photo is being processed. Wait for it to finish before leaving.'); return false; }
    if (current.current.dirty && !window.confirm('Discard this unsaved photo crop? Your existing profile photo will stay unchanged.')) return false;
    current.current={...current.current,dirty:false}; return true;
  }
  useEffect(() => {
    const previousUrl=window.location.href, previousState=window.history.state;
    const navigation=(event:Event)=>{if(!allowed())event.preventDefault();};
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(current.current.dirty||current.current.busy){event.preventDefault();event.returnValue='';}};
    const popstate=(event:PopStateEvent)=>{if(!current.current.dirty&&!current.current.busy)return;const target=window.location.href;event.stopImmediatePropagation();window.history.pushState(previousState,'',previousUrl);if(allowed())window.location.assign(target);};
    window.addEventListener(CREATOR_NAVIGATION_EVENT,navigation);window.addEventListener('beforeunload',beforeUnload);window.addEventListener('popstate',popstate,true);
    return ()=>{window.removeEventListener(CREATOR_NAVIGATION_EVENT,navigation);window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('popstate',popstate,true);};
  },[]);
  return (action:()=>void)=>{if(allowed())action();};
}
