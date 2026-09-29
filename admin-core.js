

/* ACCESO ADMIN: PASSKEY EN IPHONE/IPAD, CONTRASEÑA EN PC */
let adminPassword="";
function isIPhone(){return /iPhone|iPod/i.test(navigator.userAgent)}
function isIPad(){return /iPad/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function b64urlToBytes(value){const s=String(value||"").replace(/-/g,"+").replace(/_/g,"/"),p=s+"=".repeat((4-s.length%4)%4),raw=atob(p);return Uint8Array.from(raw,x=>x.charCodeAt(0))}
function arrayToB64url(buffer){const bytes=new Uint8Array(buffer),chunk=0x8000;let binary="";for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function credentialToJSON(cred){if(!cred)return null;const o={id:cred.id,rawId:arrayToB64url(cred.rawId),type:cred.type,response:{}},r=cred.response;for(const k of ["clientDataJSON","attestationObject","authenticatorData","signature","userHandle"])if(r[k])o.response[k]=arrayToB64url(r[k]);if(typeof r.getTransports==="function")o.response.transports=r.getTransports();if(cred.authenticatorAttachment)o.authenticatorAttachment=cred.authenticatorAttachment;if(typeof cred.getClientExtensionResults==="function")o.clientExtensionResults=cred.getClientExtensionResults();return o}
async function authCall(payload){const r=await fetch("/.netlify/functions/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({success:false,error:"Respuesta inválida"}));if(!r.ok||!j.success)throw new Error(j.error||"No se pudo autenticar");return j}
function authOverlay(message,html){let el=document.getElementById("carolaAuth");if(!el){el=document.createElement("div");el.id="carolaAuth";el.style.cssText="position:fixed;inset:0;z-index:99999;background:#fff7fa;display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit";el.innerHTML='<div id="carolaAuthBox" style="max-width:390px;width:100%;background:white;border:1px solid #f2d6df;border-radius:24px;padding:30px;text-align:center;box-shadow:0 18px 50px #8b496122"><div style="font-size:28px;font-weight:800;letter-spacing:3px;color:#c86f8b">CAROLA</div><h2 style="margin:18px 0 8px">Acceso al administrador</h2><p id="carolaAuthText" style="color:#777;line-height:1.5"></p><div id="carolaAuthAction"></div></div>';document.body.appendChild(el)}document.getElementById("carolaAuthText").textContent=message||"Verificando acceso…";document.getElementById("carolaAuthAction").innerHTML=html||""}
function hideAuth(){document.getElementById("carolaAuth")?.remove()}
function passwordLogin(){return new Promise(resolve=>{authOverlay("Ingresa la contraseña de administrador.",'<input id="adminDesktopPassword" type="password" autocomplete="current-password" placeholder="Contraseña" style="box-sizing:border-box;width:100%;margin-top:12px;padding:14px;border:1px solid #ddd;border-radius:14px;font-size:16px"><button id="adminDesktopEnter" type="button" style="width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#171717;color:white;font-weight:800;font-size:16px">Entrar</button>');const input=document.getElementById("adminDesktopPassword"),btn=document.getElementById("adminDesktopEnter");btn.onclick=()=>{if(!input.value)return;adminPassword=input.value;hideAuth();resolve()};input.onkeydown=e=>{if(e.key==="Enter")btn.click()};input.focus()})}
async function setupApplePasskey(){
  const password=prompt("Primera configuración en este dispositivo: escribe la contraseña una sola vez.");
  if(password===null)throw new Error("Configuración cancelada");
  const a=await authCall({action:"register-options",password}),options=a.options;
  options.challenge=b64urlToBytes(options.challenge);options.user.id=b64urlToBytes(options.user.id);
  options.authenticatorSelection={...(options.authenticatorSelection||{}),authenticatorAttachment:"platform",residentKey:"required",userVerification:"required"};
  if(options.excludeCredentials)options.excludeCredentials=options.excludeCredentials.map(x=>({...x,id:b64urlToBytes(x.id)}));
  authOverlay("Toca para activar Face ID en este iPhone o iPad.",'<button id="activateApplePasskey" type="button" style="width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#171717;color:white;font-weight:800;font-size:16px">Activar Face ID</button>');
  const cred=await new Promise((resolve,reject)=>{document.getElementById("activateApplePasskey").onclick=async()=>{try{resolve(await navigator.credentials.create({publicKey:options}))}catch(e){reject(e)}}});
  const v=await authCall({action:"register-verify",password,challenge_id:a.challenge_id,response:credentialToJSON(cred)});adminPassword=v.token
}
async function loginApplePasskey(){
  const a=await authCall({action:"login-options"}),options=a.options;
  options.challenge=b64urlToBytes(options.challenge);
  /* No enviamos allowCredentials en Apple: fuerza el selector de credencial residente del dispositivo/iCloud Keychain y evita el flujo QR de otro dispositivo. */
  delete options.allowCredentials;
  options.userVerification="required";
  authOverlay("Usa Face ID para entrar.");
  const cred=await navigator.credentials.get({publicKey:options,mediation:"optional"});
  const v=await authCall({action:"login-verify",challenge_id:a.challenge_id,response:credentialToJSON(cred)});adminPassword=v.token
}
async function authenticateAdmin(){
  /* En iPhone/iPad intenta la llave de acceso automáticamente al abrir la página. */
  if(!isIPhone()&&!isIPad())return passwordLogin();
  try{
    if(!window.PublicKeyCredential)throw new Error("Este navegador no admite Passkeys.");
    const status=await authCall({action:"status"});
    if(!status.hasPasskey){
      /* La primera configuración sí necesita una acción del usuario para registrar la llave. */
      authOverlay("Configura Face ID / llave de acceso para entrar automáticamente las próximas veces.",'<button id="activateFirstPasskey" type="button" style="width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#171717;color:white;font-weight:800;font-size:16px">Configurar llave de acceso</button><button id="authFirstPassword" type="button" style="width:100%;margin-top:10px;padding:14px;border:1px solid #ddd;border-radius:14px;background:white;color:#171717;font-weight:800;font-size:16px">Entrar con contraseña</button>');
      return new Promise(resolve=>{
        document.getElementById("activateFirstPasskey").onclick=async()=>{try{await setupApplePasskey();if(isIPad())localStorage.setItem("carola-ipad-passkey-v1","1");hideAuth();resolve()}catch(e){await passwordLogin();resolve()}};
        document.getElementById("authFirstPassword").onclick=async()=>{await passwordLogin();resolve()};
      });
    }
    authOverlay("Abriendo llave de acceso…");
    await loginApplePasskey();
    if(isIPad())localStorage.setItem("carola-ipad-passkey-v1","1");
    hideAuth();
  }catch(error){
    /* Si Safari/iOS bloquea o cancela la solicitud automática, conserva el acceso manual como respaldo. */
    authOverlay("No se pudo abrir la llave automáticamente.",'<button id="authRetryPasskey" type="button" style="width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#171717;color:white;font-weight:800;font-size:16px">Usar llave de acceso</button><button id="authFallbackPassword" type="button" style="width:100%;margin-top:10px;padding:14px;border:1px solid #ddd;border-radius:14px;background:white;color:#171717;font-weight:800;font-size:16px">Entrar con contraseña</button>');
    return new Promise(resolve=>{
      document.getElementById("authRetryPasskey").onclick=async()=>{try{await loginApplePasskey();hideAuth();resolve()}catch(e){}};
      document.getElementById("authFallbackPassword").onclick=async()=>{await passwordLogin();resolve()};
    });
  }
}

/* VARIABLES */

let allProducts=[];
let allOrders=[];
let deletedOrders=[];
let ordersLoaded=false;
let colorBlockCounter=0;
let activeNoteOrder=null;
let allFinance=[];
let financeLoaded=false;
let editingFinanceId=null;

/* ELEMENTOS */

const form=document.getElementById("uploadForm");
const modelo=document.getElementById("modelo");
const categoria=document.getElementById("categoria");
const colorBlocks=document.getElementById("colorBlocks");
const uploadButton=document.getElementById("uploadButton");
const statusBox=document.getElementById("status");
const models=document.getElementById("models");
const refreshButton=document.getElementById("refreshButton");
const uploadSection=document.getElementById("uploadSection");
const operationStatus=document.getElementById("operationStatus");
const catalogTab=document.getElementById("catalogTab");
const ordersTab=document.getElementById("ordersTab");
const catalogPanel=document.getElementById("catalogPanel");
const ordersPanel=document.getElementById("ordersPanel");
const orders=document.getElementById("orders");
const modelSearch=document.getElementById("modelSearch");
const clearModelSearch=document.getElementById("clearModelSearch");
const modelResultCount=document.getElementById("modelResultCount");
const orderSearch=document.getElementById("orderSearch");
const sentOrderSearch=document.getElementById("sentOrderSearch");
const sentOrders=document.getElementById("sentOrders");
const noteModal=document.getElementById("noteModal");
const noteFolio=document.getElementById("noteFolio");
const noteClient=document.getElementById("noteClient");
const noteDate=document.getElementById("noteDate");
const noteLines=document.getElementById("noteLines");
const noteTotal=document.getElementById("noteTotal");
const noteClose=document.getElementById("noteClose");
const saveNote=document.getElementById("saveNote");
const shareNote=document.getElementById("shareNote");
const printNote=document.getElementById("printNote");
const extraLines=document.getElementById("extraLines");
const addExtra=document.getElementById("addExtra");
const receiptPreview=document.getElementById("receiptPreview");
const financeTab=document.getElementById("financeTab");
const salesExcel=document.getElementById("salesExcel");
const importPreview=document.getElementById("importPreview");
let pendingSalesImport=null;
const financePanel=document.getElementById("financePanel");
const beHistoryYear=document.getElementById("beHistoryYear");
const beHistoryMonth=document.getElementById("beHistoryMonth");
const beHistorySummary=document.getElementById("beHistorySummary");
const financeDate=document.getElementById("financeDate");
const financeProfit=document.getElementById("financeProfit");
const financeHalfDozens=document.getElementById("financeHalfDozens");
const saveFinance=document.getElementById("saveFinance");
const financeYear=document.getElementById("financeYear");
const financeMonth=document.getElementById("financeMonth");
const financeWeek=document.getElementById("financeWeek");
const financeRows=document.getElementById("financeRows");
const recordMonth=document.getElementById("recordMonth");
const recordWeek=document.getElementById("recordWeek");
const recordDay=document.getElementById("recordDay");
const recordTotals=document.getElementById("recordTotals");
const recordCompare=document.getElementById("recordCompare");
const compareMonthA=document.getElementById("compareMonthA"),compareMonthB=document.getElementById("compareMonthB"),customMonthCompare=document.getElementById("customMonthCompare"),recordFrom=document.getElementById("recordFrom"),recordTo=document.getElementById("recordTo"),rangeSummary=document.getElementById("rangeSummary");let recordRangeActive=false;
const financeChart=document.getElementById("financeChart");
const monthlyProfitChart=document.getElementById("monthlyProfitChart");
const monthlyProfitTooltip=document.getElementById("monthlyProfitTooltip");
const pairsChart=document.getElementById("pairsChart");
const financeTooltip=document.getElementById("financeTooltip");
const pairsTooltip=document.getElementById("pairsTooltip");
const fixedYear=document.getElementById("fixedYear");
const fixedMonth=document.getElementById("fixedMonth");
const fixedExpense=document.getElementById("fixedExpense");
const expenseName=document.getElementById("expenseName");
const expenseAmount=document.getElementById("expenseAmount");
const expenseList=document.getElementById("expenseList");
let financeGoals=[];
let financeExpenses=[];


// Paneles compactos de Finanzas
function bindCompactToggle(buttonId,panelId,otherButtonId,otherPanelId){
  const b=document.getElementById(buttonId),p=document.getElementById(panelId);
  if(!b||!p)return;
  b.onclick=function(){
    const opening=!p.classList.contains("open");
    if(otherPanelId){const op=document.getElementById(otherPanelId),ob=document.getElementById(otherButtonId);if(op)op.classList.remove("open");if(ob)ob.classList.remove("active")}
    p.classList.toggle("open",opening);b.classList.toggle("active",opening);
  };
}
bindCompactToggle("toggleImportFinance","importFinancePanel","toggleEntryFinance","entryFinancePanel");
bindCompactToggle("toggleEntryFinance","entryFinancePanel","toggleImportFinance","importFinancePanel");
bindCompactToggle("toggleMonthCompare","monthComparePanel","toggleCustomRange","customRangePanel");
bindCompactToggle("toggleCustomRange","customRangePanel","toggleMonthCompare","monthComparePanel");

let suppliersLoaded=false,suppliers=[],supplierMoves=[],supplierPurchases=[],selectedSupplier=Number(sessionStorage.getItem("carolaSelectedSupplier")||0);
async function supplierCall(payload){
 const r=await fetch("/.netlify/functions/admin-proveedores",{method:payload?"POST":"GET",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:payload?JSON.stringify(payload):undefined});
 const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||"Error");return j;
}
async function loadSuppliers(){
 try{const j=await supplierCall();suppliers=(j.proveedores||[]).sort((a,b)=>{const an=String(a.nombre||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),bn=String(b.nombre||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();if(an==="noe")return -1;if(bn==="noe")return 1;return an.localeCompare(bn,"es")});supplierMoves=j.movimientos||[];supplierPurchases=j.compras||[];suppliersLoaded=true;renderFinanceBalances();if(selectedSupplier&&!suppliers.some(p=>Number(p.id)===Number(selectedSupplier)))selectedSupplier=0;renderSuppliers()}catch(e){supplierContent.innerHTML='<div class="finance-empty">'+escapeHtml(e.message)+'</div>'}
}
function pendingField(x,key,type,placeholder){
 if(x[key])return key==="fecha"?formatFinanceDate(x[key]):escapeHtml(x[key]);
 return '<input id="pend-'+key+'-'+x.id+'" type="'+type+'" placeholder="'+placeholder+'" style="width:120px;padding:7px;border:1px solid #e3d5db;border-radius:8px">';
}
function supplierHistoryTable(items,tipo){
 if(!items.length)return '<div class="finance-empty">Sin '+(tipo==="nota"?"notas":"pagos")+'.</div>';
 return '<div style="overflow:auto"><table class="finance-table"><thead><tr><th>Fecha</th><th>Importe</th><th>'+(tipo==="nota"?"Folio":"Forma")+'</th>'+(tipo==="nota"?'<th>Pares</th>':'')+'<th></th></tr></thead><tbody>'+items.map(x=>{
  const date=x.fecha?formatFinanceDate(x.fecha):"—";
  const detail=tipo==="nota"?(x.folio?escapeHtml(x.folio):"—"):(x.forma_pago?escapeHtml(x.forma_pago):"—");
  const pairs=tipo==="nota"?(x.pares||"—"):"";
  return '<tr id="move-row-'+x.id+'"><td>'+date+'</td><td>'+moneyShort(x.importe)+'</td><td>'+detail+'</td>'+(tipo==="nota"?'<td>'+pairs+'</td>':'')+'<td><details class="move-menu"><summary>Editar</summary><div><button type="button" onclick="editSupplierMove('+x.id+')">Editar datos</button><button type="button" onclick="deleteSupplierMove('+x.id+')">Eliminar</button></div></details></td></tr>'
 }).join("")+'</tbody></table></div>';
}
function editSupplierMove(id){
 const x=supplierMoves.find(m=>m.id===id);if(!x)return;
 const row=document.getElementById("move-row-"+id),note=x.tipo==="nota";
 row.innerHTML='<td><input id="edit-date-'+id+'" type="date" value="'+(x.fecha||"")+'"></td><td><input id="edit-amount-'+id+'" type="number" min=".01" step=".01" value="'+Number(x.importe)+'"></td><td><input id="edit-detail-'+id+'" type="text" value="'+escapeHtml(note?(x.folio||""):(x.forma_pago||""))+'" placeholder="'+(note?"Folio":"Forma de pago")+'"></td>'+(note?'<td><input id="edit-pairs-'+id+'" type="number" min="1" step="1" value="'+(x.pares||"")+'"></td>':'')+'<td><button class="record-tool-btn" onclick="saveSupplierEdit('+id+')">Guardar</button> <button class="record-tool-btn" onclick="renderSuppliers()">Cancelar</button></td>';
}
async function saveSupplierEdit(id){
 const x=supplierMoves.find(m=>m.id===id),note=x.tipo==="nota";
 const b={action:"update-movement",id,tipo:x.tipo,fecha:document.getElementById("edit-date-"+id).value,importe:Number(document.getElementById("edit-amount-"+id).value)};
 if(note){b.folio=document.getElementById("edit-detail-"+id).value;b.pares=Number(document.getElementById("edit-pairs-"+id).value)}else b.forma_pago=document.getElementById("edit-detail-"+id).value;
 try{await supplierCall(b);await loadSuppliers()}catch(e){alert(e.message)}
}
function deletedSupplierTable(items){
 if(!items.length)return '<div class="finance-empty">No hay movimientos eliminados.</div>';
 return '<div style="overflow:auto"><table class="finance-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Importe</th><th></th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+(x.fecha?formatFinanceDate(x.fecha):"—")+'</td><td>'+(x.tipo==="nota"?"Nota":"Pago")+'</td><td>'+escapeHtml(x.tipo==="nota"?(x.folio||"—"):(x.forma_pago||"—"))+'</td><td>'+moneyShort(x.importe)+'</td><td><button class="record-tool-btn" onclick="restoreSupplierMove('+x.id+')">Restaurar</button></td></tr>').join("")+'</tbody></table></div>';
}
async function restoreSupplierMove(id){try{await supplierCall({action:"restore-movement",id});await loadSuppliers()}catch(e){alert(e.message)}}
function simpleSupplierTable(items,label){if(!items.length)return '<div class="finance-empty">Sin registros.</div>';return '<div style="overflow:auto"><table class="finance-table"><thead><tr><th>Fecha</th><th>Registro</th><th>Importe</th><th></th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+formatFinanceDate(x.fecha)+'</td><td>'+label+'</td><td>'+moneyShort(x.importe)+'</td><td><button class="record-tool-btn" onclick="deleteSupplierMove('+x.id+')">Eliminar</button></td></tr>').join("")+'</tbody></table></div>'}
function supplierSpecialForm(tipo,target){const el=document.getElementById(target),cut=tipo==="corte";el.innerHTML='<div class="finance-grid" style="margin-top:16px"><div><label>Fecha</label><input id="specialDate" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div><div><label>'+(cut?'Cantidad del corte':'Saldo inicial')+'</label><input id="specialAmount" type="number" min=".01" step=".01" placeholder="$0.00"></div></div><button id="saveSpecial" class="supplier-save-btn" type="button">Guardar '+(cut?'corte':'saldo inicial')+'</button>';document.getElementById("saveSpecial").onclick=async()=>{const fecha=specialDate.value,importe=Number(specialAmount.value);if(!fecha||!Number.isFinite(importe)||importe<=0)return alert("Completa fecha e importe.");try{await supplierCall({action:"add-movement",proveedor_id:selectedSupplier,tipo,fecha,importe,observaciones:cut?"Corte de conciliación; no afecta el saldo":"Saldo inicial"});await loadSuppliers()}catch(e){alert(e.message)}}}
function supplierPurchasesHtml(providerId){
 const rows=supplierPurchases.filter(x=>Number(x.proveedor_id)===Number(providerId)).sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||""))||Number(b.id)-Number(a.id));
 if(!rows.length)return '<div class="finance-empty">Todavía no hay compras detalladas registradas para este proveedor.</div>';
 return '<div style="max-height:520px;overflow:auto;display:grid;gap:10px">'+rows.slice(0,10).map(x=>{const d=x.compras_proveedores_detalle||[];const detail=d.length?'<div style="padding:0 14px 14px;overflow:auto"><table class="finance-table"><thead><tr><th>Modelo</th><th>Color</th><th>Pares</th><th>Costo</th><th>Subtotal</th></tr></thead><tbody>'+d.map(i=>'<tr><td>'+escapeHtml(i.modelo)+'</td><td>'+escapeHtml(i.color)+'</td><td>'+Number(i.cantidad||0)+'</td><td>'+(i.costo_unitario==null?"—":moneyShort(i.costo_unitario))+'</td><td>'+(i.subtotal==null?"—":moneyShort(i.subtotal))+'</td></tr>').join("")+'</tbody></table></div>':'<div class="finance-empty">Compra sin detalle de modelos.</div>';return '<details class="deleted-box" style="margin:0"><summary style="display:flex;justify-content:space-between;gap:12px"><span><strong>'+formatFinanceDate(x.fecha)+'</strong> · Folio '+escapeHtml(x.folio||"—")+'</span><span><strong>'+Number(x.pares_total||0)+' pares</strong> · '+moneyShort(x.importe_total)+'</span></summary>'+detail+'</details>'}).join("")+'</div>';
}
async function quickSupplierPayment(providerId,balance,full){
 const provider=suppliers.find(x=>Number(x.id)===Number(providerId));if(!provider)return;
 const amount=full?Number(balance):Number(prompt("¿Cuánto vas a abonar a "+provider.nombre+"?",""));
 if(!Number.isFinite(amount)||amount<=0)return;
 if(amount>Number(balance)){alert("El abono no puede ser mayor al saldo pendiente.");return}
 const choice=prompt("Forma / concepto del pago:\n\n1 = Efectivo\n2 = Transferencia\n3 = Otro","2");
 if(choice===null)return;
 let forma="";
 if(String(choice).trim()==="1")forma="Efectivo";
 else if(String(choice).trim()==="2")forma="Transferencia";
 else if(String(choice).trim()==="3"){
   const other=prompt("Escribe el concepto del pago.\nEjemplo: Nota 282","");
   if(other===null||!other.trim())return;
   forma=other.trim();
 }else{alert("Selecciona 1, 2 o 3.");return}
 const fecha=new Date().toISOString().slice(0,10);
 if(!confirm((full?"Registrar pago total de ":"Registrar abono de ")+moneyShort(amount)+" a "+provider.nombre+"\nFecha: "+fecha+"\nConcepto: "+forma+"?"))return;
 try{
   await supplierCall({action:"add-movement",proveedor_id:providerId,tipo:"pago",fecha,importe:amount,forma_pago:forma,observaciones:full?"Pago total desde saldo pendiente":"Abono desde saldo pendiente"});
   await loadSuppliers();
 }catch(e){alert(e.message)}
}
function renderSuppliers(){
 const debtors=suppliers.map(p=>{const m=supplierMoves.filter(x=>x.proveedor_id===p.id&&!x.eliminado_en),notes=m.filter(x=>x.tipo==="nota").reduce((s,x)=>s+Number(x.importe||0),0),pays=m.filter(x=>x.tipo==="pago").reduce((s,x)=>s+Number(x.importe||0),0),opening=m.filter(x=>x.tipo==="saldo_inicial").reduce((s,x)=>s+Number(x.importe||0),0);return {id:p.id,nombre:p.nombre,saldo:opening+notes-pays}}).filter(x=>x.saldo>0).sort((a,b)=>b.saldo-a.saldo);
 const totalDebt=debtors.reduce((s,x)=>s+x.saldo,0),debtBox=document.getElementById("supplierDebtTotal");
 if(debtBox)debtBox.innerHTML='<div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><div><span class="supplier-kicker">POR PAGAR</span><h3 style="margin:3px 0 0">Saldo total a proveedores</h3></div><strong style="font-size:26px">'+moneyShort(totalDebt)+'</strong></div>'+(debtors.length?'<div style="margin-top:12px;display:grid;gap:7px">'+debtors.map(x=>'<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #f0e4e9;padding-top:7px"><span style="flex:1">'+escapeHtml(x.nombre)+'</span><strong>'+moneyShort(x.saldo)+'</strong><button class="record-tool-btn" type="button" onclick="quickSupplierPayment('+x.id+','+x.saldo+',true)">Pagado</button><button class="record-tool-btn" type="button" onclick="quickSupplierPayment('+x.id+','+x.saldo+',false)">Abono</button></div>').join("")+'</div>':'<div style="margin-top:8px;color:#888">No hay proveedores con saldo pendiente.</div>');
 supplierSelect.innerHTML='<option value="">Seleccionar proveedor...</option>'+suppliers.map(p=>'<option value="'+p.id+'" '+(p.id===selectedSupplier?'selected':'')+'>'+escapeHtml(p.nombre)+'</option>').join("");
 const p=suppliers.find(x=>Number(x.id)===Number(selectedSupplier));if(!p){supplierContent.style.display="none";document.getElementById("editSupplier").style.display="none";document.getElementById("deleteSupplier").style.display="none";return}supplierContent.style.display="block";document.getElementById("editSupplier").style.display="";document.getElementById("deleteSupplier").style.display="";
 const all=supplierMoves.filter(x=>Number(x.proveedor_id)===Number(p.id)),m=all.filter(x=>!x.eliminado_en),deleted=all.filter(x=>x.eliminado_en),sortMoves=a=>a.sort((x,y)=>{if(!x.fecha&&!y.fecha)return Number(y.id)-Number(x.id);if(!x.fecha)return 1;if(!y.fecha)return -1;const d=String(y.fecha).localeCompare(String(x.fecha));return d||Number(y.id)-Number(x.id)}),notes=sortMoves(m.filter(x=>x.tipo==="nota")),pays=sortMoves(m.filter(x=>x.tipo==="pago")),openings=sortMoves(m.filter(x=>x.tipo==="saldo_inicial")),cuts=sortMoves(m.filter(x=>x.tipo==="corte"));
 const nt=notes.reduce((s,x)=>s+Number(x.importe),0),pt=pays.reduce((s,x)=>s+Number(x.importe),0),opening=openings.reduce((s,x)=>s+Number(x.importe),0),pairs=notes.reduce((s,x)=>s+Number(x.pares||0),0),pending=notes.filter(x=>!x.pares||!x.fecha||!x.folio).length+pays.filter(x=>!x.fecha||!x.forma_pago).length,balance=opening+nt-pt,visibleSupplierNotes=notes.filter(x=>accountMoveVisible(x,supplierViewMonth,supplierViewYear)),visibleSupplierPays=pays.filter(x=>accountMoveVisible(x,supplierViewMonth,supplierViewYear)),visibleNt=visibleSupplierNotes.reduce((s,x)=>s+Number(x.importe||0),0),visiblePt=visibleSupplierPays.reduce((s,x)=>s+Number(x.importe||0),0);
 supplierContent.innerHTML='<h2>'+escapeHtml(p.nombre)+'</h2>'+accountFilterHtml("supplier",m,supplierViewMonth,supplierViewYear)+'<div class="finance-summary"><div class="summary-box"><strong>'+moneyShort(opening+nt)+'</strong><span>TOTAL NOTAS + CORTE</span></div><div class="summary-box"><strong>'+moneyShort(pt)+'</strong><span>TOTAL PAGADO</span></div><div class="summary-box"><strong>'+moneyShort(balance)+'</strong><span>SALDO PENDIENTE</span></div><div class="summary-box"><strong>'+pairs+'</strong><span>PARES RECIBIDOS</span></div></div>'+
 '<div class="record-tools-tabs"><button id="newNoteBtn" class="record-tool-btn">+ Nota / entrega</button><button id="newPayBtn" class="record-tool-btn">+ Pago</button></div><div id="supplierForm"></div>'+
 ''+
 '<div class="supplier-split"><details class="supplier-column supplier-notes"><summary class="supplier-card-head"><div><span class="supplier-kicker">ENTRADAS</span><h3>Notas / entregas</h3></div><div class="supplier-summary-right"><strong class="supplier-card-total">'+moneyShort(visibleNt)+'</strong><span class="supplier-chevron">⌄</span></div></summary><div class="supplier-card-body">'+supplierHistoryTable(visibleSupplierNotes,"nota")+'</div></details><details class="supplier-column supplier-pays"><summary class="supplier-card-head"><div><span class="supplier-kicker">SALIDAS</span><h3>Pagos</h3></div><div class="supplier-summary-right"><strong class="supplier-card-total">'+moneyShort(visiblePt)+'</strong><span class="supplier-chevron">⌄</span></div></summary><div class="supplier-card-body">'+supplierHistoryTable(visibleSupplierPays,"pago")+'</div></details></div><details class="deleted-box" style="margin-top:14px"><summary>📦 Historial de compras</summary><div style="padding:14px">'+supplierPurchasesHtml(p.id)+'</div></details><details class="deleted-box" style="margin-top:14px"><summary>Corte actual</summary><div style="padding:14px"><button id="newCutBtn" class="record-tool-btn" type="button">Crear corte</button><div id="cutForm"></div>'+simpleSupplierTable([...openings,...cuts].sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||""))),"Corte")+'</div></details><details class="deleted-box"><summary>Eliminados ('+deleted.length+')</summary>'+deletedSupplierTable(deleted)+'</details>';
 wireAccountFilter("supplier");document.getElementById("newNoteBtn").onclick=()=>supplierForm("nota");document.getElementById("newPayBtn").onclick=()=>supplierForm("pago");document.getElementById("newCutBtn").onclick=()=>supplierSpecialForm("corte","cutForm");
}
async function savePendingMove(id,tipo){
 const get=k=>{const e=document.getElementById('pend-'+k+'-'+id);return e?e.value:undefined};
 const b={action:"complete-movement",id,fecha:get("fecha")};
 if(tipo==="nota"){b.folio=get("folio");const v=get("pares");if(v!==undefined)b.pares=Number(v)}
 else b.forma_pago=get("forma_pago");
 try{await supplierCall(b);await loadSuppliers()}catch(e){alert(e.message)}
}
function selectSupplier(id){selectedSupplier=id?Number(id):0;if(selectedSupplier)sessionStorage.setItem("carolaSelectedSupplier",String(selectedSupplier));else sessionStorage.removeItem("carolaSelectedSupplier");renderSuppliers()}
function supplierForm(tipo){
 const isNote=tipo==="nota";document.getElementById("supplierForm").innerHTML='<div class="finance-grid" style="margin-top:16px"><div><label>Fecha</label><input id="smDate" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div>'+(isNote?'<div><label>Folio de nota</label><input id="smFolio" type="text" placeholder="Ej. 173"></div>':'<div><label>Forma de pago</label><select id="smPay"><option>Transferencia</option><option>Efectivo</option><option>Depósito</option><option>Otro</option></select></div>')+'<div><label>Importe</label><input id="smAmount" type="number" min="0.01" step="0.01" placeholder="$0.00"></div>'+(isNote?'<div><label>Pares recibidos</label><input id="smPairs" type="number" min="1" step="1" placeholder="0"></div>':'')+'<div><label>Observaciones</label><input id="smObs" type="text" placeholder="Opcional"></div></div><button id="saveSupplierMove" class="supplier-save-btn" type="button">Guardar '+(isNote?"nota":"pago")+'</button>';
 document.getElementById("saveSupplierMove").onclick=async()=>{try{
   const fecha=smDate.value,importe=Number(smAmount.value);
   if(!fecha)return alert("Falta la fecha. No se registró nada.");
   if(!Number.isFinite(importe)||importe<=0)return alert("Falta un importe válido. No se registró nada.");
   const b={action:"add-movement",proveedor_id:selectedSupplier,tipo,fecha,importe,observaciones:smObs.value};
   if(isNote){
     const folio=smFolio.value.trim(),pares=Number(smPairs.value);
     if(!folio)return alert("Falta el folio de la nota. No se registró nada.");
     if(!Number.isInteger(pares)||pares<=0)return alert("Falta el número de pares recibidos. No se registró nada.");
     b.folio=folio;b.pares=pares;
   }else{
     const forma=smPay.value.trim();
     if(!forma)return alert("Falta la forma de pago. No se registró nada.");
     b.forma_pago=forma;
   }
   await supplierCall(b);await loadSuppliers()
 }catch(e){alert(e.message)}};
}
async function deleteSupplierMove(id){if(!confirm("¿Mover este movimiento a Eliminados?"))return;try{await supplierCall({action:"delete-movement",id});await loadSuppliers()}catch(e){alert(e.message)}}
document.getElementById("addSupplier").onclick=async()=>{const nombre=supplierName.value.trim();if(!nombre)return;try{await supplierCall({action:"add-provider",nombre});supplierName.value="";await loadSuppliers()}catch(e){alert(e.message)}};
document.getElementById("refreshSuppliers").onclick=loadSuppliers;
document.getElementById("supplierSelect").onchange=e=>selectSupplier(e.target.value);document.getElementById("supplierSelect").oninput=e=>selectSupplier(e.target.value);document.getElementById("editSupplier").onclick=async()=>{const p=suppliers.find(x=>x.id===selectedSupplier);if(!p)return;const nombre=prompt("Nuevo nombre del proveedor:",p.nombre);if(!nombre||nombre.trim()===p.nombre)return;try{await supplierCall({action:"update-provider",id:p.id,nombre:nombre.trim()});await loadSuppliers()}catch(e){alert(e.message)}};document.getElementById("deleteSupplier").onclick=async()=>{const p=suppliers.find(x=>x.id===selectedSupplier);if(!p||!confirm("¿Eliminar al proveedor "+p.nombre+"? Sus movimientos quedarán ocultos junto con el proveedor."))return;try{await supplierCall({action:"delete-provider",id:p.id});selectedSupplier=0;await loadSuppliers()}catch(e){alert(e.message)}};
document.getElementById("toggleNewSupplier").onclick=()=>{const p=document.getElementById("newSupplierPanel"),open=p.style.display!=="none";p.style.display=open?"none":"block";toggleNewSupplier.classList.toggle("active",!open)};
let clientsLoaded=false,clients=[],clientMoves=[],selectedClient=0;
async function clientCall(payload){
 const r=await fetch("/.netlify/functions/admin-clientes",{method:payload?"POST":"GET",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:payload?JSON.stringify(payload):undefined});
 const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||"Error");return j;
}
async function loadClients(){
 try{const j=await clientCall();clients=(j.clientes_deuda||[]).sort((a,b)=>{const an=String(a.nombre||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),bn=String(b.nombre||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();if(an==="noe")return -1;if(bn==="noe")return 1;return an.localeCompare(bn,"es")});clientMoves=j.movimientos||[];window.catalogClients=j.catalogo_clientes||[];clientsLoaded=true;renderFinanceBalances();renderClients();renderClientDirectory()}catch(e){clientContent.innerHTML='<div class="finance-empty">'+escapeHtml(e.message)+'</div>'}
}
function pendingField(x,key,type,placeholder){
 if(x[key])return key==="fecha"?formatFinanceDate(x[key]):escapeHtml(x[key]);
 return '<input id="pend-'+key+'-'+x.id+'" type="'+type+'" placeholder="'+placeholder+'" style="width:120px;padding:7px;border:1px solid #e3d5db;border-radius:8px">';
}
function clientHistoryTable(items,tipo){
 if(!items.length)return '<div class="finance-empty">Sin '+(tipo==="nota"?"notas":"pagos")+'.</div>';
 return '<div style="overflow:auto"><table class="finance-table"><thead><tr><th>Fecha</th><th>Importe</th><th>'+(tipo==="nota"?"Folio":"Forma")+'</th>'+(tipo==="nota"?'<th>Pares</th>':'')+'<th></th></tr></thead><tbody>'+items.map(x=>{
  const date=x.fecha?formatFinanceDate(x.fecha):"—";
  const detail=tipo==="nota"?(x.folio?escapeHtml(x.folio):"—"):(x.forma_pago?escapeHtml(x.forma_pago):"—");
  const pairs=tipo==="nota"?(x.pares||"—"):"";
  return '<tr id="move-row-'+x.id+'"><td>'+date+'</td><td>'+moneyShort(x.importe)+'</td><td>'+detail+'</td>'+(tipo==="nota"?'<td>'+pairs+'</td>':'')+'<td><details class="move-menu"><summary>Editar</summary><div><button type="button" onclick="editClientMove('+x.id+')">Editar datos</button><button type="button" onclick="deleteClientMove('+x.id+')">Eliminar</button></div></details></td></tr>'
 }).join("")+'</tbody></table></div>';
}
function editClientMove(id){
 const x=clientMoves.find(m=>m.id===id);if(!x)return;
 const row=document.getElementById("move-row-"+id),note=x.tipo==="nota";
 row.innerHTML='<td><input id="edit-date-'+id+'" type="date" value="'+(x.fecha||"")+'"></td><td><input id="edit-amount-'+id+'" type="number" min=".01" step=".01" value="'+Number(x.importe)+'"></td><td><input id="edit-detail-'+id+'" type="text" value="'+escapeHtml(note?(x.folio||""):(x.forma_pago||""))+'" placeholder="'+(note?"Folio":"Forma de abono")+'"></td>'+(note?'<td><input id="edit-pairs-'+id+'" type="number" min="1" step="1" value="'+(x.pares||"")+'"></td>':'')+'<td><button class="record-tool-btn" onclick="saveClientEdit('+id+')">Guardar</button> <button class="record-tool-btn" onclick="renderClients()">Cancelar</button></td>';
}
async function saveClientEdit(id){
 const x=clientMoves.find(m=>m.id===id),note=x.tipo==="nota";
 const b={action:"update-movement",id,tipo:x.tipo,fecha:document.getElementById("edit-date-"+id).value,importe:Number(document.getElementById("edit-amount-"+id).value)};
 if(note){b.folio=document.getElementById("edit-detail-"+id).value;b.pares=Number(document.getElementById("edit-pairs-"+id).value)}else b.forma_pago=document.getElementById("edit-detail-"+id).value;
 try{await clientCall(b);await loadClients()}catch(e){alert(e.message)}
}
function deletedClientTable(items){
 if(!items.length)return '<div class="finance-empty">No hay movimientos eliminados.</div>';
 return '<div style="overflow:auto"><table class="finance-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Importe</th><th></th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+(x.fecha?formatFinanceDate(x.fecha):"—")+'</td><td>'+(x.tipo==="nota"?"Nota":"Pago")+'</td><td>'+escapeHtml(x.tipo==="nota"?(x.folio||"—"):(x.forma_pago||"—"))+'</td><td>'+moneyShort(x.importe)+'</td><td><button class="record-tool-btn" onclick="restoreClientMove('+x.id+')">Restaurar</button></td></tr>').join("")+'</tbody></table></div>';
}
async function restoreClientMove(id){try{await clientCall({action:"restore-movement",id});await loadClients()}catch(e){alert(e.message)}}
function clientDebtOriginDate(clientId){
 const notes=clientMoves.filter(x=>x.cliente_id===clientId&&!x.eliminado_en&&(x.tipo==="nota"||x.tipo==="saldo_inicial")&&x.fecha).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
 return notes.length?notes[0].fecha:new Date().toISOString().slice(0,10);
}
async function quickClientPayment(clientId,balance,full){
 const client=clients.find(x=>x.id===clientId);if(!client)return;
 const amount=full?Number(balance):Number(prompt("¿Cuánto abonó "+client.nombre+"?",""));
 if(!Number.isFinite(amount)||amount<=0)return;
 if(amount>Number(balance)){alert("El abono no puede ser mayor al saldo pendiente.");return}
 const choice=prompt("Forma / concepto del pago:\n\n1 = Efectivo\n2 = Transferencia\n3 = Otro","2");
 if(choice===null)return;
 let forma="";
 if(String(choice).trim()==="1")forma="Efectivo";
 else if(String(choice).trim()==="2")forma="Transferencia";
 else if(String(choice).trim()==="3"){
   const other=prompt("Escribe el concepto del pago.\nEjemplo: Nota 280, devolución, cheque...","");
   if(other===null||!other.trim())return;
   forma=other.trim();
 }else{alert("Selecciona 1, 2 o 3.");return}
 const now=new Date(),fecha=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
 if(!confirm((full?"Registrar como pagado ":"Registrar abono de "+moneyShort(amount)+" para ")+client.nombre+"\nFecha: "+fecha+"\nConcepto: "+forma+"?"))return;
 try{await clientCall({action:"add-movement",cliente_id:clientId,tipo:"pago",fecha,importe:amount,forma_pago:forma,observaciones:full?"Pago total desde saldo pendiente":"Abono desde saldo pendiente"});await loadClients()}catch(e){alert(e.message)}
}
function renderClients(){
 const debtors=clients.map(p=>{const m=clientMoves.filter(x=>x.cliente_id===p.id&&!x.eliminado_en),notes=m.filter(x=>x.tipo==="nota").reduce((s,x)=>s+Number(x.importe||0),0),pays=m.filter(x=>x.tipo==="pago").reduce((s,x)=>s+Number(x.importe||0),0),opening=m.filter(x=>x.tipo==="saldo_inicial").reduce((s,x)=>s+Number(x.importe||0),0);return {id:p.id,nombre:p.nombre,saldo:opening+notes-pays}}).filter(x=>x.saldo>0).sort((a,b)=>b.saldo-a.saldo);
 const totalDebt=debtors.reduce((s,x)=>s+x.saldo,0),debtBox=document.getElementById("clientDebtTotal");
 if(debtBox)debtBox.innerHTML='<div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><div><span class="supplier-kicker">POR COBRAR</span><h3 style="margin:3px 0 0">Saldo total de clientes</h3></div><strong style="font-size:26px">'+moneyShort(totalDebt)+'</strong></div>'+(debtors.length?'<div style="margin-top:12px;display:grid;gap:7px">'+debtors.map(x=>'<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #f0e4e9;padding-top:7px"><span style="flex:1">'+escapeHtml(x.nombre)+'</span><strong>'+moneyShort(x.saldo)+'</strong><button class="record-tool-btn" type="button" onclick="quickClientPayment('+x.id+','+x.saldo+',true)">Pagado</button><button class="record-tool-btn" type="button" onclick="quickClientPayment('+x.id+','+x.saldo+',false)">Abono</button></div>').join("")+'</div>':'<div style="margin-top:8px;color:#888">No hay clientes con saldo pendiente.</div>');
 const balances=new Map(debtors.map(x=>[Number(x.id),x.saldo]));
 clientSelect.innerHTML='<option value="">Buscar o seleccionar cualquier cliente...</option>'+clients.map(p=>{const saldo=balances.get(Number(p.id));return '<option value="'+p.id+'" '+(Number(p.id)===Number(selectedClient)?'selected':'')+'>'+escapeHtml(p.nombre)+(saldo>0?' · '+escapeHtml(moneyShort(saldo)):'')+'</option>'}).join("");
 const p=clients.find(x=>x.id===selectedClient);if(!p){clientContent.style.display="none";document.getElementById("editClient").style.display="none";document.getElementById("deleteClient").style.display="none";return}clientContent.style.display="block";document.getElementById("editClient").style.display="";document.getElementById("deleteClient").style.display="";
 const all=clientMoves.filter(x=>x.cliente_id===p.id),m=all.filter(x=>!x.eliminado_en),deleted=all.filter(x=>x.eliminado_en),sortMoves=a=>a.sort((x,y)=>{if(!x.fecha&&!y.fecha)return Number(y.id)-Number(x.id);if(!x.fecha)return 1;if(!y.fecha)return -1;const d=String(y.fecha).localeCompare(String(x.fecha));return d||Number(y.id)-Number(x.id)}),notes=sortMoves(m.filter(x=>x.tipo==="nota")),pays=sortMoves(m.filter(x=>x.tipo==="pago")),openings=sortMoves(m.filter(x=>x.tipo==="saldo_inicial")),visibleNotes=sortMoves([...notes,...openings]);
 const notesTotal=visibleNotes.reduce((s,x)=>s+(Number.isFinite(Number(x.importe))?Number(x.importe):0),0),pt=pays.reduce((s,x)=>s+(Number.isFinite(Number(x.importe))?Number(x.importe):0),0),pairs=notes.reduce((s,x)=>s+Number(x.pares||0),0),pending=notes.filter(x=>!x.pares||!x.fecha||!x.folio).length+pays.filter(x=>!x.fecha||!x.forma_pago).length,balance=notesTotal-pt,monthClientNotes=visibleNotes.filter(x=>accountMoveVisible(x,clientViewMonth,clientViewYear)),monthClientPays=pays.filter(x=>accountMoveVisible(x,clientViewMonth,clientViewYear)),monthNotesTotal=monthClientNotes.reduce((s,x)=>s+Number(x.importe||0),0),monthPt=monthClientPays.reduce((s,x)=>s+Number(x.importe||0),0);
 clientContent.innerHTML='<h2>'+escapeHtml(p.nombre)+'</h2>'+accountFilterHtml("client",m,clientViewMonth,clientViewYear)+'<div class="finance-summary"><div class="summary-box"><strong>'+moneyShort(notesTotal)+'</strong><span>TOTAL NOTAS</span></div><div class="summary-box"><strong>'+moneyShort(pt)+'</strong><span>TOTAL ABONADO</span></div><div class="summary-box"><strong>'+moneyShort(balance)+'</strong><span>SALDO PENDIENTE</span></div><div class="summary-box"><strong>'+pairs+'</strong><span>PARES VENDIDOS</span></div></div>'+
 '<div class="record-tools-tabs"><button id="clientNewNoteBtn" class="record-tool-btn">+ Nota / venta</button><button id="clientNewPayBtn" class="record-tool-btn">+ Abono</button></div><div id="clientForm"></div>'+
 ''+
 '<div class="supplier-split"><details class="supplier-column supplier-notes"><summary class="supplier-card-head"><div><span class="supplier-kicker">SALIDAS</span><h3>Notas / ventas</h3></div><div class="supplier-summary-right"><strong class="supplier-card-total">'+moneyShort(monthNotesTotal)+'</strong><span class="supplier-chevron">⌄</span></div></summary><div class="supplier-card-body">'+clientHistoryTable(monthClientNotes,"nota")+'</div></details><details class="supplier-column supplier-pays"><summary class="supplier-card-head"><div><span class="supplier-kicker">ENTRADAS</span><h3>Abonos</h3></div><div class="supplier-summary-right"><strong class="supplier-card-total">'+moneyShort(monthPt)+'</strong><span class="supplier-chevron">⌄</span></div></summary><div class="supplier-card-body">'+clientHistoryTable(monthClientPays,"pago")+'</div></details></div><details class="deleted-box"><summary>Eliminados ('+deleted.length+')</summary>'+deletedClientTable(deleted)+'</details>';
 wireAccountFilter("client");document.getElementById("clientNewNoteBtn").onclick=()=>clientForm("nota");document.getElementById("clientNewPayBtn").onclick=()=>clientForm("pago");
}
async function savePendingClientMove(id,tipo){
 const get=k=>{const e=document.getElementById('pend-'+k+'-'+id);return e?e.value:undefined};
 const b={action:"complete-movement",id,fecha:get("fecha")};
 if(tipo==="nota"){b.folio=get("folio");const v=get("pares");if(v!==undefined)b.pares=Number(v)}
 else b.forma_pago=get("forma_pago");
 try{await clientCall(b);await loadClients()}catch(e){alert(e.message)}
}
function selectClient(id){selectedClient=Number(id);renderClients()}
function clientForm(tipo){
 const isNote=tipo==="nota";document.getElementById("clientForm").innerHTML='<div class="finance-grid" style="margin-top:16px"><div><label>Fecha</label><input id="cmDate" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div>'+(isNote?'<div><label>Folio de nota</label><input id="cmFolio" type="text" placeholder="Ej. 173"></div>':'<div><label>Forma de abono</label><select id="cmPay"><option>Transferencia</option><option>Efectivo</option><option>Depósito</option><option>Otro</option></select></div>')+'<div><label>Importe</label><input id="cmAmount" type="number" min="0.01" step="0.01" placeholder="$0.00"></div>'+(isNote?'<div><label>Pares recibidos</label><input id="cmPairs" type="number" min="1" step="1" placeholder="0"></div>':'')+'<div><label>Observaciones</label><input id="cmObs" type="text" placeholder="Opcional"></div></div><button id="saveClientMove" class="supplier-save-btn" type="button">Guardar '+(isNote?"nota":"abono")+'</button>';
 document.getElementById("saveClientMove").onclick=async()=>{try{
   const fecha=cmDate.value,importe=Number(cmAmount.value);
   if(!fecha)return alert("Falta la fecha. No se registró nada.");
   if(!Number.isFinite(importe)||importe<=0)return alert("Falta un importe válido. No se registró nada.");
   const b={action:"add-movement",cliente_id:selectedClient,tipo,fecha,importe,observaciones:cmObs.value};
   if(isNote){
     const folio=cmFolio.value.trim(),pares=Number(cmPairs.value);
     if(!folio)return alert("Falta el folio de la nota. No se registró nada.");
     if(!Number.isInteger(pares)||pares<=0)return alert("Falta el número de pares recibidos. No se registró nada.");
     b.folio=folio;b.pares=pares;
   }else{
     const forma=cmPay.value.trim();
     if(!forma)return alert("Falta la forma de pago. No se registró nada.");
     b.forma_pago=forma;
   }
   await clientCall(b);await loadClients()
 }catch(e){alert(e.message)}};
}
async function deleteClientMove(id){if(!confirm("¿Mover este movimiento a Eliminados?"))return;try{await clientCall({action:"delete-movement",id});await loadClients()}catch(e){alert(e.message)}}
document.getElementById("addClient").onclick=async()=>{const nombre=clientName.value.trim();if(!nombre)return;try{await clientCall({action:"add-provider",nombre});clientName.value="";await loadClients()}catch(e){alert(e.message)}};
document.getElementById("refreshClients").onclick=loadClients;
document.getElementById("clientSelect").onchange=e=>selectClient(e.target.value);document.getElementById("editClient").onclick=async()=>{const p=clients.find(x=>x.id===selectedClient);if(!p)return;const nombre=prompt("Nuevo nombre del cliente:",p.nombre);if(!nombre||nombre.trim()===p.nombre)return;try{await clientCall({action:"update-provider",id:p.id,nombre:nombre.trim()});await loadClients()}catch(e){alert(e.message)}};document.getElementById("deleteClient").onclick=async()=>{const p=clients.find(x=>x.id===selectedClient);if(!p||!confirm("¿Eliminar al cliente "+p.nombre+"? Sus movimientos quedarán ocultos junto con el cliente."))return;try{await clientCall({action:"delete-provider",id:p.id});selectedClient=0;await loadClients()}catch(e){alert(e.message)}};
document.getElementById("toggleNewClient").onclick=()=>{const p=document.getElementById("newClientPanel"),open=p.style.display!=="none";p.style.display=open?"none":"block";toggleNewClient.classList.toggle("active",!open)};
function renderClientDirectory(){
 const list=document.getElementById("clientDirectoryList"),meta=document.getElementById("clientDirectoryMeta"),search=document.getElementById("clientDirectorySearch");if(!list||!meta)return;
 const q=normalizeText(search?search.value:"");
 const all=[...(window.catalogClients||[])].sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{sensitivity:"base"}));
 const rows=q?all.filter(x=>normalizeText((x.nombre||"")+" "+(x.telefono||"")).includes(q)):all;
 meta.textContent=(q?rows.length+" de ":"")+all.length+" clientes en la agenda";
 list.innerHTML=rows.length?rows.map(x=>'<div class="client-agenda-row" id="directory-client-'+x.id+'"><div class="client-agenda-name">'+escapeHtml(x.nombre||"")+'</div><div class="client-agenda-phone">'+escapeHtml(x.telefono||"Sin teléfono")+'</div><details class="move-menu"><summary>Editar</summary><div><button type="button" onclick="editDirectoryClient('+x.id+')">Editar datos</button><button type="button" onclick="deleteDirectoryClient('+x.id+')">Eliminar</button></div></details></div>').join(""):'<div class="finance-empty">No encontré clientes.</div>';
}
function editDirectoryClient(id){
 const x=(window.catalogClients||[]).find(v=>v.id===id),row=document.getElementById("directory-client-"+id);if(!x||!row)return;
 row.innerHTML='<input id="dir-name-'+id+'" type="text" value="'+escapeHtml(x.nombre||"")+'" placeholder="Nombre" style="min-width:0;padding:9px;border:1px solid #e3d5db;border-radius:9px"><input id="dir-phone-'+id+'" type="tel" value="'+escapeHtml(x.telefono||"")+'" placeholder="Teléfono" style="min-width:0;padding:9px;border:1px solid #e3d5db;border-radius:9px"><div style="display:flex;gap:6px"><button class="supplier-save-btn" type="button" onclick="saveDirectoryClient('+id+')">Guardar</button><button class="record-tool-btn" type="button" onclick="renderClientDirectory()">Cancelar</button></div>';
}
async function saveDirectoryClient(id){
 const nombre=document.getElementById("dir-name-"+id).value.trim(),telefono=document.getElementById("dir-phone-"+id).value.trim();if(!nombre){alert("El nombre es obligatorio.");return}
 try{await clientCall({action:"update-directory-client",id,nombre,telefono});await loadClients()}catch(e){alert(e.message)}
}
async function deleteDirectoryClient(id){
 const x=(window.catalogClients||[]).find(v=>v.id===id);if(!x||!confirm("¿Eliminar a "+x.nombre+" de la agenda de clientes?"))return;
 try{await clientCall({action:"delete-directory-client",id});await loadClients()}catch(e){alert(e.message)}
}
const clientDirectorySearch=document.getElementById("clientDirectorySearch");if(clientDirectorySearch)clientDirectorySearch.oninput=renderClientDirectory;
document.getElementById("clientDirectoryBtn").onclick=()=>{const p=document.getElementById("clientDirectory"),open=p.style.display!=="none";p.style.display=open?"none":"block";clientDirectoryBtn.classList.toggle("active",!open)};

/* PESTAÑAS */
function clearAdminTabs(){
  [catalogTab,ordersTab,financeTab,clientsTab,suppliersTab,accountsTab].forEach(x=>x&&x.classList.remove("active"));
  [catalogPanel,ordersPanel,financePanel,suppliersPanel,clientsPanel].forEach(x=>x&&x.classList.remove("active"));
}
catalogTab.onclick=function(){clearAdminTabs();catalogTab.classList.add("active");catalogPanel.classList.add("active")};
ordersTab.onclick=async function(){clearAdminTabs();ordersTab.classList.add("active");ordersPanel.classList.add("active");if(!ordersLoaded)await loadOrders()};
financeTab.onclick=async function(){clearAdminTabs();financeTab.classList.add("active");financePanel.classList.add("active");if(!financeLoaded)await loadFinance()};
clientsTab.onclick=async function(){clearAdminTabs();clientsTab.classList.add("active");clientsPanel.classList.add("active");if(!clientsLoaded)await loadClients()};
suppliersTab.onclick=async function(){clearAdminTabs();suppliersTab.classList.add("active");suppliersPanel.classList.add("active");if(!suppliersLoaded)await loadSuppliers()};
accountsTab.onchange=async function(){const v=this.value;clearAdminTabs();accountsTab.classList.add("active");if(v==="clients"){clientsPanel.classList.add("active");if(!clientsLoaded)await loadClients()}else if(v==="suppliers"){suppliersPanel.classList.add("active");if(!suppliersLoaded)await loadSuppliers()}else{accountsTab.classList.remove("active");financeTab.classList.add("active");financePanel.classList.add("active")}};

/* MENSAJES */

function showStatus(message,type){
  statusBox.textContent=message;
  statusBox.className=type;
}

function showOperation(message){
  operationStatus.textContent=message;
  operationStatus.style.display="block";
}

function hideOperation(){
  operationStatus.style.display="none";
}

/* NORMALIZAR */

function normalizeText(value){
  return String(value||"")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ");
}

/* CATEGORÍAS */

function categoryOptions(selected){
  const categories=[
    "Bota",
    "Botín",
    "Mocasín",
    "Escolar",
    "Zapatilla"
  ];

  let html='<option value="">Seleccionar...</option>';

  categories.forEach(function(item){
    html+=`
      <option
        value="${escapeAttribute(item)}"
        ${normalizeText(item)===normalizeText(selected)?"selected":""}
      >
        ${escapeHtml(item)}
      </option>
    `;
  });

  return html;
}

/* COLOR */

function formatColor(value){
  const original=String(value||"").trim();

  if(!original)return "";

  const normalized=normalizeText(original);

  const names={
    "negro":"Negro",
    "camel":"Camel",
    "latte":"Latte",
    "maquillaje":"Maquillaje",
    "conac":"Coñac",
    "cafe":"Café",
    "capuchino":"Capuchino",
    "espresso":"Espresso",
    "shedron":"Shedrón",
    "blanco":"Blanco",
    "beige":"Beige",
    "hueso":"Hueso",
    "rojo":"Rojo",
    "vino":"Vino",
    "rosa":"Rosa",
    "dorado":"Dorado",
    "plata":"Plata",
    "azul":"Azul",
    "marino":"Marino",
    "miel":"Miel",
    "chocolate":"Chocolate",
    "taupe":"Taupe"
  };

  if(names[normalized]){
    return names[normalized];
  }

  return original
    .toLowerCase()
    .replace(/(^|\s)\S/g,function(letter){
      return letter.toUpperCase();
    });
}

/* BLOQUES COLOR */

async function loadUploadProviders(){
  const select=document.getElementById("uploadProveedor");
  try{
    const r=await fetch("/.netlify/functions/admin-proveedores",{headers:{"x-admin-password":adminPassword}});
    const j=await readJson(r);
    if(!r.ok||!j.success)throw new Error(j.error||"No se pudieron cargar proveedores.");
    const list=(j.proveedores||[]).filter(x=>x.activo!==false).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"));
    select.innerHTML='<option value="">Seleccionar proveedor...</option>'+list.map(x=>'<option value="'+Number(x.id)+'">'+escapeHtml(x.nombre)+'</option>').join("");
    const preset=document.getElementById("presetSupplier");
    if(preset)preset.innerHTML='<option value="">Todos los proveedores</option>'+list.map(x=>'<option value="'+Number(x.id)+'">'+escapeHtml(x.nombre)+'</option>').join("");
  }catch(e){select.innerHTML='<option value="">Error al cargar proveedores</option>'}
}

let inventoryColorLabels=[],editingColorTags=[];

async function loadColorPresets(){
  try{
    const r=await fetch("/.netlify/functions/admin-manage",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"list-color-labels"})});
    const j=await readJson(r);if(!r.ok||!j.success)throw new Error(j.error||"No se pudieron cargar las etiquetas.");
    inventoryColorLabels=j.etiquetas||[];renderColorPresetList();renderColorLabelSelect();
  }catch(e){console.error("COLOR LABELS:",e)}
}
function renderColorPresetList(){
  const el=document.getElementById("colorPresetList");if(!el)return;
  el.innerHTML=inventoryColorLabels.length?inventoryColorLabels.map(x=>'<span class="color-preset-chip"><b>'+escapeHtml(x.nombre)+'</b> · '+escapeHtml((x.colores||[]).join(", "))+' <button type="button" data-label-delete="'+Number(x.id)+'">×</button></span>').join(""):'<span style="color:#999;font-size:12px">Aún no hay etiquetas de colores.</span>';
}
function renderColorLabelSelect(){
  const s=document.getElementById("uploadColorLabel");if(!s)return;
  const current=s.value;
  s.innerHTML='<option value="">Seleccionar etiqueta...</option>'+inventoryColorLabels.map(x=>'<option value="'+Number(x.id)+'">'+escapeHtml(x.nombre)+'</option>').join("");
  if([...s.options].some(o=>o.value===current))s.value=current;
  renderColorQuickPicks();
}
function selectedColorLabel(){
  const id=Number(document.getElementById("uploadColorLabel")?.value||0);
  return inventoryColorLabels.find(x=>Number(x.id)===id)||null;
}
function renderColorQuickPicks(){
  const el=document.getElementById("colorQuickPicks");if(!el)return;
  const label=selectedColorLabel(),used=[...document.querySelectorAll("#colorBlocks .color-input")].map(x=>normalizeText(x.value));
  const colors=label&&Array.isArray(label.colores)?label.colores:[];
  el.innerHTML=colors.length?'<div style="width:100%;font-size:11px;font-weight:900;color:#777">COLORES DE '+escapeHtml(String(label.nombre).toUpperCase())+'</div>'+colors.map(color=>'<button type="button" class="color-quick-pick '+(used.includes(normalizeText(color))?'used':'')+'" data-preset-color="'+escapeAttribute(color)+'">+ '+escapeHtml(formatColor(color))+'</button>').join(""):"";
}
function renderEditingColorTags(){
  const el=document.getElementById("colorLabelTags");if(!el)return;
  el.innerHTML=editingColorTags.map((x,i)=>'<span class="color-label-tag">'+escapeHtml(formatColor(x))+'<button type="button" data-tag-index="'+i+'">×</button></span>').join("");
}
function addEditingColor(){
  const input=document.getElementById("colorLabelInput"),v=input.value.trim();if(!v)return;
  if(!editingColorTags.some(x=>normalizeText(x)===normalizeText(v)))editingColorTags.push(formatColor(v));
  input.value="";renderEditingColorTags();
}
async function saveColorLabel(){
  addEditingColor();
  const nombre=document.getElementById("colorLabelName").value.trim();
  if(!nombre){alert("Escribe el nombre de la etiqueta.");return}
  if(!editingColorTags.length){alert("Agrega al menos un color y presiona Enter.");return}
  const btn=document.getElementById("saveColorLabel");btn.disabled=true;btn.textContent="Guardando...";
  try{
    const r=await fetch("/.netlify/functions/admin-manage",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"save-color-label",nombre,colores:editingColorTags})});
    const j=await readJson(r);if(!r.ok||!j.success)throw new Error(j.error||"No se pudo guardar.");
    document.getElementById("colorLabelName").value="";editingColorTags=[];renderEditingColorTags();await loadColorPresets();
  }catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent="Guardar etiqueta"}
}

function createColorBlock(colorValue=""){
  colorBlockCounter++;

  const id=colorBlockCounter;
  const block=document.createElement("div");

  block.className="color-block";
  block.dataset.blockId=id;

  block.innerHTML=`
    <div class="color-block-top">

      <span class="color-number">
        COLOR
      </span>

      <button
        type="button"
        class="remove-color-block"
      >
        Eliminar
      </button>

    </div>

    <label>Color</label>

    <input
      type="text"
      class="color-input"
      placeholder="Ej. Negro"
      autocomplete="off"
      value="${escapeAttribute(colorValue)}"
    >

    <label>Cantidad de pares</label>

    <input
      type="number"
      class="color-quantity"
      min="6"
      step="6"
      inputmode="numeric"
      placeholder="6, 12, 18..."
    >
    <div class="category-help">La existencia de este color debe registrarse en múltiplos de 6 pares.</div>

    <label
      class="file-label"
      for="colorFiles${id}"
    >
      📷 Seleccionar fotografías de este color
    </label>

    <input
      id="colorFiles${id}"
      class="color-files"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
    >

    <div class="color-preview"></div>

    <div class="file-count">
      Ninguna fotografía seleccionada
    </div>
  `;

  colorBlocks.appendChild(block);

  updateColorBlockLabels();

  block.querySelector(".color-files").onchange=function(){
    renderColorPreview(block);
  };

  block.querySelector(".remove-color-block").onclick=function(){
    const blocks=
      colorBlocks.querySelectorAll(".color-block");

    if(blocks.length<=1){
      alert(
        "Debe existir al menos un color."
      );
      return;
    }

    block.remove();
    updateColorBlockLabels();
  };

  return block;
}

function updateColorBlockLabels(){
  const blocks=[
    ...colorBlocks.querySelectorAll(".color-block")
  ];

  blocks.forEach(function(block,index){
    block.querySelector(".color-number").textContent=
      "COLOR "+(index+1);

    block.querySelector(".remove-color-block").style.display=
      blocks.length===1
        ?"none"
        :"inline-block";
  });
}

function renderColorPreview(block){
  const input=
    block.querySelector(".color-files");

  const preview=
    block.querySelector(".color-preview");

  const counter=
    block.querySelector(".file-count");

  preview.innerHTML="";

  const files=
    Array.from(input.files||[]);

  if(!files.length){
    counter.textContent=
      "Ninguna fotografía seleccionada";
    return;
  }

  counter.textContent=
    files.length===1
      ?"1 fotografía seleccionada"
      :files.length+" fotografías seleccionadas";

  files.forEach(function(file){
    const img=document.createElement("img");

    img.src=
      URL.createObjectURL(file);

    preview.appendChild(img);
  });
}

document.getElementById("colorLabelInput").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();addEditingColor()}});
document.getElementById("colorLabelTags").onclick=function(e){const b=e.target.closest("[data-tag-index]");if(!b)return;editingColorTags.splice(Number(b.dataset.tagIndex),1);renderEditingColorTags()};
document.getElementById("saveColorLabel").onclick=saveColorLabel;
document.getElementById("colorPresetList").onclick=async function(e){
  const b=e.target.closest("[data-label-delete]");if(!b)return;
  if(!confirm("¿Eliminar esta etiqueta de colores?"))return;
  const r=await fetch("/.netlify/functions/admin-manage",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"delete-color-label",id:Number(b.dataset.labelDelete)})});
  const j=await readJson(r);if(!r.ok||!j.success){alert(j.error||"No se pudo eliminar.");return}await loadColorPresets();
};
document.getElementById("uploadColorLabel").addEventListener("change",renderColorQuickPicks);
document.getElementById("colorQuickPicks").onclick=function(e){
  const b=e.target.closest("[data-preset-color]");if(!b||b.classList.contains("used"))return;
  const empty=[...document.querySelectorAll("#colorBlocks .color-block")].find(x=>!x.querySelector(".color-input").value.trim());
  if(empty)empty.querySelector(".color-input").value=b.dataset.presetColor;else createColorBlock(b.dataset.presetColor);
  renderColorQuickPicks();
};
document.getElementById("colorBlocks").addEventListener("input",e=>{if(e.target.classList.contains("color-input"))renderColorQuickPicks()});

document.getElementById("addColorBlock").onclick=function(){
  const block=createColorBlock("");

  setTimeout(function(){
    block
      .querySelector(".color-input")
      .focus();
  },100);
};

/* BASE64 */

function fileToBase64(file){
  return new Promise(function(resolve,reject){
    /*
      Las fotos del iPhone pueden pesar varios MB. Enviarlas en base64
      directamente puede superar el límite de la función de Netlify y Safari
      sólo muestra "Load failed". Las optimizamos ANTES de enviarlas.
    */
    const reader=new FileReader();

    reader.onerror=function(){
      reject(new Error("No se pudo leer "+file.name));
    };

    reader.onload=function(){
      const img=new Image();

      img.onerror=function(){
        reject(new Error("No se pudo procesar "+file.name));
      };

      img.onload=function(){
        try{
          const MAX_SIDE=1600;
          const scale=Math.min(1,MAX_SIDE/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
          const width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
          const height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
          const canvas=document.createElement("canvas");
          canvas.width=width;
          canvas.height=height;
          const ctx=canvas.getContext("2d",{alpha:false});
          if(!ctx)throw new Error("No se pudo preparar la fotografía.");
          ctx.fillStyle="#fff";
          ctx.fillRect(0,0,width,height);
          ctx.drawImage(img,0,0,width,height);

          const result=canvas.toDataURL("image/jpeg",0.82);
          const comma=result.indexOf(",");
          if(comma===-1)throw new Error("No se pudo convertir la fotografía.");

          resolve({
            name:String(file.name||"foto").replace(/\.[^.]+$/,"")+".jpg",
            type:"image/jpeg",
            data:result.substring(comma+1)
          });
        }catch(error){
          reject(error);
        }
      };

      img.src=String(reader.result||"");
    };

    reader.readAsDataURL(file);
  });
}

/* SUBIR */

form.onsubmit=async function(event){
  event.preventDefault();

  const modelValue=
    modelo.value.trim();

  const categoryValue=
    categoria.value.trim();
  const proveedorValue=Number(document.getElementById("uploadProveedor").value||0);
  const precioCompraValue=Number(document.getElementById("precioCompra").value);
  const precioVentaValue=Number(document.getElementById("precioVenta").value);


  if(!modelValue){
    showStatus(
      "Falta escribir el modelo.",
      "error"
    );

    modelo.focus();
    return false;
  }

  if(!proveedorValue){showStatus("Selecciona el proveedor.","error");return false;}
  if(!Number.isFinite(precioCompraValue)||precioCompraValue<0){showStatus("Escribe un precio de compra válido.","error");return false;}
  if(!Number.isFinite(precioVentaValue)||precioVentaValue<0){showStatus("Escribe un precio de venta válido.","error");return false;}
  if(!categoryValue){
    showStatus(
      "Selecciona la categoría del modelo.",
      "error"
    );

    categoria.focus();
    return false;
  }

  const blocks=[
    ...colorBlocks.querySelectorAll(".color-block")
  ];

  if(!blocks.length){
    showStatus(
      "Agrega al menos un color.",
      "error"
    );
    return false;
  }

  const entries=[];

  for(let i=0;i<blocks.length;i++){
    const block=blocks[i];

    const colorInput=
      block.querySelector(".color-input");

    const quantityInput=
      block.querySelector(".color-quantity");

    const fileInput=
      block.querySelector(".color-files");

    const colorValue=
      colorInput.value.trim();

    const cantidadParesValue=
      Number(quantityInput.value);

    const files=
      Array.from(fileInput.files||[]);

    if(!colorValue){
      showStatus(
        "Falta escribir el nombre del color "+(i+1)+".",
        "error"
      );

      colorInput.focus();
      return false;
    }

    if(!Number.isInteger(cantidadParesValue)||cantidadParesValue<6||cantidadParesValue%6!==0){
      showStatus(
        "La cantidad de pares del color "+colorValue+" debe ser múltiplo de 6.",
        "error"
      );
      quantityInput.focus();
      return false;
    }

    if(!files.length){
      showStatus(
        "Selecciona fotografías para el color "+colorValue+".",
        "error"
      );
      return false;
    }

    entries.push({
      color:colorValue,
      cantidadPares:cantidadParesValue,
      files
    });
  }

  const normalizedColors=
    entries.map(
      item=>normalizeText(item.color)
    );

  if(
    new Set(normalizedColors).size !==
    normalizedColors.length
  ){
    showStatus(
      "Hay un color repetido. Cada color debe agregarse una sola vez.",
      "error"
    );
    return false;
  }

  uploadButton.disabled=true;

  document.getElementById(
    "addColorBlock"
  ).disabled=true;

  try{
    let totalFiles=0;

    entries.forEach(
      entry=>
        totalFiles+=entry.files.length
    );

    let preparedFiles=0;

    for(
      let i=0;
      i<entries.length;
      i++
    ){
      const entry=entries[i];
      const converted=[];

      for(
        let j=0;
        j<entry.files.length;
        j++
      ){
        preparedFiles++;

        showStatus(
          "Preparando fotografía "+
          preparedFiles+
          " de "+
          totalFiles+
          "...\n"+
          categoryValue+
          " · "+
          entry.color,
          "loading"
        );

        converted.push(
          await fileToBase64(
            entry.files[j]
          )
        );
      }

      showStatus(
        "Subiendo color "+
        (i+1)+
        " de "+
        entries.length+
        "...\n"+
        modelValue+
        " · "+
        categoryValue+
        " · "+
        entry.color,
        "loading"
      );

      uploadButton.textContent=
        "Subiendo "+
        (i+1)+
        " de "+
        entries.length+
        "...";

      const response=
        await fetch(
          "/.netlify/functions/admin-upload",
          {
            method:"POST",
            headers:{
              "Content-Type":
                "application/json",

              "x-admin-password":
                adminPassword
            },

            body:JSON.stringify({
              modelo:modelValue,
              categoria:categoryValue,
              color:entry.color,
              proveedor_id:proveedorValue,
              precio_compra:precioCompraValue,
              precio_venta:precioVentaValue,
              cantidad_pares:entry.cantidadPares,
              imagenes:converted
            })
          }
        );

      const result=
        await readJson(response);

      if(
        !response.ok ||
        !result.success
      ){
        throw new Error(
          "Error en "+
          entry.color+
          ": "+
          (
            result.error ||
            "No se pudieron subir las fotografías."
          )
        );
      }
    }

    showStatus(
      "✓ Modelo "+
      modelValue+
      " cargado correctamente.\n"+
      "Categoría: "+
      categoryValue+
      "\n"+
      entries.length+
      (
        entries.length===1
          ?" color · "
          :" colores · "
      )+
      totalFiles+
      (
        totalFiles===1
          ?" fotografía."
          :" fotografías."
      ),
      "success"
    );

    resetUploadForm();

    await loadModels();

  }catch(error){
    showStatus(
      error.message,
      "error"
    );
  }finally{
    uploadButton.disabled=false;

    document.getElementById(
      "addColorBlock"
    ).disabled=false;

    uploadButton.textContent=
      "Subir modelo al catálogo";
  }

  return false;
};

function resetUploadForm(){
  modelo.value="";
  categoria.value="";
  document.getElementById("uploadProveedor").value="";
  document.getElementById("precioCompra").value="";
  document.getElementById("precioVenta").value="";

  colorBlocks.innerHTML="";
  createColorBlock("");
}

/* ADMIN MANAGE */

async function manage(payload){
  showOperation(
    "Guardando cambio..."
  );

  try{
    const response=
      await fetch(
        "/.netlify/functions/admin-manage",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json",

            "x-admin-password":
              adminPassword
          },

          body:
            JSON.stringify(payload)
        }
      );

    const result=
      await readJson(response);

    if(
      !response.ok ||
      !result.success
    ){
      throw new Error(
        result.error ||
        "No se pudo completar la operación."
      );
    }

    await loadModels();

    operationStatus.textContent=
      "✓ Cambio guardado";

    setTimeout(
      hideOperation,
      1000
    );

    return true;

  }catch(error){
    operationStatus.textContent=
      "Error: "+error.message;

    setTimeout(
      hideOperation,
      4000
    );

    return false;
  }
}

/* CARGAR MODELOS */

async function loadModels(){
  models.innerHTML=
    '<div class="loading">Cargando modelos...</div>';

  try{
    const response=
      await fetch(
        "/.netlify/functions/supabase?includeOutOfStock=1&t="+Date.now(),
        {
          cache:"no-store"
        }
      );

    const result=
      await readJson(response);

    if(
      !response.ok ||
      !result.success
    ){
      throw new Error(
        result.error ||
        "No se pudieron cargar los modelos."
      );
    }

    allProducts=
      Array.isArray(result.productos)
        ?result.productos
        :[];

    allProducts.sort(function(a,b){
      return String(a.modelo).localeCompare(
        String(b.modelo),
        undefined,
        {
          numeric:true,
          sensitivity:"base"
        }
      );
    });

    renderFilteredModels();
    updateInventoryValueSummary();

  }catch(error){
    models.innerHTML=
      '<div class="empty">'+
      escapeHtml(error.message)+
      "</div>";

    modelResultCount.textContent=
      "Error";
  }
}

function updateInventoryValueSummary(){
  let costo=0,venta=0,totalPares=0,agotados=0;
  const lowStock=[];
  const outOfStock=[];
  (allProducts||[]).forEach(product=>{
    const variants=Array.isArray(product.variantes)?product.variantes:[];
    const modelPairs=variants.reduce((sum,variant)=>sum+Math.max(0,Number(variant.existencia||0)),0);
    totalPares+=modelPairs;
    if(modelPairs<=0)agotados++;

    variants.forEach(variant=>{
      const stock=Math.max(0,Number(variant.existencia||0));
      costo+=stock*Number(variant.precio_compra||0);
      venta+=stock*Number(variant.precio_venta||0);
      const item={
        modelId:Number(product.id),
        modelo:String(product.modelo||""),
        categoria:String(product.categoria||""),
        color:String(variant.color||""),
        stock
      };
      if(stock===0)outOfStock.push(item);
      else if(stock<=6)lowStock.push(item);
    });
  });

  const money=new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0});
  const costEl=document.getElementById("inventoryCostTotal"),saleEl=document.getElementById("inventorySaleTotal");
  const pairsEl=document.getElementById("inventoryPairsTotal"),outEl=document.getElementById("inventoryOutOfStockTotal");
  if(costEl)costEl.textContent=money.format(costo);
  if(saleEl)saleEl.textContent=money.format(venta);
  if(pairsEl)pairsEl.textContent=new Intl.NumberFormat("es-MX").format(totalPares);
  if(outEl)outEl.textContent=new Intl.NumberFormat("es-MX").format(agotados);
  renderInventoryAlerts(outOfStock,lowStock);
}

function renderInventoryAlerts(outOfStock,lowStock){
  const button=document.getElementById("inventoryAlertButton");
  const badge=document.getElementById("inventoryAlertBadge");
  const pop=document.getElementById("inventoryAlertPopover");
  if(!button||!badge||!pop)return;

  const totalAlerts=outOfStock.length+lowStock.length;
  badge.textContent=String(totalAlerts);
  badge.classList.toggle("show",totalAlerts>0);

  const section=(title,items,emptyText)=>'<div class="inventory-alert-section">'+
    '<div class="inventory-alert-heading"><span>'+title+'</span><span>'+items.length+'</span></div>'+
    (items.length?items.map(item=>
      '<button type="button" class="inventory-alert-item" data-model-id="'+Number(item.modelId)+'">'+
        '<span><b>Modelo '+escapeHtml(item.modelo)+'</b><small>'+
          escapeHtml((item.color?formatColor(item.color):"Sin color")+(item.categoria?" · "+item.categoria:""))+
        '</small></span>'+
        '<span class="inventory-alert-stock">'+(item.stock===0?'Agotado':item.stock+' pares')+'</span>'+
      '</button>'
    ).join(""):'<div class="inventory-alert-empty">'+emptyText+'</div>')+
  '</div>';

  pop.innerHTML=
    '<div class="inventory-alert-title"><strong>Alertas de inventario</strong><span>'+totalAlerts+' alerta'+(totalAlerts===1?'':'s')+'</span></div>'+
    section("Agotados",outOfStock,"No hay colores agotados.")+
    section("Por acabarse · 1 a 6 pares",lowStock,"No hay colores por acabarse.");
}

/* BUSCADOR MODELOS */

function renderFilteredModels(){
  const query=
    normalizeText(
      modelSearch.value
    );

  clearModelSearch.classList.toggle(
    "show",
    Boolean(query)
  );

  const filtered=
    allProducts.filter(function(product){
      if(!query)return true;

      const modelMatches=
        normalizeText(
          product.modelo
        ).includes(query);

      const categoryMatches=
        normalizeText(
          product.categoria
        ).includes(query);

      const variants=
        Array.isArray(
          product.variantes
        )
          ?product.variantes
          :[];

      const colorMatches=
        variants.some(
          function(variant){
            return normalizeText(
              variant.color
            ).includes(query);
          }
        );

      return (
        modelMatches ||
        categoryMatches ||
        colorMatches
      );
    });

  modelResultCount.textContent=
    filtered.length+
    " modelo"+
    (
      filtered.length===1
        ?""
        :"s"
    );

  renderModels(filtered);
}

modelSearch.oninput=
  renderFilteredModels;

clearModelSearch.onclick=function(){
  modelSearch.value="";
  renderFilteredModels();
  modelSearch.focus();
};

const inventoryAlertButton=document.getElementById("inventoryAlertButton");
const inventoryAlertPopover=document.getElementById("inventoryAlertPopover");
if(inventoryAlertButton&&inventoryAlertPopover){
  inventoryAlertButton.onclick=function(event){
    event.stopPropagation();
    const open=inventoryAlertPopover.classList.toggle("open");
    inventoryAlertPopover.setAttribute("aria-hidden",open?"false":"true");
    inventoryAlertButton.setAttribute("aria-expanded",open?"true":"false");
  };
  inventoryAlertPopover.onclick=function(event){
    event.stopPropagation();
    const item=event.target.closest(".inventory-alert-item");
    if(!item)return;
    const modelId=Number(item.dataset.modelId);
    inventoryAlertPopover.classList.remove("open");
    inventoryAlertPopover.setAttribute("aria-hidden","true");
    inventoryAlertButton.setAttribute("aria-expanded","false");
    const card=models.querySelector('[data-model-id="'+modelId+'"]');
    if(card){
      card.open=true;
      card.scrollIntoView({behavior:"smooth",block:"center"});
    }
  };
  document.addEventListener("click",function(event){
    if(!inventoryAlertPopover.classList.contains("open"))return;
    if(inventoryAlertPopover.contains(event.target)||inventoryAlertButton.contains(event.target))return;
    inventoryAlertPopover.classList.remove("open");
    inventoryAlertPopover.setAttribute("aria-hidden","true");
    inventoryAlertButton.setAttribute("aria-expanded","false");
  });
}

/* RENDER MODELOS */

function renderModels(products){
  if(!products.length){
    models.innerHTML='<div class="empty">No hay modelos con existencia.</div>';
    return;
  }
  let html="";
  products.forEach(function(product){
    const variants=Array.isArray(product.variantes)?product.variantes:[];
    const availablePairs=variants.reduce((sum,variant)=>sum+Math.max(0,Number(variant.existencia||0)),0);
    const availabilityText=availablePairs>0
      ?availablePairs+" "+(availablePairs===1?"par disponible":"pares disponibles")
      :"Sin existencias";
    html+='<details class="inventory-model-card" data-model-id="'+Number(product.id)+'"><summary class="inventory-model-summary"><div class="inventory-model-summary-text"><div class="inventory-model-name">Modelo '+escapeHtml(product.modelo)+'</div><div class="inventory-model-availability '+(availablePairs>0?'has-stock':'no-stock')+'">'+availabilityText+'</div></div><span class="inventory-model-chevron">⌄</span></summary><div class="inventory-model-body"><div class="inventory-model-head"><div class="inventory-model-actions"><button type="button" class="inventory-edit-model">Editar modelo</button><button type="button" class="inventory-add-color">+ Agregar color</button></div></div>';
    variants.forEach(function(variant){
      html+='<div class="inventory-row" data-variant-id="'+Number(variant.id)+'">'+
        '<div class="inventory-color">'+escapeHtml(formatColor(variant.color))+'</div>'+
        '<div class="inventory-stock-wrap"><input class="inventory-stock" type="number" min="0" step="6" inputmode="numeric" value="'+Number(variant.existencia||0)+'"><span>pares</span></div>'+
      '</div>';
    });
    html+='<button type="button" class="inventory-save-model">Guardar existencias</button></div></details>';
  });
  models.innerHTML=html;
}


function modelColorOptions(product){
  const existing=(product.variantes||[]).map(v=>normalizeText(v.color));
  const colors=[...new Set(inventoryColorLabels.flatMap(x=>Array.isArray(x.colores)?x.colores:[]).map(x=>String(x||"").trim()).filter(Boolean))];
  return colors.filter(x=>!existing.includes(normalizeText(x)));
}
function newVariantEditCard(product){
  const first=(product.variantes||[])[0]||{};
  const suppliers=[...document.querySelectorAll("#uploadProveedor option")].filter(o=>o.value).map(o=>({id:Number(o.value),nombre:o.textContent.trim()}));
  const supplierOptions='<option value="">Sin proveedor</option>'+suppliers.map(s=>'<option value="'+s.id+'" '+(Number(first.proveedor_id)===s.id?'selected':'')+'>'+escapeHtml(s.nombre)+'</option>').join('');
  const colors=modelColorOptions(product);
  return '<div class="variant-edit-card new-variant-edit-card" data-new-variant="1"><div class="variant-edit-title">Nuevo color</div><div class="variant-edit-fields"><div><label>Color</label><select class="edit-v-color"><option value="">Seleccionar color...</option>'+colors.map(x=>'<option value="'+escapeAttribute(x)+'">'+escapeHtml(formatColor(x))+'</option>').join('')+'</select></div><div><label>Precio compra</label><input class="edit-v-buy" type="number" min="0" step=".01" value="'+Number(first.precio_compra||0)+'"></div><div><label>Precio venta</label><input class="edit-v-sale" type="number" min="0" step=".01" value="'+Number(first.precio_venta||0)+'"></div><div><label>Proveedor</label><select class="edit-v-supplier">'+supplierOptions+'</select></div><div><label>Pares</label><input class="edit-v-stock" type="number" min="0" step="6" inputmode="numeric" value="0"></div><div class="edit-v-photo-wrap"><label>Fotografías</label><label class="edit-v-photo-button">📷 Agregar fotos<input class="edit-v-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><small class="edit-v-photo-count">Ninguna foto seleccionada</small></div></div></div>';
}
function openModelEditor(modelId,addColor=false){
  const product=(allProducts||[]).find(p=>Number(p.id)===Number(modelId));if(!product)return;
  const suppliers=[...document.querySelectorAll("#uploadProveedor option")].filter(o=>o.value).map(o=>({id:Number(o.value),nombre:o.textContent.trim()}));
  const supplierOptions=(selected)=>'<option value="">Sin proveedor</option>'+suppliers.map(s=>'<option value="'+Number(s.id)+'" '+(Number(selected)===Number(s.id)?'selected':'')+'>'+escapeHtml(s.nombre)+'</option>').join('');
  const categories=["Bota","Botín","Zapatilla","Mocasín","Huarache","Sandalia","Escolar"];
  document.querySelector("#editModelModal .catalog-action-head h2").textContent="Agregar o editar modelo";
  document.getElementById("editModelBody").innerHTML=
    '<div class="model-edit-grid"><div><label>Modelo</label><input id="editModelName" value="'+escapeAttribute(product.modelo)+'"></div><div><label>Categoría</label><select id="editModelCategory">'+categories.map(c=>'<option '+(normalizeText(c)===normalizeText(product.categoria)?'selected':'')+'>'+c+'</option>').join('')+'</select></div></div>'+
    '<div class="variant-edit-list">'+(product.variantes||[]).map(v=>'<div class="variant-edit-card" data-variant-id="'+Number(v.id)+'"><div class="variant-edit-title">'+escapeHtml(formatColor(v.color))+'</div><div class="variant-edit-fields"><div><label>Color</label><input class="edit-v-color" value="'+escapeAttribute(v.color)+'"></div><div><label>Precio compra</label><input class="edit-v-buy" type="number" min="0" step=".01" value="'+Number(v.precio_compra||0)+'"></div><div><label>Precio venta</label><input class="edit-v-sale" type="number" min="0" step=".01" value="'+Number(v.precio_venta||0)+'"></div><div><label>Proveedor</label><select class="edit-v-supplier">'+supplierOptions(v.proveedor_id)+'</select></div></div></div>').join('')+'</div>'+
    '<button class="model-edit-add-color" id="addColorInModelEditor" type="button">+ Agregar color</button>'+
    '<button class="model-edit-save" id="saveFullModelEdit" type="button">Guardar cambios</button>';
  document.getElementById("editModelModal").classList.add("show");
  document.getElementById("addColorInModelEditor").onclick=()=>{
    const list=document.querySelector("#editModelBody .variant-edit-list");
    const temp=document.createElement("div");temp.innerHTML=newVariantEditCard(product);
    const card=temp.firstElementChild;
    if(!card.querySelector(".edit-v-color").options.length||card.querySelector(".edit-v-color").options.length===1){alert("No hay más colores disponibles en las etiquetas configuradas.");return}
    list.appendChild(card);
    const photoInput=card.querySelector(".edit-v-photos"),photoCount=card.querySelector(".edit-v-photo-count");
    photoInput.onchange=()=>{const n=(photoInput.files||[]).length;photoCount.textContent=n?(n===1?"1 foto seleccionada":n+" fotos seleccionadas"):"Ninguna foto seleccionada"};
    card.scrollIntoView({behavior:"smooth",block:"center"});
  };
  document.getElementById("saveFullModelEdit").onclick=()=>saveFullModelEdit(product);
  if(addColor)document.getElementById("addColorInModelEditor").click();
}
async function saveFullModelEdit(product){
  const btn=document.getElementById("saveFullModelEdit");
  const cards=[...document.querySelectorAll("#editModelBody .variant-edit-card")];
  const variants=cards.filter(c=>!c.dataset.newVariant).map(card=>({
    id:Number(card.dataset.variantId),
    color:card.querySelector(".edit-v-color").value.trim(),
    precio_compra:Number(card.querySelector(".edit-v-buy").value),
    precio_venta:Number(card.querySelector(".edit-v-sale").value),
    proveedor_id:Number(card.querySelector(".edit-v-supplier").value||0)
  }));
  const newCards=cards.filter(c=>c.dataset.newVariant);
  const newVariants=newCards.map(card=>({
    card,
    color:card.querySelector(".edit-v-color").value.trim(),
    precio_compra:Number(card.querySelector(".edit-v-buy").value),
    precio_venta:Number(card.querySelector(".edit-v-sale").value),
    proveedor_id:Number(card.querySelector(".edit-v-supplier").value||0),
    existencia:Number(card.querySelector(".edit-v-stock").value||0),
    files:[...(card.querySelector(".edit-v-photos").files||[])]
  }));
  if([...variants,...newVariants].some(v=>!v.color||v.precio_compra<0||v.precio_venta<0)){alert("Revisa color y precios.");return}
  if(newVariants.some(v=>!Number.isInteger(v.existencia)||v.existencia<0||v.existencia%6!==0)){alert("Los pares del nuevo color deben ser 0 o múltiplos de 6.");return}
  if(newVariants.some(v=>!v.files.length)){alert("Agrega al menos una fotografía para cada color nuevo.");return}

  btn.disabled=true;btn.textContent="Guardando...";
  try{
    const basePayload={action:"update-full-model",modelId:Number(product.id),modelo:document.getElementById("editModelName").value.trim(),categoria:document.getElementById("editModelCategory").value,variantes};
    const baseResponse=await fetch("/.netlify/functions/admin-manage",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify(basePayload)});
    const baseResult=await readJson(baseResponse);
    if(!baseResponse.ok||!baseResult.success)throw new Error(baseResult.error||"No se pudo actualizar el modelo.");

    for(let index=0;index<newVariants.length;index++){
      const v=newVariants[index];
      btn.textContent="Guardando color "+(index+1)+" de "+newVariants.length+"...";
      const imagenes=[];
      for(const file of v.files)imagenes.push(await fileToBase64(file));
      const response=await fetch("/.netlify/functions/admin-manage",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"add-variant",modelId:Number(product.id),color:v.color,existencia:v.existencia,precio_compra:v.precio_compra,precio_venta:v.precio_venta,proveedor_id:v.proveedor_id||null,imagenes})});
      const result=await readJson(response);
      if(!response.ok||!result.success)throw new Error(result.error||("No se pudo guardar "+v.color+"."));
    }
    document.getElementById("editModelModal").classList.remove("show");
    await loadModels();
    showOperation("✓ Modelo y colores guardados");
    setTimeout(hideOperation,1200);
  }catch(error){
    alert(error.message||"No se pudieron guardar los cambios.");
    btn.disabled=false;btn.textContent="Guardar cambios";
  }
}

/* CLICS CATÁLOGO */

models.onclick=async function(event){
  const editModel=event.target.closest(".inventory-edit-model");
  if(editModel){
    const card=editModel.closest(".inventory-model-card");
    openModelEditor(Number(card.dataset.modelId));
    return;
  }
  const add=event.target.closest(".inventory-add-color");
  if(add){
    const card=add.closest(".inventory-model-card");
    openModelEditor(Number(card.dataset.modelId),true);
    return;
  }
  const editColor=event.target.closest(".inventory-color");
  if(editColor){
    const row=editColor.closest(".inventory-row");
    const oldColor=editColor.textContent.trim();
    const newColor=prompt("Editar color:",oldColor);
    if(newColor!==null&&newColor.trim()&&normalizeText(newColor)!==normalizeText(oldColor)){
      await manage({action:"rename-variant",variantId:Number(row.dataset.variantId),newColor:newColor.trim()});
    }
    return;
  }
  const save=event.target.closest(".inventory-save-model");
  if(!save)return;
  const card=save.closest(".inventory-model-card");
  const rows=[...card.querySelectorAll(".inventory-row[data-variant-id]")];
  const updates=[];
  for(const row of rows){
    const input=row.querySelector(".inventory-stock");
    const existencia=Number(input.value);
    if(!Number.isInteger(existencia)||existencia<0||existencia%6!==0){
      alert("Todas las existencias deben ser 0 o múltiplos de 6 pares.");
      input.focus();
      return;
    }
    updates.push({variantId:Number(row.dataset.variantId),existencia});
  }
  save.disabled=true;
  save.textContent="Guardando existencias...";
  try{
    for(const update of updates){
      const ok=await manage({action:"update-stock",variantId:update.variantId,existencia:update.existencia},{reload:false});
      if(!ok)throw new Error("No se pudo actualizar una de las existencias.");
    }
    await loadModels();
  }catch(error){
    alert(error.message||"No se pudieron guardar las existencias.");
    save.disabled=false;
    save.textContent="Guardar existencias";
  }
};

/* AGREGAR FOTOS / COLOR */

function prepareExistingUpload(
  modelName,
  colorName,
  categoryName,
  openPhotos
){
  modelo.value=modelName;
  categoria.value=categoryName||"";

  colorBlocks.innerHTML="";

  const block=
    createColorBlock(
      colorName
    );

  uploadSection.scrollIntoView({
    behavior:"smooth",
    block:"start"
  });

  setTimeout(function(){

    if(!categoryName){
      categoria.focus();
      return;
    }

    if(openPhotos){
      block
        .querySelector(".color-files")
        .click();
    }else{
      block
        .querySelector(".color-input")
        .focus();
    }

  },400);
}

/* PEDIDOS */

async function loadOrders(){
  orders.innerHTML=
    '<div class="loading">Cargando registro...</div>';

  try{
    const response=
      await fetch(
        "/.netlify/functions/admin-pedidos?t="+Date.now(),
        {
          method:"GET",
          headers:{
            "x-admin-password":
              adminPassword
          },
          cache:"no-store"
        }
      );

    const result=
      await readJson(response);

    if(
      !response.ok ||
      !result.success
    ){
      throw new Error(
        result.error ||
        "No se pudo cargar el registro."
      );
    }

    allOrders=Array.isArray(result.pedidos)?result.pedidos:[];
    deletedOrders=Array.isArray(result.eliminados)?result.eliminados:[];

    ordersLoaded=true;

    renderOrders();
    renderSentOrders();
    renderDeletedOrders();

  }catch(error){
    orders.innerHTML=
      '<div class="empty">'+
      escapeHtml(error.message)+
      "</div>";
  }
}

function getFilteredOrders(){
  const query=
    normalizeText(
      orderSearch.value
    );

  if(!query){
    return allOrders;
  }

  return allOrders.filter(
    function(order){

      if(
        normalizeText(
          order.cliente
        ).includes(query)
      ){
        return true;
      }

      if(
        normalizeText(
          order.folio
        ).includes(query)
      ){
        return true;
      }

      const details=
        Array.isArray(
          order.pedido_detalles
        )
          ?order.pedido_detalles
          :[];

      return details.some(
        function(item){
          return (
            normalizeText(
              item.modelo
            ).includes(query) ||
            normalizeText(
              item.color
            ).includes(query) ||
            normalizeText(
              formatColor(
                item.color
              )
            ).includes(query)
          );
        }
      );
    }
  );
}

function money(value){
  return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(value||0));
}

function renderOrders(){
  const visibleOrders=getFilteredOrders();
  const totalPairs=allOrders.reduce((sum,order)=>sum+Number(order.total_pares||0),0);
  document.getElementById("recordCount").textContent=allOrders.length;
  document.getElementById("recordPairs").textContent=totalPairs;

  if(!visibleOrders.length){
    orders.innerHTML='<div class="empty">'+(allOrders.length?"No encontramos pedidos con esa búsqueda.":"Todavía no hay pedidos registrados.")+"</div>";
    return;
  }

  orders.innerHTML=visibleOrders.map(function(order){
    const details=Array.isArray(order.pedido_detalles)?order.pedido_detalles:[];
    const lines=details.length?details.map(function(item){
      return `<div class="order-line"><div class="order-qty">${Number(item.cantidad)}</div><div class="order-product">Modelo ${escapeHtml(item.modelo)} <span>${escapeHtml(formatColor(item.color))}</span></div></div>`;
    }).join(""):'<div class="order-line">Sin productos registrados</div>';

    return `<article class="order-card">
      <div class="order-top">
        <div>
          <div class="order-folio">${escapeHtml(order.folio)}</div>
          <div class="order-client">${escapeHtml(order.nota_cliente||order.cliente)}</div>
          <div class="order-date">${escapeHtml(order.nota_fecha||formatDate(order.creado_en))}</div>
          ${order.nota_guardada?'<div class="note-badge">NOTA GUARDADA · '+escapeHtml(money(order.nota_total))+'</div>':""}
          ${String(order.estado||"")==="Enviado"?'<div class="note-badge order-complete-badge">✓ PEDIDO COMPLETADO</div><div class="note-badge order-complete-badge">GANANCIA · '+escapeHtml(money(order.ganancia_pedido||0))+'</div>':""}
        </div>
        <div class="order-total"><strong>${Number(order.total_pares||0)}</strong><span>PARES</span></div>
      </div>
      <div class="order-items">${lines}</div>
      <div class="order-actions">
        <button type="button" class="continue-order" data-id="${Number(order.id)}">${order.nota_guardada?"Abrir nota":"Continuar con el pedido"}</button>
        <button type="button" class="delete-order" data-id="${Number(order.id)}" data-folio="${escapeAttribute(order.folio)}" data-client="${escapeAttribute(order.cliente)}">🗑 Eliminar registro</button>
      </div>
    </article>`;
  }).join("");
}

function renderSentOrders(){
 if(!sentOrders)return;
 const q=normalizeText(sentOrderSearch?.value||"");
 const rows=allOrders.filter(o=>String(o.estado||"")==="Enviado").filter(o=>!q||normalizeText(o.nota_cliente||o.cliente).includes(q)||normalizeText(o.folio).includes(q)||normalizeText(o.nota_fecha||formatDate(o.creado_en)).includes(q));
 if(!rows.length){sentOrders.innerHTML='<div class="empty">Todavía no hay pedidos enviados'+(q?" con esa búsqueda":"")+'.</div>';return}
 sentOrders.innerHTML=rows.map(o=>{
   const details=Array.isArray(o.pedido_detalles)?o.pedido_detalles:[];
   const lines=details.map(x=>'<div class="order-line" style="grid-template-columns:60px 1fr auto"><div class="order-qty">'+Number(x.cantidad||0)+'</div><div class="order-product">Modelo '+escapeHtml(x.modelo)+' <span>'+escapeHtml(formatColor(x.color))+'</span></div><strong>'+money(Number(x.precio_unitario||0))+'</strong></div>').join("");
   return '<details class="order-card" style="margin-bottom:12px"><summary class="order-top" style="cursor:pointer;list-style:none"><div><div class="order-client">'+escapeHtml(o.nota_cliente||o.cliente)+'</div><div class="order-date">'+escapeHtml(o.fecha_envio||o.nota_fecha||formatDate(o.creado_en))+' · Folio '+escapeHtml(o.folio)+'</div><div class="note-badge">'+escapeHtml(money(o.nota_total))+'</div></div><div class="order-total"><strong>'+Number(o.total_pares||0)+'</strong><span>PARES</span></div></summary><div class="order-items">'+(lines||'<div class="order-line">Sin productos</div>')+'</div></details>';
 }).join("");
}
function renderDeletedOrders(){
 const body=document.getElementById("deletedOrdersBody"); if(!body)return;
 const count=document.getElementById("deletedRecordsCount");
 if(count)count.textContent=deletedOrders.length+" "+(deletedOrders.length===1?"registro":"registros");
 if(!deletedOrders.length){body.innerHTML='<div class="deleted-empty">Sin registros eliminados.</div>';return}
 body.innerHTML=deletedOrders.map(x=>{
   const client=escapeHtml(x.cliente||"Sin cliente");
   const folio=escapeHtml(x.folio||"—");
   const original=escapeHtml(x.fecha_original||"—");
   const removed=escapeHtml(formatDate(x.fecha_eliminado));
   const pairs=Number(x.total_pares||0);
   const total=escapeHtml(money(x.total||0));
   const profit=escapeHtml(money(x.ganancia||0));
   const state=escapeHtml(x.estado||"Eliminado");
   return '<article class="deleted-record"><div class="deleted-record-main"><div class="deleted-record-person"><strong>'+client+'</strong><small>Folio '+folio+'</small></div><div class="deleted-record-values"><div class="deleted-metric"><span>Pares</span><strong>'+pairs+'</strong></div><div class="deleted-metric"><span>Total</span><strong>'+total+'</strong></div><div class="deleted-metric"><span>Ganancia</span><strong>'+profit+'</strong></div><span class="deleted-status">'+state+'</span></div></div><div class="deleted-record-meta"><span>Registro: <b>'+original+'</b></span><span>Eliminado: <b>'+removed+'</b></span></div></article>';
 }).join("");
}

function localDateInput(value){
  if(value&&/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d=value?new Date(value):new Date();
  if(Number.isNaN(d.getTime())) return "";
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function extraRow(data={}){
  const qty=Number(data.cantidad||1);
  const concept=String(data.concepto||"");
  const price=data.precio_unitario==null?"":Number(data.precio_unitario);
  return `<div class="extra-row">
    <input class="extra-qty" type="number" min="1" step="1" inputmode="numeric" value="${qty}">
    <input class="extra-concept" type="text" value="${escapeAttribute(concept)}" placeholder="Concepto">
    <input class="extra-price" type="number" min="0" step="0.01" inputmode="decimal" value="${price}" placeholder="$0">
    <div class="extra-amount">$0.00</div>
    <button class="extra-remove" type="button">×</button>
  </div>`;
}

function openNote(order){
  activeNoteOrder=order;
  noteFolio.textContent=order.folio||"";
  noteClient.value=order.nota_cliente||order.cliente||"";
  noteDate.value=localDateInput(order.nota_fecha||order.creado_en);
  const details=Array.isArray(order.pedido_detalles)?order.pedido_detalles:[];
  noteLines.innerHTML='<div class="note-row head"><div>Cantidad</div><div>Producto</div><div>Precio</div><div>Importe</div><div></div></div>'+
    details.map(function(item){
      const price=item.precio_unitario==null?"":Number(item.precio_unitario);
      return `<div class="note-row" data-detail-id="${Number(item.id)}">
        <div><input class="note-qty" type="number" min="1" step="1" inputmode="numeric" value="${Number(item.cantidad)}"></div>
        <div><strong>${escapeHtml(item.modelo)} ${escapeHtml(formatColor(item.color))}</strong></div>
        <div><input class="note-price" type="number" min="0" step="0.01" inputmode="decimal" value="${price}" placeholder="$0"></div>
        <div class="note-amount">$0.00</div><button class="note-remove" type="button" title="Eliminar línea" aria-label="Eliminar línea">×</button>
      </div>`;
    }).join("");
  const extras=Array.isArray(order.nota_extras)?order.nota_extras:[];
  extraLines.innerHTML=extras.map(extraRow).join("");
  calculateNote();
  const sentBtn=document.getElementById("markOrderSent");
  if(sentBtn){const sent=String(order.estado||"")==="Enviado";sentBtn.disabled=sent;sentBtn.textContent=sent?"✓ Pedido enviado":"Pedido enviado";}
  noteModal.classList.add("open");
  noteModal.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
}

function closeNote(){noteModal.classList.remove("open");noteModal.setAttribute("aria-hidden","true");document.body.style.overflow="";activeNoteOrder=null}

function calculateNote(){
  let total=0;
  noteLines.querySelectorAll(".note-row[data-detail-id]").forEach(function(row){
    const qty=Number(row.querySelector(".note-qty").value||0);
    const price=Number(row.querySelector(".note-price").value||0);
    const amount=qty*price; total+=amount; row.querySelector(".note-amount").textContent=money(amount);
  });
  extraLines.querySelectorAll(".extra-row").forEach(function(row){
    const qty=Number(row.querySelector(".extra-qty").value||0);
    const price=Number(row.querySelector(".extra-price").value||0);
    const amount=qty*price; total+=amount; row.querySelector(".extra-amount").textContent=money(amount);
  });
  noteTotal.textContent=money(total); return total;
}

function notePayload(){
  return Array.from(noteLines.querySelectorAll(".note-row[data-detail-id]")).map(function(row){
    return {id:Number(row.dataset.detailId),cantidad:Number(row.querySelector(".note-qty").value||0),precio_unitario:Number(row.querySelector(".note-price").value||0)};
  });
}
function extrasPayload(){
  return Array.from(extraLines.querySelectorAll(".extra-row")).map(function(row){
    return {cantidad:Number(row.querySelector(".extra-qty").value||0),concepto:row.querySelector(".extra-concept").value.trim(),precio_unitario:Number(row.querySelector(".extra-price").value||0)};
  }).filter(x=>x.concepto);
}

async function saveActiveNote(){
  if(!activeNoteOrder)return false;
  if(!noteClient.value.trim()){alert("Escribe el nombre del cliente.");noteClient.focus();return false}
  if(!noteDate.value){alert("Selecciona la fecha.");return false}
  saveNote.disabled=true;saveNote.textContent="Guardando...";
  try{
    const response=await fetch("/.netlify/functions/admin-pedidos",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"save-note",pedido_id:Number(activeNoteOrder.id),cliente:noteClient.value.trim(),fecha:noteDate.value,items:notePayload(),extras:extrasPayload()})});
    const result=await readJson(response);
    if(!response.ok||!result.success)throw new Error(result.error||"No se pudo guardar la nota.");
    const index=allOrders.findIndex(o=>Number(o.id)===Number(result.pedido.id));
    if(index>=0)allOrders[index]=result.pedido;
    activeNoteOrder=result.pedido;renderOrders();showOperation("✓ Nota guardada");setTimeout(hideOperation,1500);return true;
  }catch(error){alert(error.message);return false}
  finally{saveNote.disabled=false;saveNote.textContent="Guardar nota"}
}

function buildReceipt(){
  document.getElementById("receiptClient").textContent=noteClient.value.trim();
  document.getElementById("receiptDate").textContent=noteDate.value;
  document.getElementById("receiptFolio").textContent=activeNoteOrder?.folio||"";
  const details=Array.isArray(activeNoteOrder?.pedido_detalles)?activeNoteOrder.pedido_detalles:[];
  let html="";
  Array.from(noteLines.querySelectorAll(".note-row[data-detail-id]")).forEach(function(row,i){
    const item=details.find(d=>Number(d.id)===Number(row.dataset.detailId))||details[i]||{};
    const qty=Number(row.querySelector(".note-qty").value||0);
    const price=Number(row.querySelector(".note-price").value||0);
    html+=`<tr><td>${qty}</td><td>${escapeHtml(String(item.modelo||"")+" "+formatColor(item.color||""))}</td><td>${escapeHtml(money(price))}</td></tr>`;
  });
  extrasPayload().forEach(function(x){html+=`<tr><td>${x.cantidad}</td><td>${escapeHtml(x.concepto)}</td><td>${escapeHtml(money(x.precio_unitario))}</td></tr>`});
  document.getElementById("receiptItems").innerHTML=html;
  document.getElementById("receiptTotal").textContent=money(calculateNote());
}

async function receiptBlob(){
  buildReceipt();

  const details=Array.isArray(activeNoteOrder?.pedido_detalles)?activeNoteOrder.pedido_detalles:[];
  const productRows=Array.from(noteLines.querySelectorAll(".note-row[data-detail-id]")).map(function(row,i){
    const item=details.find(d=>Number(d.id)===Number(row.dataset.detailId))||details[i]||{};
    return {
      cantidad:Number(row.querySelector(".note-qty").value||0),
      producto:(String(item.modelo||"")+" "+formatColor(item.color||"")).trim(),
      precio:Number(row.querySelector(".note-price").value||0)
    };
  });
  const extraRows=extrasPayload().map(x=>({cantidad:x.cantidad,producto:x.concepto,precio:x.precio_unitario}));
  const rows=productRows.concat(extraRows);

  const w=760;
  const rowH=48;
  const h=Math.max(820,455+(rows.length*rowH));
  const scale=2;
  const canvas=document.createElement("canvas");
  canvas.width=w*scale;
  canvas.height=h*scale;
  const ctx=canvas.getContext("2d");
  ctx.scale(scale,scale);

  const pink="#ead2dc";
  const softPink="#fbf4f7";
  const dark="#1d1d1f";
  const muted="#777277";
  const line="#e8e0e3";

  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,w,h);

  // Encabezado CAROLA
  ctx.fillStyle=softPink;
  ctx.fillRect(0,0,w,132);
  ctx.fillStyle=pink;
  ctx.beginPath();
  ctx.arc(72,66,35,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle=dark;
  ctx.font="800 28px Arial";
  ctx.textAlign="left";
  ctx.fillText("CAROLA",126,59);
  ctx.font="15px Arial";
  ctx.fillStyle=muted;
  ctx.fillText("Calzado Carola",126,84);
  ctx.font="15px Arial";
  ctx.fillStyle=dark;
  ctx.fillText("☎ 477 597 1996",126,107);

  ctx.fillStyle="#b8899d";
  ctx.font="700 13px Arial";
  ctx.textAlign="right";
  ctx.fillText("NOTA DE PEDIDO",710,62);
  ctx.font="600 12px Arial";
  ctx.fillStyle=muted;
  ctx.fillText(activeNoteOrder?.folio||"",710,84);

  // Datos
  let y=174;
  const meta=function(label,value){
    ctx.textAlign="left";
    ctx.font="15px Arial";
    ctx.fillStyle=muted;
    ctx.fillText(label,50,y);
    ctx.textAlign="right";
    ctx.font="700 15px Arial";
    ctx.fillStyle=dark;
    ctx.fillText(String(value||""),710,y);
    y+=34;
  };
  meta("Cliente",noteClient.value.trim());
  meta("Fecha",noteDate.value);
  meta("Folio",activeNoteOrder?.folio||"");

  y+=8;
  ctx.strokeStyle=line;
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(50,y);ctx.lineTo(710,y);ctx.stroke();
  y+=34;

  // Encabezado de productos: cantidad primero, producto, precio, valor
  ctx.fillStyle=softPink;
  ctx.fillRect(42,y-24,676,42);
  ctx.fillStyle=dark;
  ctx.font="700 13px Arial";
  ctx.textAlign="left";
  ctx.fillText("CANTIDAD",55,y+2);
  ctx.fillText("PRODUCTO",160,y+2);
  ctx.textAlign="right";
  ctx.fillText("PRECIO UNITARIO",555,y+2);
  ctx.fillText("VALOR",705,y+2);
  y+=42;

  rows.forEach(function(row){
    const valor=Number(row.cantidad)*Number(row.precio);
    ctx.fillStyle=dark;
    ctx.font="15px Arial";
    ctx.textAlign="left";
    ctx.fillText(String(row.cantidad),60,y);
    ctx.fillText(String(row.producto),160,y);
    ctx.textAlign="right";
    ctx.fillText(money(row.precio),555,y);
    ctx.fillText(money(valor),705,y);
    ctx.strokeStyle=line;
    ctx.beginPath();ctx.moveTo(50,y+17);ctx.lineTo(710,y+17);ctx.stroke();
    y+=rowH;
  });

  // Total
  y+=25;
  ctx.fillStyle=softPink;
  ctx.fillRect(42,y-25,676,74);
  ctx.fillStyle=dark;
  ctx.font="800 28px Arial";
  ctx.textAlign="left";
  ctx.fillText("Total:",58,y+18);
  ctx.textAlign="right";
  ctx.fillText(money(calculateNote()),702,y+18);

  // Pie
  ctx.fillStyle=muted;
  ctx.font="12px Arial";
  ctx.textAlign="center";
  ctx.fillText("Gracias por tu pedido · CAROLA",w/2,h-38);

  return new Promise(resolve=>canvas.toBlob(resolve,"image/png",1));
}
orders.onclick=async function(event){
  const continueButton=event.target.closest(".continue-order");
  if(continueButton){
    const order=allOrders.find(o=>Number(o.id)===Number(continueButton.dataset.id));
    if(order)openNote(order);
    return;
  }
  const deleteButton=event.target.closest(".delete-order");
  if(!deleteButton)return;
  const pedidoId=Number(deleteButton.dataset.id);
  const folio=deleteButton.dataset.folio||"";
  const client=deleteButton.dataset.client||"";
  if(!Number.isInteger(pedidoId)||pedidoId<=0){alert("Pedido inválido.");return}
  if(!confirm("¿Eliminar este registro?\n\nCliente: "+client+"\nFolio: "+folio+"\n\nSi fue enviado, se revertirán CLIENTES, FINANZAS e INVENTARIO. El registro quedará guardado en Registros eliminados."))return;
  deleteButton.disabled=true;deleteButton.textContent="Eliminando...";
  showOperation("Eliminando y revirtiendo registro...");
  try{
    const response=await fetch("/.netlify/functions/admin-pedidos",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"delete-order",pedido_id:pedidoId})});
    const result=await readJson(response);
    if(!response.ok||!result.success)throw new Error(result.error||"No se pudo eliminar el registro.");
    await Promise.all([loadOrders(),loadModels(),loadClients(),loadFinance()]);
    renderOrders();renderSentOrders();renderDeletedOrders();
    operationStatus.textContent="✓ Registro eliminado y movimientos revertidos";
    setTimeout(hideOperation,1800);
  }catch(error){
    deleteButton.disabled=false;deleteButton.textContent="🗑 Eliminar registro";
    operationStatus.textContent="Error: "+error.message;
    setTimeout(hideOperation,4000);
  }
};

noteLines.addEventListener("input",calculateNote);
noteLines.addEventListener("click",function(e){const b=e.target.closest(".note-remove");if(!b)return;if(!confirm("¿Eliminar este modelo de la nota?"))return;b.closest(".note-row[data-detail-id]").remove();calculateNote()});
extraLines.addEventListener("input",calculateNote);
extraLines.addEventListener("click",function(e){const b=e.target.closest(".extra-remove");if(b){b.closest(".extra-row").remove();calculateNote()}});
addExtra.onclick=function(){extraLines.insertAdjacentHTML("beforeend",extraRow({cantidad:1,concepto:"",precio_unitario:""}))};
document.getElementById("addShippingBox").onclick=function(){extraLines.insertAdjacentHTML("beforeend",extraRow({cantidad:1,concepto:"Caja de embarque",precio_unitario:45}))};
noteClose.onclick=closeNote;
noteModal.onclick=function(event){if(event.target===noteModal)closeNote()};
async function ensureOrderClient(order){
  if(!clientsLoaded)await loadClients();
  const name=(noteClient.value.trim()||order.nota_cliente||order.cliente||"").trim();
  const norm=v=>normalizeText(String(v||""));
  const directory=(window.catalogClients||[]).find(x=>norm(x.nombre)===norm(name));
  const debtClient=(clients||[]).find(x=>norm(x.nombre)===norm(name));
  let dir=directory;
  if(!dir){
    const phone=prompt("Este cliente no está en tu agenda.\n\nCliente: "+name+"\n\nIngresa su número de teléfono para agregarlo:");
    if(phone===null)throw new Error("Primero agrega al cliente para marcar el pedido como enviado.");
    if(!phone.trim())throw new Error("El número de teléfono es obligatorio para agregar al cliente.");
    const created=await clientCall({action:"add-directory-client",nombre:name,telefono:phone.trim()});
    dir=created.cliente;
  }
  let debt=debtClient;
  if(!debt){
    const createdDebt=await clientCall({action:"add-provider",nombre:name});
    debt=createdDebt.cliente;
  }
  await loadClients();
  return {directory:dir,debtClient:debt};
}

function closeSentPaymentModal(){document.getElementById("sentPaymentModal").classList.remove("show")}
function markActiveOrderSent(){
  if(!activeNoteOrder||String(activeNoteOrder.estado||"")==="Enviado")return;
  document.getElementById("sentPaymentModal").classList.add("show");
}
async function processSentOrder(paymentMethod){
  closeSentPaymentModal();
  if(!activeNoteOrder)return;
  const btn=document.getElementById("markOrderSent");
  btn.disabled=true;btn.textContent="Procesando...";
  try{
    const saved=await saveActiveNote();
    if(!saved)throw new Error("Primero guarda correctamente la nota.");
    const clientInfo=await ensureOrderClient(activeNoteOrder);
    const name=(noteClient.value.trim()||activeNoteOrder.nota_cliente||activeNoteOrder.cliente||"").trim();
    const debt=clientInfo.debtClient||(clients||[]).find(x=>normalizeText(x.nombre)===normalizeText(name));
    if(!debt)throw new Error("No se pudo crear el saldo del cliente.");
    const response=await fetch("/.netlify/functions/admin-pedidos",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({
      action:"mark-sent",pedido_id:Number(activeNoteOrder.id),forma_pago:paymentMethod,cliente_id:Number(debt.id)
    })});
    const result=await readJson(response);
    if(!response.ok||!result.success)throw new Error(result.error||"No se pudo enviar el pedido.");
    const index=allOrders.findIndex(o=>Number(o.id)===Number(result.pedido.id));
    if(index>=0)allOrders[index]=result.pedido;activeNoteOrder=result.pedido;
    await Promise.all([loadModels(),loadClients(),loadFinance()]);
    renderOrders();renderSentOrders();
    btn.textContent="✓ Pedido enviado";showOperation("✓ Pedido enviado · "+paymentMethod);setTimeout(hideOperation,2200);
  }catch(error){alert(error.message);btn.disabled=false;btn.textContent="Pedido enviado"}
}
document.querySelectorAll(".sent-pay-option").forEach(b=>b.onclick=()=>processSentOrder(b.dataset.method));

saveNote.onclick=saveActiveNote;
document.getElementById("markOrderSent").onclick=markActiveOrderSent;
printNote.onclick=function(){buildReceipt();window.print()};
shareNote.onclick=async function(){
  try{
    const blob=await receiptBlob();
    const file=new File([blob],"Nota-Carola-"+(activeNoteOrder?.folio||"pedido")+".png",{type:"image/png"});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:"Nota CAROLA"})}
    else{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  }catch(error){if(error.name!=="AbortError")alert("No se pudo compartir la imagen.")}
};

orderSearch.oninput=renderOrders;
if(sentOrderSearch)sentOrderSearch.oninput=renderSentOrders;




/* IMPORTAR EXCEL DE VENTAS */
function excelSerialToYmd(serial){
  const d=new Date(Date.UTC(1899,11,30)+Math.floor(Number(serial))*86400000);
  return d.toISOString().slice(0,10);
}
function normalizeHeader(v){return String(v||"").trim().toLowerCase().replaceAll(".","")}
function parseSalesSheet(rows){
  const headerIndex=rows.findIndex(r=>Array.isArray(r)&&r.some(v=>normalizeHeader(v)==="contacto")&&r.some(v=>normalizeHeader(v)==="producto"));
  if(headerIndex<0) throw new Error("No encontré la tabla de productos en Hoja2.");
  const headers=rows[headerIndex].map(normalizeHeader);
  const col=name=>headers.indexOf(name);
  const ix={fecha:col("fecha"),tipo:col("tipo"),vendedor:col("vendedor"),contacto:col("contacto"),producto:col("producto"),cant:col("cant")};
  if(Object.values(ix).some(v=>v<0)) throw new Error("Hoja2 no tiene todas las columnas necesarias.");
  const byDate={}; let ignored=0;
  rows.slice(headerIndex+1).forEach(r=>{
    if(!r||String(r[ix.tipo]||"").trim().toLowerCase()!=="venta")return;
    if(String(r[ix.vendedor]||"").trim().toLowerCase()!=="carola")return;
    const product=String(r[ix.producto]||"").trim(),client=String(r[ix.contacto]||"").trim()||"Sin contacto";
    const qty=Number(r[ix.cant]||0);
    if(!product||product.toLowerCase().includes("caja")){ignored++;return}
    const validQty=Math.floor(qty/6)*6;
    if(validQty<6){ignored++;return}
    const date=typeof r[ix.fecha]==="number"?excelSerialToYmd(r[ix.fecha]):String(r[ix.fecha]||"").slice(0,10);
    if(!byDate[date])byDate[date]={fecha:date,pares:0,clientes:{}};
    byDate[date].pares+=validQty;
    byDate[date].clientes[client]=(byDate[date].clientes[client]||0)+validQty;
  });
  const days=Object.values(byDate);
  if(!days.length)throw new Error("No encontré ventas válidas de Carola en Hoja2.");
  return {days,ignored};
}
function renderSalesPreview(data){
  const pairs=data.days.reduce((sum,d)=>sum+d.pares,0);
  const reportDates=data.days.map(d=>d.fecha).sort();
  const dateLabel=reportDates.length===1?formatFinanceDate(reportDates[0]):reportDates.map(formatFinanceDate).join(" · ");
  const clientRows=[];
  data.days.forEach(d=>Object.entries(d.clientes).forEach(([name,pares])=>clientRows.push({fecha:d.fecha,name,pares})));
  importPreview.innerHTML='<div style="margin:0 0 12px;padding:14px 16px;border-radius:14px;background:#171717;color:#fff;text-align:center"><div style="font-size:11px;font-weight:800;letter-spacing:.08em;opacity:.7">FECHA DEL REPORTE</div><div style="font-size:20px;font-weight:900;margin-top:4px">'+escapeHtml(dateLabel)+'</div></div><div class="import-kpis"><div class="summary-box"><strong>'+pairs+'</strong><span>PARES VÁLIDOS</span></div><div class="summary-box"><strong>'+Math.floor(pairs/6)+'</strong><span>MEDIAS DOCENAS</span></div><div class="summary-box"><strong>'+data.ignored+'</strong><span>LÍNEAS IGNORADAS</span></div></div><div style="overflow:auto"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pares válidos</th><th>Medias</th></tr></thead><tbody>'+clientRows.map(x=>'<tr><td>'+formatFinanceDate(x.fecha)+'</td><td>'+escapeHtml(x.name)+'</td><td>'+x.pares+'</td><td>'+Math.floor(x.pares/6)+'</td></tr>').join("")+'</tbody></table></div><div class="import-actions"><button id="importCancel" type="button">Cancelar</button><button id="importConfirm" type="button">Usar medias docenas</button></div>';
  document.getElementById("importCancel").onclick=()=>{pendingSalesImport=null;importPreview.innerHTML="";salesExcel.value="";document.getElementById("salesExcelName").textContent="Ningún archivo seleccionado"};
  document.getElementById("importConfirm").onclick=confirmSalesImport;
}
async function confirmSalesImport(){
  if(!pendingSalesImport)return;
  if(pendingSalesImport.days.length!==1){
    alert("Este archivo contiene más de una fecha. Importa un reporte por día para capturar la ganancia correctamente.");
    return;
  }
  const day=pendingSalesImport.days[0];
  financeDate.value=day.fecha;
  const reportParts=parseYmd(day.fecha);
  financeYear.value=String(reportParts.y);
  financeMonth.value=String(reportParts.m);
  updateWeekOptions();
  financeWeek.value="0";
  financeHalfDozens.value=Math.floor(day.pares/6);
  financeProfit.value="";
  financeProfit.focus();
  pendingSalesImport=null;
  importPreview.innerHTML='<div class="finance-empty">✓ Medias docenas cargadas en el registro del '+escapeHtml(formatFinanceDate(day.fecha))+'. Ahora escribe únicamente la ganancia del día y presiona Guardar registro.</div>';
}
async function processExcelFile(file){
  if(!file)throw new Error("No detecté un archivo.");
  const name=String(file.name||"").toLowerCase();
  if(!name.endsWith(".xlsx")&&!name.endsWith(".xls"))throw new Error("Pega un archivo de Excel .xlsx o .xls.");
  if(typeof XLSX==="undefined")throw new Error("No se pudo cargar el lector de Excel.");
  document.getElementById("salesExcelName").textContent=file.name||"Excel pegado";
  importPreview.innerHTML='<div class="finance-empty">Leyendo Hoja2...</div>';
  const buffer=await file.arrayBuffer(),book=XLSX.read(buffer,{type:"array"});
  if(!book.Sheets["Hoja2"])throw new Error("El archivo no contiene Hoja2.");
  const rows=XLSX.utils.sheet_to_json(book.Sheets["Hoja2"],{header:1,raw:true,defval:null});
  pendingSalesImport=parseSalesSheet(rows);
  renderSalesPreview(pendingSalesImport);
}
salesExcel.onchange=async function(){
  const file=this.files&&this.files[0];if(!file)return;
  try{await processExcelFile(file)}
  catch(e){pendingSalesImport=null;importPreview.innerHTML='<div class="finance-empty">'+escapeHtml(e.message)+'</div>'}
};


/* FINANZAS */
const MONTHS_ES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function financeLocalToday(){
  const d=new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}
function parseYmd(value){
  const [y,m,d]=String(value).split("-").map(Number);
  return {y,m,d};
}
function dateFromYmd(y,m,d){
  return new Date(Date.UTC(y,m-1,d));
}
function ymdFromDate(date){
  return {
    y:date.getUTCFullYear(),
    m:date.getUTCMonth()+1,
    d:date.getUTCDate()
  };
}
function dayOfYear(y,m,d){
  const start=Date.UTC(y,0,1);
  const current=Date.UTC(y,m-1,d);
  return Math.floor((current-start)/86400000)+1;
}
function weekInfo(value){
  const {y,m,d}=parseYmd(value);
  const doy=dayOfYear(y,m,d);
  const week=Math.floor((doy-1)/7)+1;
  const startDoy=(week-1)*7+1;
  const endDoy=Math.min(startDoy+6,365+(new Date(Date.UTC(y,1,29)).getUTCDate()===29?1:0));
  const startDate=new Date(Date.UTC(y,0,startDoy));
  const endDate=new Date(Date.UTC(y,0,endDoy));
  return {week,startDate,endDate};
}
function shortDateLabel(date){
  const p=ymdFromDate(date);
  return p.d+" "+MONTHS_ES[p.m-1].slice(0,3).toLowerCase();
}
function weekLabelByInfo(info){
  return "Semana "+info.week+" ("+shortDateLabel(info.startDate)+"–"+shortDateLabel(info.endDate)+")";
}
function weekLabelForDate(value){
  return weekLabelByInfo(weekInfo(value));
}
function formatFinanceDate(value){
  const {y,m,d}=parseYmd(value);
  return d+" "+MONTHS_ES[m-1].slice(0,3).toLowerCase()+" "+y;
}
function moneyShort(value){
  return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(Number(value||0));
}
function setupFinanceFilters(){
  const years=[...new Set(allFinance.map(x=>parseYmd(x.fecha).y))];
  const currentYear=new Date().getFullYear();
  if(!years.includes(currentYear)) years.push(currentYear);
  years.sort((a,b)=>b-a);
  const selectedYear=Number(financeYear.value)||currentYear;
  financeYear.innerHTML=years.map(y=>'<option value="'+y+'" '+(y===selectedYear?'selected':'')+'>'+y+'</option>').join("");
  const currentMonth=Number(financeMonth.value)||new Date().getMonth()+1;
  financeMonth.innerHTML='<option value="0">Todos los meses</option>'+MONTHS_ES.map((name,i)=>'<option value="'+(i+1)+'" '+((i+1)===currentMonth?'selected':'')+'>'+name+'</option>').join("");
  updateWeekOptions();
  setupRecordFilters();
}
function setupRecordFilters(){
  if(!recordMonth||!recordWeek)return;
  const currentMonth=String(new Date().getMonth()+1);
  /* En la primera carga, Registros abre en el mes actual. Después respeta cualquier filtro elegido por el usuario. */
  const initialized=recordMonth.dataset.initialized==="1";
  const priorMonth=initialized?(recordMonth.value||currentMonth):currentMonth;
  const priorWeek=initialized?(recordWeek.value||"0"):"0";
  recordMonth.innerHTML='<option value="0">Todos los meses</option>'+MONTHS_ES.map((name,i)=>'<option value="'+(i+1)+'">'+name+'</option>').join("");
  recordMonth.value=priorMonth;
  recordMonth.dataset.initialized="1";
  updateRecordWeekOptions(priorWeek);
}
function updateRecordWeekOptions(preferred){
  const year=Number(financeYear.value)||new Date().getFullYear(),month=Number(recordMonth.value)||0;
  const totalDays=365+(new Date(Date.UTC(year,1,29)).getUTCDate()===29?1:0),totalWeeks=Math.ceil(totalDays/7),opts=[];
  for(let week=1;week<=totalWeeks;week++){
    const startDoy=(week-1)*7+1,endDoy=Math.min(startDoy+6,totalDays);
    const startDate=new Date(Date.UTC(year,0,startDoy)),endDate=new Date(Date.UTC(year,0,endDoy));
    if(month&&startDate.getUTCMonth()+1!==month&&endDate.getUTCMonth()+1!==month)continue;
    opts.push('<option value="'+week+'">'+weekLabelByInfo({week,startDate,endDate})+'</option>');
  }
  recordWeek.innerHTML='<option value="0">Todas las semanas</option>'+opts.join("");
  if(preferred&&[...recordWeek.options].some(o=>o.value===String(preferred)))recordWeek.value=String(preferred);
}
function updateWeekOptions(){
  const year=Number(financeYear.value)||new Date().getFullYear();
  const month=Number(financeMonth.value);
  const prior=Number(financeWeek.value)||0;
  financeWeek.disabled=false;

  const totalDays=365+(new Date(Date.UTC(year,1,29)).getUTCDate()===29?1:0);
  const totalWeeks=Math.ceil(totalDays/7);
  const options=[];

  for(let week=1;week<=totalWeeks;week++){
    const startDoy=(week-1)*7+1;
    const endDoy=Math.min(startDoy+6,totalDays);
    const startDate=new Date(Date.UTC(year,0,startDoy));
    const endDate=new Date(Date.UTC(year,0,endDoy));

    if(month){
      const startMonth=startDate.getUTCMonth()+1;
      const endMonth=endDate.getUTCMonth()+1;
      if(startMonth!==month && endMonth!==month) continue;
    }

    const info={week,startDate,endDate};
    options.push('<option value="'+week+'" '+(prior===week?'selected':'')+'>'+weekLabelByInfo(info)+'</option>');
  }

  financeWeek.innerHTML='<option value="0">Todas las semanas</option>'+options.join("");
}
function filteredFinance(){
  const year=Number(financeYear.value);
  const month=Number(financeMonth.value);
  const week=Number(financeWeek.value);
  return allFinance.filter(r=>{
    const p=parseYmd(r.fecha);
    if(year&&p.y!==year) return false;
    if(month&&p.m!==month) return false;
    if(week&&weekInfo(r.fecha).week!==week) return false;
    return true;
  }).sort((a,b)=>a.fecha.localeCompare(b.fecha));
}
function recordPeriodRows(year,month,week,day){
  return allFinance.filter(r=>{
    const p=parseYmd(r.fecha);
    if(year&&p.y!==year)return false;
    if(month&&p.m!==month)return false;
    if(week&&weekInfo(r.fecha).week!==week)return false;
    if(day&&r.fecha!==day)return false;
    return true;
  });
}
function percentChange(current,previous){
  if(!previous)return current?null:0;
  return ((current-previous)/previous)*100;
}
function comparisonText(label,current,previous,money){
  const change=percentChange(current,previous);
  const val=money?moneyShort(current):Math.round(current).toLocaleString("es-MX");
  if(change===null)return '<strong>'+label+': '+val+'</strong> · sin base comparable el mes anterior';
  const sign=change>0?"+":"";
  return '<strong>'+label+': '+val+'</strong> · '+sign+change.toFixed(1)+'% vs mes anterior';
}
function financeStats(rows){const profit=rows.reduce((s,r)=>s+Number(r.ganancia||0),0),half=rows.reduce((s,r)=>s+Number(r.medias_docenas||0),0),pairs=half*6;return{profit,half,pairs,avg:pairs?profit/pairs:0}}
function monthKey(y,m){return y+"-"+String(m).padStart(2,"0")}
function monthRows(key){if(!key)return[];const [y,m]=key.split("-").map(Number);return allFinance.filter(r=>{const p=parseYmd(r.fecha);return p.y===y&&p.m===m})}
function monthNameKey(key){if(!key)return"";const [y,m]=key.split("-").map(Number);return MONTHS_ES[m-1]+" "+y}
function renderCustomCompare(){
  if(!compareMonthA.value||!compareMonthB.value){customMonthCompare.innerHTML="Selecciona dos meses.";return}
  const a=financeStats(monthRows(compareMonthA.value)),b=financeStats(monthRows(compareMonthB.value));
  const dp=b.profit-a.profit,dq=b.pairs-a.pairs,dh=b.half-a.half,dr=b.profit*.43-a.profit*.43,da=b.avg-a.avg;
  const pct=(x,y)=>y?((x-y)/y*100):null,pp=pct(b.profit,a.profit),pq=pct(b.pairs,a.pairs);
  const direction=(v,word)=>v===0?"igual":v>0?"más "+word:"menos "+word;
  const signedMoney=v=>(v>=0?"+":"-")+moneyShort(Math.abs(v));
  const signedNum=v=>(v>=0?"+":"")+v;
  const pctText=v=>v===null?"sin base de comparación":(v>=0?"+":"")+v.toFixed(1)+"%";
  customMonthCompare.innerHTML=
    '<div style="margin-top:14px;line-height:1.55">'+
      '<div style="padding:12px 0;border-bottom:1px solid #eadde2"><strong style="font-size:16px">'+monthNameKey(compareMonthA.value)+'</strong><br>'+
      '<span>Ganancia total: <b>'+moneyShort(a.profit)+'</b></span> · <span>43% apartado: <b>'+moneyShort(a.profit*.43)+'</b></span><br>'+
      '<span>Medias docenas: <b>'+a.half+'</b></span> · <span>Pares vendidos: <b>'+a.pairs+'</b></span> · <span>Ganancia promedio por par: <b>'+moneyShort(a.avg)+'</b></span></div>'+
      '<div style="padding:12px 0;border-bottom:1px solid #eadde2"><strong style="font-size:16px">'+monthNameKey(compareMonthB.value)+'</strong><br>'+
      '<span>Ganancia total: <b>'+moneyShort(b.profit)+'</b></span> · <span>43% apartado: <b>'+moneyShort(b.profit*.43)+'</b></span><br>'+
      '<span>Medias docenas: <b>'+b.half+'</b></span> · <span>Pares vendidos: <b>'+b.pairs+'</b></span> · <span>Ganancia promedio por par: <b>'+moneyShort(b.avg)+'</b></span></div>'+
      '<div style="padding-top:12px"><strong>¿Qué cambió de '+monthNameKey(compareMonthA.value)+' a '+monthNameKey(compareMonthB.value)+'?</strong><br>'+
      '<span>Ganancia: <b>'+signedMoney(dp)+'</b> ('+pctText(pp)+'). En '+monthNameKey(compareMonthB.value)+' hubo <b>'+direction(dp,"ganancia")+'</b> que en '+monthNameKey(compareMonthA.value)+'.</span><br>'+
      '<span>Ventas: <b>'+signedNum(dq)+' pares</b> ('+pctText(pq)+') y <b>'+signedNum(dh)+' medias docenas</b>.</span><br>'+
      '<span>43% apartado: <b>'+signedMoney(dr)+'</b>.</span><br>'+
      '<span>Ganancia promedio por par: <b>'+signedMoney(da)+'</b> por par.</span>'+
      '</div>'+
    '</div>';
}
function refreshCompareMonths(){const keys=[...new Set(allFinance.map(r=>{const p=parseYmd(r.fecha);return monthKey(p.y,p.m)}))].sort().reverse(),a=compareMonthA.value,b=compareMonthB.value,html=keys.map(k=>'<option value="'+k+'">'+monthNameKey(k)+'</option>').join("");compareMonthA.innerHTML=html;compareMonthB.innerHTML=html;compareMonthA.value=keys.includes(a)?a:(keys[1]||keys[0]||"");compareMonthB.value=keys.includes(b)?b:(keys[0]||"");renderCustomCompare()}
function accountPendingTotal(moves,idKey){
  const byAccount=new Map();
  (moves||[]).filter(x=>!x.eliminado_en).forEach(x=>{
    const id=Number(x[idKey]||0);
    const current=byAccount.get(id)||0;
    const amount=Number(x.importe||0);
    byAccount.set(id,current+(x.tipo==="pago"?-amount:((x.tipo==="nota"||x.tipo==="saldo_inicial")?amount:0)));
  });
  return [...byAccount.values()].reduce((sum,balance)=>sum+Math.max(0,balance),0);
}
function renderFinanceBalances(){
  const supplierTotal=accountPendingTotal(supplierMoves,"proveedor_id");
  const clientTotal=accountPendingTotal(clientMoves,"cliente_id");
  const net=clientTotal-supplierTotal;
  const s=document.getElementById("financeSupplierDebt"),cl=document.getElementById("financeClientDebt"),n=document.getElementById("financeNetBalance"),card=document.getElementById("financeNetCard"),label=document.getElementById("financeNetLabel"),help=document.getElementById("financeNetHelp");
  if(!s||!cl||!n)return;
  s.textContent=moneyShort(supplierTotal);cl.textContent=moneyShort(clientTotal);n.textContent=moneyShort(Math.abs(net));
  const positive=net>=0;
  card.classList.toggle("positive",positive);card.classList.toggle("negative",!positive);
  label.textContent=positive?"SALDO A FAVOR":"SALDO EN CONTRA";
  help.textContent=positive?"Te deben más de lo que debes":"Debes más de lo que te deben";
}
async function ensureFinanceBalances(){
  try{
    const jobs=[];
    if(!suppliersLoaded)jobs.push(loadSuppliers());
    if(!clientsLoaded)jobs.push(loadClients());
    if(jobs.length)await Promise.all(jobs);
    renderFinanceBalances();
  }catch(e){console.warn("No se pudieron cargar los saldos generales",e)}
}
function renderFinance(){
  const rows=filteredFinance();
  const profit=rows.reduce((s,r)=>s+Number(r.ganancia||0),0);
  const half=rows.reduce((s,r)=>s+Number(r.medias_docenas||0),0);
  document.getElementById("financeTotalProfit").textContent=moneyShort(profit);
  document.getElementById("financeTotalReserve").textContent=moneyShort(profit*.43);
  document.getElementById("financeTotalHalfDozens").textContent=half;
  document.getElementById("financeTotalPairs").textContent=half*6;

  let tableRows=allFinance.filter(r=>parseYmd(r.fecha).y===Number(financeYear.value));
  const rm=Number(recordMonth.value||0),rw=Number(recordWeek.value||0),rd=recordDay.value;
  if(recordRangeActive&&recordFrom.value&&recordTo.value)tableRows=allFinance.filter(r=>r.fecha>=recordFrom.value&&r.fecha<=recordTo.value);
  else if(rm)tableRows=tableRows.filter(r=>parseYmd(r.fecha).m===rm);
  if(rw)tableRows=tableRows.filter(r=>weekInfo(r.fecha).week===rw);
  if(rd)tableRows=tableRows.filter(r=>r.fecha===rd);
  tableRows.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const tableProfit=tableRows.reduce((s,r)=>s+Number(r.ganancia||0),0);
  const tableHalf=tableRows.reduce((s,r)=>s+Number(r.medias_docenas||0),0);
  const tablePairs=tableHalf*6;
  rangeSummary.innerHTML=recordRangeActive&&recordFrom.value&&recordTo.value?'<div style="margin-top:10px"><strong>'+formatFinanceDate(recordFrom.value)+' → '+formatFinanceDate(recordTo.value)+'</strong> · '+tableRows.length+' días · '+moneyShort(tableProfit)+' · '+tablePairs+' pares · '+moneyShort(tablePairs?tableProfit/tablePairs:0)+'/par</div>':'';
  recordTotals.innerHTML='<div class="summary-box"><strong>'+moneyShort(tableProfit)+'</strong><span>GANANCIA TOTAL</span></div><div class="summary-box"><strong>'+moneyShort(tableProfit*.43)+'</strong><span>43% TOTAL</span></div><div class="summary-box"><strong>'+tableHalf+'</strong><span>MEDIAS DOCENAS</span></div><div class="summary-box"><strong>'+tablePairs+'</strong><span>PARES</span></div>';

  if(rm&&!rw&&!rd){
    let py=Number(financeYear.value),pm=rm-1;if(pm===0){pm=12;py--}
    const previous=recordPeriodRows(py,pm,0,"");
    const prevProfit=previous.reduce((s,r)=>s+Number(r.ganancia||0),0);
    const prevPairs=previous.reduce((s,r)=>s+Number(r.medias_docenas||0)*6,0);
    recordCompare.innerHTML='<strong>Comparación: '+MONTHS_ES[rm-1]+' vs '+MONTHS_ES[pm-1]+'</strong><br>'+comparisonText("Ganancia",tableProfit,prevProfit,true)+' &nbsp; · &nbsp; '+comparisonText("Pares",tablePairs,prevPairs,false);
    recordCompare.style.display="block";
  }else{
    recordCompare.innerHTML='Selecciona un mes completo para ver la comparación contra el mes anterior.';
    recordCompare.style.display="block";
  }
  if(!tableRows.length){
    financeRows.innerHTML='<div class="finance-empty">No hay registros con estos filtros.</div>';
  }else{
    financeRows.innerHTML='<table class="finance-table"><thead><tr><th>Fecha</th><th>Semana</th><th>Ganancia</th><th>43%</th><th>Medias</th><th>Pares</th><th></th></tr></thead><tbody>'+
      tableRows.map(r=>{
        const w=weekInfo(r.fecha);
        return '<tr><td>'+formatFinanceDate(r.fecha)+'</td><td><span class="finance-week-label">'+weekLabelByInfo(w)+'</span></td><td>'+moneyShort(r.ganancia)+'</td><td>'+moneyShort(Number(r.ganancia)*.43)+'</td><td>'+Number(r.medias_docenas)+'</td><td>'+Number(r.medias_docenas)*6+'</td><td><div class="finance-actions"><button class="finance-edit" data-id="'+r.id+'">Editar</button><button class="finance-delete" data-id="'+r.id+'">Eliminar</button></div></td></tr>';
      }).join("")+'</tbody></table>';
  }
  drawMonthlyProfitChart();
  drawFinanceChart(rows);
  drawPairsChart(rows);
  renderBreakEven();
}
function drawMonthlyProfitChart(){
  const year=Number(financeYear.value);
  const yearRows=allFinance.filter(r=>parseYmd(r.fecha).y===year);
  const points=MONTHS_ES.map((name,i)=>{
    const rr=yearRows.filter(r=>parseYmd(r.fecha).m===i+1);
    return {label:name.slice(0,3),fullLabel:name+" "+year,ganancia:rr.reduce((s,r)=>s+Number(r.ganancia||0),0),pares:rr.reduce((s,r)=>s+Number(r.medias_docenas||0)*6,0),semana:"Acumulado mensual"};
  });
  drawBars(monthlyProfitChart,monthlyProfitTooltip,points,"ganancia",v=>moneyShort(v));
  attachChartHover(monthlyProfitChart);
}
function drawFinanceChart(rows){
  const month=Number(financeMonth.value),week=Number(financeWeek.value);
  let points=[];
  if(month&&week){
    points=rows.map(r=>({label:dayName(r.fecha)+" "+parseYmd(r.fecha).d,fullLabel:formatFinanceDate(r.fecha),ganancia:Number(r.ganancia),pares:Number(r.medias_docenas)*6,semana:weekLabelForDate(r.fecha)}));
    document.getElementById("financeChartTitle").textContent="Ganancia por día";
  }else if(month){
    const weeks=[...new Set(rows.map(r=>weekInfo(r.fecha).week))].sort((a,b)=>a-b);
    points=weeks.map(w=>{
      const rr=rows.filter(r=>weekInfo(r.fecha).week===w);
      return {label:"Sem "+w,fullLabel:"Semana "+w,ganancia:rr.reduce((s,r)=>s+Number(r.ganancia),0),pares:rr.reduce((s,r)=>s+Number(r.medias_docenas)*6,0),semana:rr.length?weekLabelForDate(rr[0].fecha):"Semana "+w};
    });
    document.getElementById("financeChartTitle").textContent="Ganancia por semana";
  }else{
    points=MONTHS_ES.map((name,i)=>{
      const rr=rows.filter(r=>parseYmd(r.fecha).m===i+1);
      return {label:name.slice(0,3),fullLabel:name,ganancia:rr.reduce((s,r)=>s+Number(r.ganancia),0),pares:rr.reduce((s,r)=>s+Number(r.medias_docenas)*6,0),semana:"Acumulado mensual"};
    });
    document.getElementById("financeChartTitle").textContent="Ganancia por mes";
  }
  drawBars(financeChart,financeTooltip,points,"ganancia",v=>moneyShort(v));
  attachChartHover(financeChart);
}
function dayName(value){
  const {y,m,d}=parseYmd(value);
  return ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(Date.UTC(y,m-1,d)).getUTCDay()];
}
function drawBars(canvas,tooltip,points,valueKey,valueFormatter){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  /* Más espacio arriba para mostrar el valor de cada barra sin recortarlo. */
  const pad={l:58,r:14,t:34,b:48};
  const max=Math.max(...points.map(p=>Number(p[valueKey]||0)),1);
  const innerW=w-pad.l-pad.r,innerH=h-pad.t-pad.b;
  ctx.strokeStyle="#eadfe4";ctx.lineWidth=1;
  for(let n=0;n<=4;n++){const y=pad.t+innerH*(n/4);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
  const slot=innerW/Math.max(points.length,1),bar=Math.max(7,Math.min(34,slot*.58));
  const hit=[];
  points.forEach((p,n)=>{
    const v=Number(p[valueKey]||0),bh=(v/max)*(innerH-8),x=pad.l+n*slot+(slot-bar)/2,y=pad.t+innerH-bh;
    ctx.fillStyle="#e8bfd0";ctx.fillRect(x,y,bar,bh);
    /* Valor visible encima de cada barra. Ganancias se muestran como moneda y pares como número. */
    if(v>0){
      ctx.fillStyle="#555";ctx.font="bold 9px -apple-system,BlinkMacSystemFont,Segoe UI,Arial";ctx.textAlign="center";
      const valueLabel=valueKey==="ganancia"?moneyShort(v):Math.round(v).toLocaleString("es-MX");
      ctx.fillText(valueLabel,x+bar/2,Math.max(12,y-6));
    }
    ctx.fillStyle="#333";ctx.font="10px -apple-system,BlinkMacSystemFont,Segoe UI,Arial";ctx.textAlign="center";
    ctx.fillText(p.label,x+bar/2,h-20);
    hit.push({x,y,w:bar,h:Math.max(bh,4),p});
  });
  ctx.fillStyle="#888";ctx.textAlign="right";ctx.font="9px -apple-system,BlinkMacSystemFont,Segoe UI,Arial";
  for(let n=0;n<=4;n++){const v=max*(1-n/4),y=pad.t+innerH*(n/4)+3;ctx.fillText(valueFormatter(v),pad.l-7,y)}
  canvas._hits=hit;canvas._tooltip=tooltip;
}
function attachChartHover(canvas){
  function hide(){if(canvas._tooltip)canvas._tooltip.style.display="none"}
  canvas.onmouseleave=hide;
  canvas.onmousemove=function(e){
    const rect=canvas.getBoundingClientRect(),sx=canvas.width/rect.width,sy=canvas.height/rect.height;
    const x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;
    const hit=(canvas._hits||[]).find(h=>x>=h.x-5&&x<=h.x+h.w+5&&y>=h.y-8&&y<=h.y+h.h+8);
    if(!hit){hide();return}
    const p=hit.p,t=canvas._tooltip;
    t.innerHTML="<b>"+escapeHtml(p.fullLabel||p.label)+"</b><br>Ganancia: "+escapeHtml(moneyShort(p.ganancia))+"<br>Pares: "+Number(p.pares||0)+"<br>"+escapeHtml(p.semana||"");
    t.style.display="block";
    const card=canvas.closest(".finance-chart-card").getBoundingClientRect();
    t.style.left=Math.min(e.clientX-card.left+12,card.width-190)+"px";
    t.style.top=Math.max(70,e.clientY-card.top-20)+"px";
  };
}
function drawPairsChart(rows){
  const month=Number(financeMonth.value),week=Number(financeWeek.value);
  let points=[];
  if(month){
    points=rows.map(r=>({label:dayName(r.fecha)+" "+parseYmd(r.fecha).d,fullLabel:formatFinanceDate(r.fecha),pares:Number(r.medias_docenas)*6,ganancia:Number(r.ganancia),semana:weekLabelForDate(r.fecha)}));
  }else{
    points=MONTHS_ES.map((name,n)=>{
      const rr=rows.filter(r=>parseYmd(r.fecha).m===n+1);
      return {label:name.slice(0,3),fullLabel:name,pares:rr.reduce((s,r)=>s+Number(r.medias_docenas)*6,0),ganancia:rr.reduce((s,r)=>s+Number(r.ganancia),0),semana:"Acumulado mensual"};
    });
  }
  drawBars(pairsChart,pairsTooltip,points,"pares",v=>String(Math.round(v)));
  attachChartHover(pairsChart);
}
function renderBreakEven(){
  const y=Number(fixedYear.value)||Number(financeYear.value)||new Date().getFullYear();
  const m=Number(fixedMonth.value)||Number(financeMonth.value)||new Date().getMonth()+1;
  const goal=financeGoals.find(g=>Number(g.anio)===y&&Number(g.mes)===m);
  const expenseRows=financeExpenses.filter(g=>Number(g.anio)===y&&Number(g.mes)===m);
  const fixed=expenseRows.length?expenseRows.reduce((s,g)=>s+Number(g.importe||0),0):Number(goal?.gastos_fijos||0);
  const rows=allFinance.filter(r=>{const p=parseYmd(r.fecha);return p.y===y&&p.m===m});
  const profit=rows.reduce((s,r)=>s+Number(r.ganancia||0),0);
  const pairs=rows.reduce((s,r)=>s+Number(r.medias_docenas||0)*6,0);
  const reserved=profit*.43,avg=pairs?profit/pairs:0,contribution=avg*.43;
  const missing=Math.max(0,fixed-reserved),pairsNeeded=contribution>0?Math.ceil(missing/contribution):0,extra=Math.max(0,reserved-fixed);
  document.getElementById("beFixed").textContent=moneyShort(fixed);
  document.getElementById("beReserved").textContent=moneyShort(reserved);
  document.getElementById("beAvg").textContent=moneyShort(avg);
  document.getElementById("bePairs").textContent=fixed?pairsNeeded:"—";
  document.getElementById("beExtra").textContent=moneyShort(extra);
  document.getElementById("breakEvenProgressBar").style.width=(fixed?Math.min(100,(reserved/fixed)*100):0)+"%";
  document.getElementById("breakEvenNote").textContent=!fixed?"Guarda los gastos fijos del mes para calcular tu punto de equilibrio.":(reserved>=fixed?"Meta cubierta. Excedente del apartado: "+moneyShort(extra)+".":"Faltan "+moneyShort(missing)+"; al promedio actual faltan aproximadamente "+pairsNeeded+" pares.");
}
function renderBreakEvenHistory(){
  if(!beHistoryYear||!beHistoryMonth)return;
  const y=Number(beHistoryYear.value),m=Number(beHistoryMonth.value);
  if(!y||!m)return;
  const expenseRows=financeExpenses.filter(g=>Number(g.anio)===y&&Number(g.mes)===m);
  const goal=financeGoals.find(g=>Number(g.anio)===y&&Number(g.mes)===m);
  const fixed=expenseRows.length?expenseRows.reduce((s,g)=>s+Number(g.importe||0),0):Number(goal?.gastos_fijos||0);
  const rows=allFinance.filter(r=>{const p=parseYmd(r.fecha);return p.y===y&&p.m===m});
  const profit=rows.reduce((s,r)=>s+Number(r.ganancia||0),0);
  const pairs=rows.reduce((s,r)=>s+Number(r.medias_docenas||0)*6,0);
  const reserved=profit*.43,avg=pairs?profit/pairs:0,extra=Math.max(0,reserved-fixed),missing=Math.max(0,fixed-reserved);
  beHistorySummary.innerHTML='<div class="finance-summary" style="margin-top:12px"><div class="summary-box"><strong>'+moneyShort(fixed)+'</strong><span>GASTOS FIJOS</span></div><div class="summary-box"><strong>'+moneyShort(reserved)+'</strong><span>43% ACUMULADO</span></div><div class="summary-box"><strong>'+pairs+'</strong><span>PARES</span></div><div class="summary-box"><strong>'+moneyShort(avg)+'</strong><span>GANANCIA / PAR</span></div></div><p style="margin:10px 0 0;color:#777">'+(fixed?(reserved>=fixed?'Mes cubierto · Excedente '+moneyShort(extra):'Faltaron '+moneyShort(missing)+' para cubrir gastos.'):'No hay gastos fijos configurados para este mes.')+'</p>';
}
function setupBreakEvenHistory(){
  if(!beHistoryYear||!beHistoryMonth)return;
  const years=[...new Set([new Date().getFullYear(),...allFinance.map(r=>parseYmd(r.fecha).y),...financeExpenses.map(g=>Number(g.anio))])].sort((a,b)=>b-a);
  const oldY=beHistoryYear.value,oldM=beHistoryMonth.value;
  beHistoryYear.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join("");
  beHistoryMonth.innerHTML=MONTHS_ES.map((n,k)=>'<option value="'+(k+1)+'">'+n+'</option>').join("");
  beHistoryYear.value=oldY&&years.includes(Number(oldY))?oldY:(fixedYear.value||String(new Date().getFullYear()));
  beHistoryMonth.value=oldM||fixedMonth.value||String(new Date().getMonth()+1);
  renderBreakEvenHistory();
}
beHistoryYear.onchange=renderBreakEvenHistory;
beHistoryMonth.onchange=renderBreakEvenHistory;

const expenseToggle=document.getElementById("expenseToggle");
const expenseCollapsible=document.getElementById("expenseCollapsible");
expenseToggle.onclick=function(){
  const open=expenseCollapsible.classList.toggle("open");
  expenseToggle.classList.toggle("open",open);
};

function setupFixedFilters(preferredYear,preferredMonth){
  const keepYear=String(preferredYear||fixedYear.value||"");
  const keepMonth=String(preferredMonth||fixedMonth.value||"");
  const years=[...new Set([new Date().getFullYear(),...allFinance.map(r=>parseYmd(r.fecha).y),...financeExpenses.map(g=>Number(g.anio)),Number(keepYear)||0].filter(Boolean))].sort((a,b)=>b-a);
  fixedYear.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join("");
  fixedMonth.innerHTML=MONTHS_ES.map((n,k)=>'<option value="'+(k+1)+'">'+n+'</option>').join("");
  fixedYear.value=keepYear&&years.includes(Number(keepYear))?keepYear:(financeYear.value||String(new Date().getFullYear()));
  fixedMonth.value=keepMonth||((financeMonth.value&&financeMonth.value!=="0")?financeMonth.value:String(new Date().getMonth()+1));
  renderExpenses();
  setupBreakEvenHistory();
}
function monthExpenses(){
  return financeExpenses.filter(x=>Number(x.anio)===Number(fixedYear.value)&&Number(x.mes)===Number(fixedMonth.value));
}
function renderExpenses(){
  const rows=monthExpenses();
  const total=rows.reduce((s,x)=>s+Number(x.importe||0),0);
  fixedExpense.value=total||"";
  document.getElementById("expenseTotal").textContent=moneyShort(total);
  expenseList.innerHTML=rows.length?rows.map(x=>'<div class="expense-row" data-id="'+x.id+'"><input class="expense-concept" value="'+escapeHtml(x.concepto)+'"><input class="expense-value" type="number" min="0" step="0.01" value="'+Number(x.importe)+'"><div class="expense-row-actions"><button class="expense-save" type="button">Guardar</button><button class="expense-delete" type="button">Eliminar</button></div></div>').join(""):'<div class="finance-empty">Aún no hay conceptos para este mes.</div>';
  renderBreakEven();
}
async function expenseAction(payload){
  const keepYear=fixedYear.value,keepMonth=fixedMonth.value;
  const response=await fetch("/.netlify/functions/admin-finanzas",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify(payload)});
  const result=await readJson(response);
  if(!response.ok||!result.success)throw new Error(result.error||"No se pudo guardar el gasto.");
  await loadFinance(keepYear,keepMonth);
}
document.getElementById("copyPreviousExpenses").onclick=async function(){
  const y=Number(fixedYear.value),m=Number(fixedMonth.value);
  let py=y,pm=m-1;if(pm===0){pm=12;py--}
  const previous=financeExpenses.filter(x=>Number(x.anio)===py&&Number(x.mes)===pm);
  if(!previous.length){alert("El mes anterior no tiene gastos registrados.");return}
  const current=monthExpenses();
  const existing=new Set(current.map(x=>String(x.concepto||"").trim().toLowerCase()));
  const missing=previous.filter(x=>!existing.has(String(x.concepto||"").trim().toLowerCase()));
  if(!missing.length){alert("Este mes ya tiene todos los conceptos del mes anterior.");return}
  this.disabled=true;this.textContent="Copiando...";
  try{
    for(const x of missing){
      const response=await fetch("/.netlify/functions/admin-finanzas",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"save-expense",anio:y,mes:m,concepto:x.concepto,importe:Number(x.importe||0)})});
      const result=await readJson(response);if(!response.ok||!result.success)throw new Error(result.error||"No se pudo copiar el gasto.");
    }
    await loadFinance(String(y),String(m));
  }catch(e){alert(e.message)}
  finally{this.disabled=false;this.textContent="Copiar mes anterior"}
};

document.getElementById("addExpenseCategory").onclick=async function(){
  const concepto=expenseName.value.trim(),importe=Number(expenseAmount.value);
  if(!concepto){alert("Escribe el concepto del gasto.");return}
  if(!Number.isFinite(importe)||importe<0){alert("Escribe un importe válido.");return}
  this.disabled=true;
  try{
    await expenseAction({action:"save-expense",anio:Number(fixedYear.value),mes:Number(fixedMonth.value),concepto,importe});
    expenseName.value="";expenseAmount.value="";
  }catch(e){alert(e.message)}finally{this.disabled=false}
};
expenseList.onclick=async function(e){
  const row=e.target.closest(".expense-row");if(!row)return;
  const id=Number(row.dataset.id);
  if(e.target.closest(".expense-save")){
    const concepto=row.querySelector(".expense-concept").value.trim(),importe=Number(row.querySelector(".expense-value").value);
    if(!concepto||!Number.isFinite(importe)||importe<0){alert("Revisa concepto e importe.");return}
    try{await expenseAction({action:"save-expense",id,anio:Number(fixedYear.value),mes:Number(fixedMonth.value),concepto,importe})}catch(err){alert(err.message)}
  }
  if(e.target.closest(".expense-delete")){
    if(!confirm("¿Eliminar este concepto de gasto?"))return;
    try{await expenseAction({action:"delete-expense",id})}catch(err){alert(err.message)}
  }
};
fixedYear.onchange=renderExpenses;
fixedMonth.onchange=renderExpenses;

async function loadFinance(preferredFixedYear,preferredFixedMonth){
  financeRows.innerHTML='<div class="finance-empty">Cargando finanzas...</div>';
  try{
    const response=await fetch("/.netlify/functions/admin-finanzas?t="+Date.now(),{headers:{"x-admin-password":adminPassword},cache:"no-store"});
    const result=await readJson(response);
    if(!response.ok||!result.success) throw new Error(result.error||"No se pudo cargar finanzas.");
    allFinance=Array.isArray(result.registros)?result.registros:[];
    financeGoals=Array.isArray(result.metas)?result.metas:[];
    financeExpenses=Array.isArray(result.gastos)?result.gastos:[];
    financeLoaded=true;
    setupFinanceFilters();
    refreshCompareMonths();
    setupFixedFilters(preferredFixedYear,preferredFixedMonth);
    renderFinance();
  }catch(error){
    financeRows.innerHTML='<div class="finance-empty">'+escapeHtml(error.message)+'</div>';
  }
}
async function saveFinanceRecord(){
  const fecha=financeDate.value;
  const ganancia=Number(financeProfit.value);
  const medias=Number(financeHalfDozens.value);
  if(!fecha){alert("Selecciona una fecha.");return}
  if(!Number.isFinite(ganancia)||ganancia<0){alert("Escribe una ganancia válida.");return}
  if(!Number.isInteger(medias)||medias<0){alert("Escribe las medias docenas vendidas.");return}
  saveFinance.disabled=true;saveFinance.textContent="Guardando...";
  try{
    const response=await fetch("/.netlify/functions/admin-finanzas",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:editingFinanceId?"update":"upsert",id:editingFinanceId,fecha,ganancia,medias_docenas:medias})});
    const result=await readJson(response);
    if(!response.ok||!result.success) throw new Error(result.error||"No se pudo guardar.");
    editingFinanceId=null;
    financeProfit.value="";financeHalfDozens.value="";
    saveFinance.textContent="Guardar registro";
    await loadFinance();
    showOperation("✓ Registro guardado");setTimeout(hideOperation,1500);
  }catch(error){alert(error.message)}
  finally{saveFinance.disabled=false;if(!editingFinanceId)saveFinance.textContent="Guardar registro"}
}
saveFinance.onclick=saveFinanceRecord;
financeYear.onchange=function(){updateWeekOptions();if(fixedYear)fixedYear.value=financeYear.value;renderFinance();syncFixedInput()};
financeMonth.onchange=function(){updateWeekOptions();if(fixedMonth&&financeMonth.value!=="0")fixedMonth.value=financeMonth.value;renderFinance();syncFixedInput()};
financeWeek.onchange=renderFinance;
recordMonth.onchange=function(){recordRangeActive=false;updateRecordWeekOptions("0");recordDay.value="";renderFinance()};
recordWeek.onchange=function(){recordRangeActive=false;recordDay.value="";renderFinance()};
recordDay.onchange=function(){recordRangeActive=false;if(recordDay.value){const p=parseYmd(recordDay.value);recordMonth.value=String(p.m);updateRecordWeekOptions(weekInfo(recordDay.value).week);recordWeek.value=String(weekInfo(recordDay.value).week)}renderFinance()};
document.getElementById("clearRecordFilters").onclick=function(){recordRangeActive=false;recordMonth.value="0";recordDay.value="";recordFrom.value="";recordTo.value="";updateRecordWeekOptions("0");renderFinance()};
compareMonthA.onchange=renderCustomCompare;compareMonthB.onchange=renderCustomCompare;
document.getElementById("applyRecordRange").onclick=function(){if(!recordFrom.value||!recordTo.value)return alert("Selecciona ambas fechas.");if(recordFrom.value>recordTo.value)return alert("La fecha inicial debe ser anterior a la final.");recordRangeActive=true;recordMonth.value="0";recordWeek.value="0";recordDay.value="";renderFinance()};
document.getElementById("clearRecordRange").onclick=function(){recordRangeActive=false;recordFrom.value="";recordTo.value="";renderFinance()};
document.getElementById("refreshFinance").onclick=loadFinance;
financeRows.onclick=async function(e){
  const edit=e.target.closest(".finance-edit");
  if(edit){
    const row=allFinance.find(r=>Number(r.id)===Number(edit.dataset.id));
    if(!row)return;
    editingFinanceId=Number(row.id);
    financeDate.value=row.fecha;
    financeProfit.value=Number(row.ganancia);
    financeHalfDozens.value=Number(row.medias_docenas);
    saveFinance.textContent="Guardar cambios";
    /* Al editar desde Registros, abre automáticamente el formulario y lleva al usuario a los campos. */
    document.getElementById("importFinancePanel")?.classList.remove("open");
    document.getElementById("toggleImportFinance")?.classList.remove("active");
    document.getElementById("entryFinancePanel")?.classList.add("open");
    document.getElementById("toggleEntryFinance")?.classList.add("active");
    document.getElementById("entryFinancePanel")?.scrollIntoView({behavior:"smooth",block:"center"});
    setTimeout(()=>financeProfit.focus(),350);
    return;
  }
  const del=e.target.closest(".finance-delete");
  if(!del)return;
  if(!confirm("¿Eliminar este registro financiero?"))return;
  try{
    const response=await fetch("/.netlify/functions/admin-finanzas",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"delete",id:Number(del.dataset.id)})});
    const result=await readJson(response);
    if(!response.ok||!result.success) throw new Error(result.error||"No se pudo eliminar.");
    await loadFinance();
  }catch(error){alert(error.message)}
};
financeDate.value=financeLocalToday();


/* FECHA */

function formatDate(value){
  if(!value)return "";

  const date=
    new Date(value);

  if(
    Number.isNaN(
      date.getTime()
    )
  ){
    return value;
  }

  return new Intl.DateTimeFormat(
    "es-MX",
    {
      day:"numeric",
      month:"short",
      year:"numeric",
      hour:"numeric",
      minute:"2-digit"
    }
  ).format(date);
}

/* ACTUALIZAR */

refreshButton.onclick=
  loadModels;

document.getElementById(
  "refreshOrders"
).onclick=
  loadOrders;

/* JSON */

async function readJson(response){
  const text=
    await response.text();

  try{
    return JSON.parse(text);
  }catch(error){
    return {
      success:false,
      error:
        "Respuesta inválida del servidor: "+
        text.substring(0,300)
    };
  }
}

/* SEGURIDAD */

function escapeHtml(value){
  return String(value||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function escapeAttribute(value){
  return escapeHtml(value);
}


/* NOTA MANUAL DESDE REGISTRO */
let manualMatchedClient=null;
function manualModelOptions(){const rows=[];allProducts.forEach(p=>(p.variantes||[]).forEach(v=>rows.push({modelo:p.modelo,color:v.color||"",precio:Number(v.precio_venta||0),stock:Math.max(0,Number(v.existencia||0))})));return rows}
function manualStockWarning(items){
  const shortages=items.filter(item=>Number(item.cantidad)>Number(item.stock||0));
  if(!shortages.length)return true;
  const lines=shortages.map(item=>{
    const available=Math.max(0,Number(item.stock||0));
    const requested=Number(item.cantidad||0);
    const label="Modelo "+item.modelo+(item.color?" · "+formatColor(item.color):"");
    return "• "+label+": "+(available===0?"AGOTADO":"solo "+available+" pares disponibles")+" · solicitados "+requested;
  });
  return confirm("⚠️ EXISTENCIA INSUFICIENTE\n\n"+lines.join("\n")+"\n\nPuedes continuar para usar esta nota como cotización.\n\n¿Quieres guardar la nota de todos modos?");
}
function manualLine(){return '<div class="manual-note-line"><input class="manual-qty" type="number" min="6" step="6" value="6" inputmode="numeric"><div class="manual-model-wrap"><input class="manual-model-search" type="search" placeholder="Buscar modelo..." autocomplete="off"><input class="manual-model-index" type="hidden" value=""><div class="manual-model-suggestions" hidden></div></div><input class="manual-price" type="number" min="0" step=".01" inputmode="decimal" placeholder="$0"><div class="manual-line-total">$0.00</div><button class="manual-remove" type="button">×</button></div>'}
function calculateManualOrder(){let total=0;document.querySelectorAll("#manualOrderLines .manual-note-line").forEach(row=>{const q=Number(row.querySelector(".manual-qty").value||0),p=Number(row.querySelector(".manual-price").value||0),v=q*p;row.querySelector(".manual-line-total").textContent=money(v);total+=v});document.getElementById("manualOrderTotal").textContent=money(total);return total}
function matchManualClient(){const input=document.getElementById("manualClientName"),phone=document.getElementById("manualClientPhone"),msg=document.getElementById("manualClientMatch"),name=normalizeText(input.value);manualMatchedClient=(window.catalogClients||[]).find(x=>normalizeText(x.nombre)===name)||null;if(manualMatchedClient){input.value=manualMatchedClient.nombre;phone.value=manualMatchedClient.telefono||"";msg.textContent="✓ Cliente registrado seleccionado";msg.style.color="#377a50"}else{phone.value="";msg.textContent=input.value.trim()?"Cliente nuevo · se guardará con el nombre capturado.":"Escribe el nombre del cliente.";msg.style.color="#999"}}
async function openManualOrder(){if(!clientsLoaded)await loadClients();const modal=document.getElementById("manualOrderModal");document.getElementById("manualClientSuggestions").innerHTML=(window.catalogClients||[]).map(x=>'<option value="'+escapeAttribute(x.nombre)+'"></option>').join("");document.getElementById("manualClientName").value="";document.getElementById("manualClientPhone").value="";manualMatchedClient=null;document.getElementById("manualOrderDate").value=localDateInput();document.getElementById("manualOrderLines").innerHTML=manualLine();calculateManualOrder();modal.classList.add("open");modal.setAttribute("aria-hidden","false")}
document.getElementById("createManualOrder").onclick=openManualOrder;
document.getElementById("manualOrderClose").onclick=()=>document.getElementById("manualOrderModal").classList.remove("open");document.getElementById("manualOrderModal").setAttribute("aria-hidden","true");
document.getElementById("manualCancel").onclick=()=>document.getElementById("manualOrderModal").classList.remove("open");document.getElementById("manualOrderModal").setAttribute("aria-hidden","true");
document.getElementById("manualClientName").addEventListener("input",matchManualClient);
document.getElementById("manualClientName").addEventListener("change",matchManualClient);
document.getElementById("manualAddLine").onclick=()=>document.getElementById("manualOrderLines").insertAdjacentHTML("beforeend",manualLine());
function renderManualModelSuggestions(input){const row=input.closest(".manual-note-line"),box=row.querySelector(".manual-model-suggestions"),hidden=row.querySelector(".manual-model-index"),q=normalizeText(input.value);hidden.value="";if(!q){box.innerHTML="";box.hidden=true;return}const matches=manualModelOptions().map((x,i)=>({x,i,label:(String(x.modelo||"")+(x.color?" · "+formatColor(x.color):"")).trim()})).filter(({x,label})=>normalizeText(String(x.modelo||"")+" "+String(x.color||"")+" "+label).includes(q)).slice(0,12);if(!matches.length){box.innerHTML='<div class="manual-model-empty">Sin coincidencias</div>';box.hidden=false;return}box.innerHTML=matches.map(({i,label})=>'<button type="button" class="manual-model-option" data-index="'+i+'">'+escapeHtml(label)+'</button>').join("");box.hidden=false}
function selectManualModel(row,index){const x=manualModelOptions()[Number(index)];if(!x)return;row.querySelector(".manual-model-index").value=String(index);row.querySelector(".manual-model-search").value=(String(x.modelo||"")+(x.color?" · "+formatColor(x.color):"")).trim();row.querySelector(".manual-price").value=x.precio||"";const box=row.querySelector(".manual-model-suggestions");box.hidden=true;box.innerHTML="";calculateManualOrder()}
document.getElementById("manualOrderLines").addEventListener("click",e=>{const b=e.target.closest(".manual-remove");if(b){b.closest(".manual-note-line").remove();calculateManualOrder();return}const opt=e.target.closest(".manual-model-option");if(opt){selectManualModel(opt.closest(".manual-note-line"),opt.dataset.index)}});
document.getElementById("manualOrderLines").addEventListener("input",e=>{if(e.target.classList.contains("manual-model-search"))renderManualModelSuggestions(e.target);calculateManualOrder()});
document.addEventListener("click",e=>{document.querySelectorAll(".manual-model-suggestions").forEach(box=>{if(!box.closest(".manual-model-wrap").contains(e.target))box.hidden=true})});
document.getElementById("manualSave").onclick=async function(){const btn=this,name=document.getElementById("manualClientName").value.trim(),fecha=document.getElementById("manualOrderDate").value;if(!name){alert("Ingresa el nombre del cliente.");return}const rows=[...document.querySelectorAll("#manualOrderLines .manual-note-line")],opts=manualModelOptions(),items=[];for(const row of rows){const q=Number(row.querySelector(".manual-qty").value),idx=row.querySelector(".manual-model-index").value,p=Number(row.querySelector(".manual-price").value),x=idx===""?null:opts[Number(idx)];if(!x||!Number.isInteger(q)||q<6||q%6!==0||!Number.isFinite(p)||p<0){alert("Revisa cantidad, modelo y precio. La cantidad debe ser múltiplo de 6.");return}items.push({cantidad:q,modelo:x.modelo,color:x.color,precio_unitario:p,stock:Number(x.stock||0)})}if(!items.length){alert("Agrega al menos un producto.");return}if(!manualStockWarning(items))return;let debt=null;if(manualMatchedClient)debt=(clients||[]).find(x=>Number(x.catalogo_cliente_id)===Number(manualMatchedClient.id))||(clients||[]).find(x=>normalizeText(x.nombre)===normalizeText(manualMatchedClient.nombre));btn.disabled=true;btn.textContent="Guardando...";try{const r=await fetch("/.netlify/functions/admin-pedidos",{method:"POST",headers:{"Content-Type":"application/json","x-admin-password":adminPassword},body:JSON.stringify({action:"create-manual",cliente:name,fecha,catalogo_cliente_id:manualMatchedClient?.id||null,cliente_deuda_id:debt?.id||null,items})});const result=await readJson(r);if(!r.ok||!result.success)throw new Error(result.error||"No se pudo crear la nota.");document.getElementById("manualOrderModal").classList.remove("open");document.getElementById("manualOrderModal").setAttribute("aria-hidden","true");await loadOrders();renderOrders();const order=allOrders.find(x=>Number(x.id)===Number(result.pedido.id));if(order)openNote(order)}catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent="Guardar nota"}};

/* INICIAR */

/* Acceso temporal sin inicio de sesión mientras se termina el administrador. */
(async()=>{createColorBlock("");await Promise.all([loadModels(),loadFinance(),ensureFinanceBalances(),loadUploadProviders()]);await loadColorPresets();window.scrollTo({top:0,left:0,behavior:"auto"});})().catch(err=>{console.error("Error al iniciar el administrador:",err);});

