const crypto=require("crypto");
const {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}=require("@simplewebauthn/server");
const {client,sha}=require("./admin-auth-lib");
const rpName="Calzado Carola Admin";
const b64=b=>Buffer.from(b).toString("base64url");
const unb64=s=>new Uint8Array(Buffer.from(s,"base64url"));
function res(statusCode,data){return{statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(data)}}
function env(event){const host=String(event.headers.host||"catalogo-carola.netlify.app").split(":")[0];return{rpID:host,origin:"https://"+host}}
async function saveChallenge(db,kind,value){const {data,error}=await db.from("admin_auth_challenges").insert({kind,challenge:value}).select("id").single();if(error)throw error;return data.id}
async function takeChallenge(db,id,kind){const {data,error}=await db.from("admin_auth_challenges").delete().eq("id",id).eq("kind",kind).select("challenge,created_at").maybeSingle();if(error||!data)throw new Error("Solicitud vencida. Intenta de nuevo.");if(Date.now()-new Date(data.created_at).getTime()>600000)throw new Error("Solicitud vencida. Intenta de nuevo.");return data.challenge}
async function makeSession(db){const token=crypto.randomBytes(32).toString("base64url"),expires_at=new Date(Date.now()+2592000000).toISOString();const {error}=await db.from("admin_sessions").insert({token_hash:sha(token),expires_at});if(error)throw error;return{token,expires_at}}
exports.handler=async event=>{try{
 const db=client(),{rpID,origin}=env(event),body=event.body?JSON.parse(event.body):{},action=String(body.action||event.queryStringParameters?.action||"");
 if(action==="status"){const {count}=await db.from("admin_passkeys").select("*",{count:"exact",head:true});return res(200,{success:true,hasPasskey:(count||0)>0})}
 if(action==="register-options"){
  if(!process.env.ADMIN_PASSWORD||String(body.password||"")!==process.env.ADMIN_PASSWORD)return res(401,{success:false,error:"Contraseña incorrecta"});
  const {data:existing}=await db.from("admin_passkeys").select("credential_id");
  const options=await generateRegistrationOptions({rpName,rpID,userName:"Carola Admin",userDisplayName:"Carola Admin",attestationType:"none",authenticatorSelection:{residentKey:"required",userVerification:"required"},excludeCredentials:(existing||[]).map(x=>({id:x.credential_id}))});
  return res(200,{success:true,options,challenge_id:await saveChallenge(db,"register",options.challenge)});
 }
 if(action==="register-verify"){
  if(!process.env.ADMIN_PASSWORD||String(body.password||"")!==process.env.ADMIN_PASSWORD)return res(401,{success:false,error:"Contraseña incorrecta"});
  const expectedChallenge=await takeChallenge(db,body.challenge_id,"register");
  const v=await verifyRegistrationResponse({response:body.response,expectedChallenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
  if(!v.verified||!v.registrationInfo)return res(400,{success:false,error:"No se pudo verificar Face ID"});
  const c=v.registrationInfo.credential;
  const {error}=await db.from("admin_passkeys").upsert({credential_id:c.id,public_key:b64(c.publicKey),counter:c.counter||0,transports:c.transports||[],device_type:v.registrationInfo.credentialDeviceType||null,backed_up:!!v.registrationInfo.credentialBackedUp},{onConflict:"credential_id"});if(error)throw error;
  return res(200,{success:true,...await makeSession(db)});
 }
 if(action==="login-options"){
  const {data:keys}=await db.from("admin_passkeys").select("credential_id,transports");if(!keys||!keys.length)return res(404,{success:false,error:"Primero activa Face ID"});
  const options=await generateAuthenticationOptions({rpID,userVerification:"required",allowCredentials:keys.map(k=>({id:k.credential_id,transports:k.transports||[]}))});
  return res(200,{success:true,options,challenge_id:await saveChallenge(db,"login",options.challenge)});
 }
 if(action==="login-verify"){
  const expectedChallenge=await takeChallenge(db,body.challenge_id,"login"),id=body.response?.id;
  const {data:k}=await db.from("admin_passkeys").select("*").eq("credential_id",id).maybeSingle();if(!k)return res(401,{success:false,error:"Passkey no reconocida"});
  const v=await verifyAuthenticationResponse({response:body.response,expectedChallenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:k.credential_id,publicKey:unb64(k.public_key),counter:Number(k.counter||0),transports:k.transports||[]}});
  if(!v.verified)return res(401,{success:false,error:"No se pudo verificar Face ID"});
  await db.from("admin_passkeys").update({counter:v.authenticationInfo.newCounter,last_used_at:new Date().toISOString()}).eq("id",k.id);
  return res(200,{success:true,...await makeSession(db)});
 }
 return res(400,{success:false,error:"Acción inválida"});
}catch(e){return res(500,{success:false,error:e.message||"Error de autenticación"})}};