const fs=require("fs");
const assert=require("assert");

function read(path){assert(fs.existsSync(path),"Missing required file: "+path);return fs.readFileSync(path,"utf8");}
function has(html,needle,label){assert(html.includes(needle),label+" is missing");}

const home=read("index.html");
const product=read("producto.html");
const wholesale=read("catalogo-mayoreo.html");
const supabase=read("netlify/functions/supabase.js");
const pedidos=read("netlify/functions/pedidos.js");

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


console.log("✓ Public catalog smoke checks passed");
