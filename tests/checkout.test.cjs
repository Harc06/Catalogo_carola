const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const extract = (from, to) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));
const pure = extract('function normalize(value)', 'function formatColor(value)') + extract('function formatColor(value)', 'function formatCategory(value)') + extract('function checkoutItems(', '/* =========================\n   CARRITO') + extract('function createWhatsAppMessage(', 'function openWhatsApp(');
function frontend() {
 const context = vm.createContext({console, Date, crypto:require('node:crypto').webcrypto, DUPLICATE_WINDOW:1800000, localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
 vm.runInContext(pure,context);return context;
}
test('all inline browser scripts parse',()=>{
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
test('groups normalized model/color and rejects invalid quantities',()=>{
 const c=frontend();
 const result=c.checkoutItems([{modelo:'9004',color:'COÑAC',cantidad:6},{modelo:'9004',color:'conac',cantidad:12}]);
 assert.equal(result.length,1);assert.equal(result[0].cantidad,18);
 for(const cantidad of [0,7,NaN,Infinity,-6])assert.throws(()=>c.checkoutItems([{modelo:'9004',color:'negro',cantidad}]));
});
test('storage failure does not interrupt retries or WhatsApp message construction',()=>{
 const c=frontend();const a=c.getCheckoutAttempt('a');const b=c.getCheckoutAttempt('a');
 assert.equal(a.requestId,b.requestId);
 c.cart=[{modelo:'WRONG',color:'WRONG',cantidad:999}];
 const message=c.createWhatsAppMessage({folio:'CAR-test',cliente:'Cliente',total_pares:6,items:[{modelo:'9004',color:'negro',cantidad:6}]});
 assert.match(message,/6 9004 Negro/);assert.match(message,/Total de pares = 6/);assert.doesNotMatch(message,/WRONG|999/);
});
function backend(rpc){
 const context={exports:{},console,process:{env:{SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'}},require(name){return name==='@supabase/supabase-js'?{createClient(){return {rpc};}}:require(name);}};
 vm.runInNewContext(fs.readFileSync('netlify/functions/pedidos.js','utf8'),context);return context.exports.handler;
}
test('backend returns database-confirmed order and forwards retry key',async()=>{
 const id=require('node:crypto').randomUUID();
 const handler=backend(async(name,args)=>{assert.equal(name,'crear_pedido_catalogo');assert.equal(args.p_request_id,id);return {data:{folio:'CAR-test',items:[]}};});
 const result=await handler({httpMethod:'POST',body:JSON.stringify({cliente:'Cliente',items:[],request_id:id})});
 assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).pedido.folio,'CAR-test');
});
test('backend rejects malformed requests and propagates stock rejection without success',async()=>{
 const handler=backend(async()=>({error:{code:'P0001',message:'Quedan 6 pares'}}));
 assert.equal((await handler({httpMethod:'GET'})).statusCode,405);
 assert.equal((await handler({httpMethod:'POST',body:'null'})).statusCode,400);
 assert.equal((await handler({httpMethod:'POST',body:'{'})).statusCode,400);
 const result=await handler({httpMethod:'POST',body:JSON.stringify({cliente:'Cliente',items:[]})});
 assert.equal(result.statusCode,409);assert.equal(JSON.parse(result.body).success,false);
});
test('async checkout freezes controls and opens WhatsApp from the confirmed response',async()=>{
 const c=frontend();
 const button={textContent:'Enviar',disabled:false,insertAdjacentElement(){}};
 const control={disabled:false};const elements={sendOrder:button};
 c.document={getElementById(id){return elements[id]||null;},createElement(){return {style:{}};}};
 c.cartPanel={querySelectorAll(){return [button,control];}};
 c.customerName={value:'Cliente',focus(){}};
 c.cart=[{modelo:'9004',color:'negro',cantidad:6}];
 c.window={location:{href:''}};c.WHATSAPP_NUMBER='524775971996';
 c.alert=(message)=>assert.fail(message);
 let finish;let payload;
 c.fetch=async(url,options)=>{payload=JSON.parse(options.body);return new Promise(resolve=>{finish=resolve;});};
 vm.runInContext(extract('function openWhatsApp(', '/* =========================\n   TOAST'),c);
 const pending=button.onclick();
 assert.equal(control.disabled,true);
 assert.equal(payload.items[0].cantidad,6);
 c.cart[0].cantidad=18;
 finish({ok:true,json:async()=>({success:true,pedido:{folio:'CAR-confirmed',cliente:'Cliente',total_pares:6,items:payload.items}})});
 await pending;
 assert.equal(control.disabled,false);
 const message=new URL(c.window.location.href).searchParams.get('text');
 assert.match(message,/6 9004 Negro/);assert.doesNotMatch(message,/18 9004/);
});
