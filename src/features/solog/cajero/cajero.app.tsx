import '../../../operational.css'
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getOrCreateDeviceToken } from '../device'
import { FullRuntime, type FullRpc } from './full.runtime'
import { FullCashierPanel } from './full.app'
import { fetchCashierHistory } from './cajero.history'

const call: FullRpc = async (name,args) => {
  if(!supabase) throw new Error('Falta configurar la conexión de SOLOG.')
  const {data,error}=await supabase.rpc(name,args)
  if(error) throw error
  return data
}
function Owner({userId,onLogout}:{userId:string;onLogout:()=>Promise<void>}) {
  const [{runtime,error}]=useState(()=>{try{return {runtime:new FullRuntime(userId,getOrCreateDeviceToken(),window.localStorage,call),error:null}}catch(error){return {runtime:null,error}}})
  if(!runtime)return <main><h1>No se pudo abrir el almacenamiento de conteos</h1><p>{error instanceof Error?error.message:'Revisa el almacenamiento local del navegador.'}</p><button onClick={()=>void onLogout()}>Cerrar sesión</button></main>
  return <FullCashierPanel runtime={runtime} onLogout={onLogout} loadHistory={fetchCashierHistory}/>
}
export function CajeroApp(props:{userId:string;onLogout:()=>Promise<void>}) {return <Owner key={props.userId} {...props}/>}
