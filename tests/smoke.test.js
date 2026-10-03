const fs=require("fs");
const assert=require("assert");

function read(path){assert(fs.existsSync(path),"Missing required file: "+path);return fs.readFileSync(path,"utf8");}
function has(html,needle,label){assert(html.includes(needle),label+" is missing");}

const home=read("index.html");
const product=read("producto.html");
const wholesale=read("catalogo-mayoreo.html");
const supabase=read("netlify/functions/supabase.js");
const pedidos=read("netlify/functions/pedidos.js");
const netlify=read("netlify.toml");

has(home,"/.netlify/functions/","Public catalog must keep its Netlify API integration");
has(home,"producto.html","Catalog must keep product-detail navigation");
has(product,"/.netlify/functions/","Product detail must keep its Netlify API integration");
has(wholesale,"catalogo","Wholesale entry page must keep catalog navigation/content");
assert(/exports\.handler\s*=/.test(supabase),"Catalog Supabase function must export a handler");
assert(/exports\.handler\s*=/.test(pedidos),"Orders function must export a handler");
const analytics=read("netlify/functions/analytics.js");
has(analytics,'"busqueda"',"Analytics backend must accept search events");
has(home,'trackCatalog("visita")',"Catalog must track visits");
has(home,'trackCatalog("modelo"',"Catalog must track model views");
has(home,'trackCatalog("agregar"',"Catalog must track add-to-order actions");
has(home,'trackCatalog("carrito")',"Catalog must track cart opens");
has(home,'trackCatalog("whatsapp"',"Catalog must track WhatsApp handoff");
has(home,'trackCatalog("busqueda"',"Catalog must track meaningful searches");
has(home,'aria-label="Buscar modelos, categorías o colores"',"Catalog search must remain accessible");
has(home,'aria-label="Limpiar búsqueda"',"Clear-search control must remain accessible");
has(home,'aria-pressed="true"',"Catalog view controls must expose state");
has(home,"prefers-reduced-motion","Catalog must respect reduced-motion preferences");
has(product,"prefers-reduced-motion","Product detail must respect reduced-motion preferences");
has(home,'role="dialog" aria-modal="true" aria-labelledby="cartTitle"',"Cart must expose dialog semantics");
has(home,'aria-label="Cerrar pedido"',"Cart close control must remain accessible");
has(home,'role="status" aria-live="polite"',"Catalog feedback must remain accessible");
has(product,'aria-label="Compartir este modelo"',"Product sharing must remain accessible");
has(product,'role="status" aria-live="polite"',"Product feedback must remain accessible");
has(netlify,'for = "/assets/*"',"Static assets must keep long-lived cache headers");
has(netlify,'max-age=31536000',"Static assets must keep a one-year browser cache");
assert((home.match(/window\.addEventListener\(\s*"scroll"/g)||[]).length<=1,"Catalog should not duplicate global scroll listeners");


console.log("✓ Public catalog smoke checks passed");
